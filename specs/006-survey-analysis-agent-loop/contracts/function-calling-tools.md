# Contract: Function Calling 工具接口定义

**对应**：spec.md 附录 D | FR-003 | data-model.md 第 2/3/4/5 节

> 本文档定义 Agent 自主循环中可供模型 `bind_tools()` 绑定的四个工具的输入/输出契约。所有工具均以 JSON Schema 描述入参，出参为可 JSON 序列化的结构化数据。工具声明层（`src/tools/analysis_tools.py`）负责将本文档的定义转化为 LangChain `Tool`/`StructuredTool` 对象，本文档不包含具体实现代码。

## 通用契约（适用于全部 4 个工具）

1. 出参必须是可 JSON 序列化的结构化数据；禁止直接返回未处理的超长原始文本块（大文本必须先摘要/截断）。
2. 每次调用无论成功或失败都必须产生 `ToolMessage` 反馈给模型；失败时 `ToolMessage` 内容需为 `{ "error": true, "message": "..." }`。
3. 工具 schema 定义与 `AI_PROVIDER` 无关，仅在 `llm/factory.py` 中通过 `bind_tools()` 统一接入（FR-008）。
4. 数据类工具（前三个）的底层 HTTP 调用失败时，遵循 research.md R3 的有限重试策略（建议 2 次），重试耗尽后返回结构化错误而非抛出未捕获异常。

---

## 工具 1：`get_survey_structure`（数据类）

**用途**：获取问卷元信息与题目结构，几乎每次循环的第一步都会调用。

**底层依赖**：q-server **新增** `GET /api/admin/surveys/:id`（见 [survey-structure-endpoint.md](./survey-structure-endpoint.md)）。

**输入 Schema**：

```json
{
  "type": "object",
  "properties": {
    "survey_id": { "type": "string", "description": "问卷唯一标识" }
  },
  "required": ["survey_id"]
}
```

**输出结构**（成功）：

```json
{
  "survey_id": "string",
  "title": "string",
  "description": "string | null",
  "questions": [{ "id": "string", "type": "string", "title": "string", "required": true, "options": ["string"] }]
}
```

**输出结构**（失败，如 `survey_id` 不存在）：

```json
{ "error": true, "message": "问卷不存在或已被删除" }
```

---

## 工具 2：`get_survey_stats`（数据类）

**用途**：获取逐题聚合统计，是判断"是否需要更深入查询"的主要依据。

**底层依赖**：已存在 `GET /api/admin/surveys/:id/stats`（`SurveyStatsService`），无需改动。

**输入 Schema**：

```json
{
  "type": "object",
  "properties": {
    "survey_id": { "type": "string", "description": "问卷唯一标识" }
  },
  "required": ["survey_id"]
}
```

**输出结构**：复用现状 `SurveyStatsService.getSurveyStats()` 输出（逐题分布 + 均值/极值 + 每题最多 10 条文本抽样），字段结构参见 `app/q-server/src/modules/survey/survey-stats/survey-stats.service.ts` 现有实现，本方案不改动其结构。

---

## 工具 3：`list_survey_responses`（数据类）

**用途**：当 `get_survey_stats` 的抽样不足以支撑可靠结论时，分页拉取更多原始答卷/答案明细。

**底层依赖**：**替换**现状失效的 `get_survey_responses`（q-server 中不存在对应路由），改为调用已存在的 `GET /api/admin/surveys/:id/responses`。

**输入 Schema**：

```json
{
  "type": "object",
  "properties": {
    "survey_id": { "type": "string", "description": "问卷唯一标识" },
    "page": { "type": "integer", "default": 1, "description": "页码" },
    "page_size": { "type": "integer", "default": 50, "maximum": 100, "description": "单页数量，上限 100" },
    "question_id": { "type": "string", "description": "按题目筛选（可选）" },
    "keyword": { "type": "string", "description": "文本内容搜索（可选）" }
  },
  "required": ["survey_id"]
}
```

**输出结构**：

```json
{
  "total": 0,
  "page": 1,
  "page_size": 50,
  "items": [
    { "response_id": "string", "submitted_at": "ISO8601", "answers": [{ "question_id": "string", "value": "any" }] }
  ]
}
```

**调用时机约束**：Agent 应仅在判断 `get_survey_stats` 返回的抽样明确不足时才调用本工具（默认策略），避免无条件全量拉取；单次分析全生命周期总拉取量建议软上限 500 条（超过后强制转入降级结论生成）。

---

## 工具 4：`analyze_text_batch`（本地计算类，无网络调用）

**用途**：对一批开放题文本做分词、关键词提取、词频统计、初步主题分组，将原始文本压缩为结构化摘要。

**输入 Schema**：

```json
{
  "type": "object",
  "properties": {
    "texts": { "type": "array", "items": { "type": "string" }, "description": "待分析的原始文本列表" },
    "top_k": { "type": "integer", "default": 20, "description": "返回的关键词/词频条目数上限" }
  },
  "required": ["texts"]
}
```

**输出结构**：

```json
{
  "keywords": [{ "word": "string", "weight": 0.0 }],
  "word_freq": [{ "word": "string", "count": 0 }],
  "clusters": [{ "label": "string", "sample_texts": ["string"], "count": 0 }]
}
```

**实现方案**：jieba 分词 + 停用词过滤 + TF-IDF（`jieba.analyse`）关键词提取 + `collections.Counter` 词频统计 + 基于共现关键词的轻量聚类（详见 research.md R5、spec.md 附录 E）。输入规模由调用方（Agent 编排层）负责控制在合理范围内（research.md R4），工具本身不强制截断。
