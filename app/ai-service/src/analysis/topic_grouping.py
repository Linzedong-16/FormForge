"""
轻量主题聚类（R5：基于关键词重合度贪心分组，无 embedding、无网络调用）

依赖 text_processor.extract_keywords_per_text() 提取的单条文本关键词集合，
按 Jaccard 相似度贪心归并到已有分组或新建分组，组标签取组内出现频次最高的关键词。
"""

from __future__ import annotations

from collections import Counter

from .text_processor import extract_keywords_per_text


def group_by_keyword_cooccurrence(
    texts: list[str],
    per_text_top_k: int = 5,
    overlap_threshold: float = 0.34,
    max_clusters: int = 10,
    sample_size: int = 3,
) -> list[dict]:
    """基于关键词重合度的轻量聚类，返回按簇内文本数量降序排列的 [{label, sample_texts, count}]

    Args:
        texts: 待聚类的原始文本列表
        per_text_top_k: 每条文本参与聚类的关键词数量上限
        overlap_threshold: 两个关键词集合的 Jaccard 相似度达到该阈值才归并为同一簇
        max_clusters: 返回的簇数量上限（按簇内文本数量降序截取）
        sample_size: 每个簇携带的样例原文数量
    """
    # 每个簇维护：关键词并集（用于相似度计算）、关键词出现次数（用于取标签）、原文列表
    clusters: list[dict] = []

    for text in texts:
        if not text or not text.strip():
            continue

        keywords = set(extract_keywords_per_text(text, top_k=per_text_top_k))
        if not keywords:
            continue

        best_cluster = None
        best_score = 0.0
        for cluster in clusters:
            union = keywords | cluster["keywords"]
            if not union:
                continue
            score = len(keywords & cluster["keywords"]) / len(union)
            if score > best_score:
                best_score = score
                best_cluster = cluster

        if best_cluster is not None and best_score >= overlap_threshold:
            best_cluster["keywords"] |= keywords
            best_cluster["keyword_counter"].update(keywords)
            best_cluster["texts"].append(text)
        else:
            clusters.append(
                {
                    "keywords": set(keywords),
                    "keyword_counter": Counter(keywords),
                    "texts": [text],
                }
            )

    clusters.sort(key=lambda c: len(c["texts"]), reverse=True)

    result = []
    for cluster in clusters[:max_clusters]:
        label = (
            cluster["keyword_counter"].most_common(1)[0][0]
            if cluster["keyword_counter"]
            else "未分类"
        )
        result.append(
            {
                "label": label,
                "sample_texts": cluster["texts"][:sample_size],
                "count": len(cluster["texts"]),
            }
        )
    return result
