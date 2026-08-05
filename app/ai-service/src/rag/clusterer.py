"""
语义聚类模块（场景 B：开放题答卷语义主题聚类，对应 tasks.md T026）

职责：对 embedder.py 产出的向量做 HDBSCAN 聚类，为每个簇生成主题标签、代表性原文、
样本数量，并复用现有 LLM 调用能力对代表句做情感打分。全程只在内存中处理向量，
不写入任何数据库或缓存，随请求生命周期结束即释放（research.md §1/§2/§10）。

聚类算法选型：scikit-learn 内置的 HDBSCAN（research.md §7），而非独立的 hdbscan
PyPI 包，避免引入 C 扩展编译依赖。
"""

from __future__ import annotations

import logging

import numpy as np
from sklearn.cluster import HDBSCAN

from ..analysis.text_processor import extract_keywords_per_text
from ..llm.factory import get_default_model
from ..models.schemas import SemanticClusterItem, SemanticClusterResult

logger = logging.getLogger(__name__)

# 聚类可用性最小样本数：设计文档未给出精确数值（FR-010 仅要求识别"数据量不足"），
# 取经验值：低于该值直接判定 insufficient_data，不尝试聚类
MIN_SAMPLES_FOR_CLUSTERING = 5

# HDBSCAN 最小簇规模：低于该规模的样本点归为噪声（cluster label == -1），
# 避免产生仅含 1~2 条样本的无意义"簇"
HDBSCAN_MIN_CLUSTER_SIZE = 3


async def cluster_texts(texts: list[str], vectors: list[list[float]]) -> SemanticClusterResult:
    """对开放题答卷文本做语义聚类

    Args:
        texts: 答卷原文列表
        vectors: 与 texts 一一对应的向量数组（由 embedder.py 产出）

    Returns:
        SemanticClusterResult：样本量不足或聚类后无有效簇时 insufficient_data=True
    """
    if len(texts) < MIN_SAMPLES_FOR_CLUSTERING:
        return SemanticClusterResult(clusters=[], noise_count=0, insufficient_data=True)

    matrix = np.array(vectors)
    labels = HDBSCAN(min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE).fit_predict(matrix)

    noise_count = int(np.sum(labels == -1))

    clusters: list[SemanticClusterItem] = []
    for cluster_label in sorted(label for label in set(labels) if label != -1):
        member_indices = [i for i, label in enumerate(labels) if label == cluster_label]
        member_texts = [texts[i] for i in member_indices]
        member_vectors = matrix[member_indices]

        representative_text = _pick_representative_text(member_texts, member_vectors)
        clusters.append(
            SemanticClusterItem(
                label=_derive_label(representative_text),
                representative_text=representative_text,
                sample_count=len(member_indices),
                sentiment_score=await _score_sentiment(representative_text),
            )
        )

    # 全部样本均被判定为噪声（无法形成任何有效簇）时，同样视为数据不足以支撑聚类
    if not clusters:
        return SemanticClusterResult(clusters=[], noise_count=noise_count, insufficient_data=True)

    return SemanticClusterResult(clusters=clusters, noise_count=noise_count, insufficient_data=False)


def _pick_representative_text(texts: list[str], vectors: np.ndarray) -> str:
    """选取簇内距质心欧氏距离最近的文本作为代表性原文"""
    centroid = vectors.mean(axis=0)
    distances = np.linalg.norm(vectors - centroid, axis=1)
    return texts[int(np.argmin(distances))]


def _derive_label(representative_text: str) -> str:
    """基于本地 TF-IDF 关键词提取生成主题标签

    FR-009 允许标签为"主题标签（或代表性描述）"，故此处复用现有本地关键词提取能力，
    不额外发起 LLM 调用（仅情感打分按 research.md §7 要求复用 LLM）
    """
    keywords = extract_keywords_per_text(representative_text, top_k=3)
    return "、".join(keywords) if keywords else representative_text[:10]


async def _score_sentiment(text: str) -> float:
    """复用现有 LLM 调用能力对代表句做情感打分，范围 [-1, 1]

    调用失败时按契约降级为 0.0，不中断整体聚类流程
    """
    try:
        model = get_default_model()
        response = await model.ainvoke(
            "请对以下文本的情感倾向打分，取值范围为 -1（非常负面）到 1（非常正面）的小数，"
            f"只输出这一个数字，不要输出任何其他文字：\n{text}"
        )
        score = float(str(response.content).strip())
        return max(-1.0, min(1.0, score))
    except Exception as exc:  # noqa: BLE001 — 情感打分失败统一降级为 0.0，交由调用方感知
        logger.warning("情感打分失败，降级为 sentiment_score=0.0：%s", exc)
        return 0.0
