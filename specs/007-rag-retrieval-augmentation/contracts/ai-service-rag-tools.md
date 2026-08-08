# ai-service RAG 相关契约

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Research**: [research.md](../research.md)

本文档覆盖 `app/ai-service` 侧新增的两类契约：① `semantic_cluster_tool`（场景 B，供 `AnalysisAgent` 调用）；② `ChatAgent` 新增的 `citation` SSE 事件（场景 C）。两者均不触及持久化存储（research.md §1/§2），检索类数据通过 `rag_client.py` 调用 q-server 的 [q-server-ai-rag.openapi.yaml](./q-server-ai-rag.openapi.yaml) 端点获取。

## 1. `semantic_cluster_tool`

新增至 `app/ai-service/src/tools/analysis_tools.py`，作为 `AnalysisAgent` 可调用的第 5 个工具，遵循现有工具（如既有关键词共现分析工具）的注册与错误处理约定。

### Input

```python
class SemanticClusterInput(BaseModel):
    survey_id: str            # 目标问卷 ID
    question_component_id: str  # 目标开放题的组件 ID
```

### Output

复用 data-model.md §4 已定义的 `SemanticClusterResult`：

```python
class SemanticClusterItem(BaseModel):
    label: str  # 主题标签/代表性描述
    representative_text: str  # 代表性原文
    sample_count: int  # 簇内样本数
    sentiment_score: float  # 情感倾向评分，范围 [-1, 1]


class SemanticClusterResult(BaseModel):
    clusters: list[SemanticClusterItem]
    noise_count: int  # 未能归类的噪声样本数（FR-011）
    insufficient_data: bool  # 样本量不足时为 True（FR-010），此时 clusters 为空
```

### 行为约定

- 工具内部通过 `SurveyAPIClient`（复用既有实现模式）拉取该题目下的全部开放题答卷原文，调用 `embedder.py` 做**一次性、不持久化**的 Embedding 计算（research.md §1/§2/§10），再交由 `clusterer.py` 的 `HDBSCAN` 实现聚类。
- 样本量不足（低于聚类算法可用的最小样本阈值）时返回 `insufficient_data=True` 且 `clusters=[]`，不抛出异常（对应 FR-010，与 FR-020 的降级要求一致）。
- Embedding Provider 调用失败或超时：捕获异常，返回 `insufficient_data=True`（视为"本次无法完成聚类"的降级结果），并记录 warn 级结构化日志；不得让整个 `AnalysisAgent` 流程中断（对应 FR-020/SC-006）。
- 情感打分复用现有 LLM 调用能力（research.md §7），若情感打分环节失败，`sentiment_score` 可返回 `0.0` 作为中性降级值，不影响聚类结果本身的返回。

## 2. `rag_client.py`（内部 HTTP 客户端）

新增至 `app/ai-service/src/tools/rag_client.py`，复用 `survey_client.py`（即 `SurveyAPIClient`）的实现模式：`httpx` 异步客户端 + `X-Internal-Api-Key` 头鉴权 + 现有超时/重试配置。

```python
class RagClient:
    async def search_knowledge(self, query: str, top_k: int = 5, alpha: float = 0.7) -> SearchResponse: ...
    async def search_templates(self, query: str, top_k: int = 5, alpha: float = 0.7) -> SearchResponse: ...
```

- 对应调用 q-server 的 `POST /api/ai/rag/knowledge/search` 与 `POST /api/ai/rag/templates/search`（见 [q-server-ai-rag.openapi.yaml](./q-server-ai-rag.openapi.yaml)），请求/响应结构与该契约的 `SearchRequest`/`SearchResponseEnvelope` 一一对应。
- 调用失败（超时/5xx/网络错误）时返回空结果列表并标记降级，不抛出异常向上传播，由调用方（`chat_agent.py`/`semantic_cluster_tool` 不使用该客户端）决定降级展示（对应 FR-020）。

## 3. `ChatAgent` 新增 `citation` SSE 事件

`app/ai-service/src/agents/chat_agent.py` 升级为 RAG Agent：回答问题前先调用 `rag_client.search_knowledge` 获取知识库片段，将命中片段作为上下文注入 LLM 调用，并在回答中提供可追溯引用（对应 FR-013/FR-014/FR-015）。

### 事件词表扩展

现有 SSE 事件词表：`status` / `token` / `tool_call` / `tool_result` / `done` / `error`。本功能新增 `citation`，**属于扩展而非替代**，与 `AnalysisAgent` 已有的 `status`/`tool_result` 扩展模式一致（plan.md Constitution Check Principle IX 已确认）。

```python
class Citation(BaseModel):
    document_title: str
    section: str | None
    chunk_id: str
    snippet: str  # 用于用户核实的原文片段
```

### SSE 负载示例

```text
event: citation
data: {"document_title": "问卷设计方法论手册 v2", "section": "3.2 量表题设计规范", "chunk_id": "1042", "snippet": "……建议采用 5 点或 7 点 Likert 量表……"}
```

### 行为约定

- `citation` 事件在对应内容的 `token` 事件之后、`done` 事件之前发出，每条引用对应一个独立事件（可多次发出）。
- 若 `rag_client.search_knowledge` 返回空结果（未检索到相关知识片段），`ChatAgent` 直接跳过 `citation` 事件的发送，并在回答文本中如实说明"未找到相关依据"（对应 FR-015），不得编造引用来源。
- 若检索调用本身失败/超时（`rag_client` 内部已降级为空结果），行为与"未检索到结果"一致，额外记录 warn 级日志，不中断整体问答流程（对应 FR-020/SC-006）。
