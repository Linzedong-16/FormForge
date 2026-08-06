"""clusterer.py 单元测试（对应 tasks.md T024）

覆盖范围：
  - 正常聚类输出 clusters/noise_count（noise/簇归属由 HDBSCAN mock 固定，避免依赖
    真实聚类算法的不确定性）
  - 样本量不足聚类最小阈值时返回 insufficient_data=True 且 clusters=[]
  - HDBSCAN 判定全部样本为噪声（无法形成任何有效簇）时同样返回 insufficient_data=True
  - 情感打分（LLM 调用）失败时单个簇的 sentiment_score 降级为 0.0，不影响聚类结果本身
"""

from __future__ import annotations

import numpy as np
import pytest

from src.rag import clusterer


class _FakeHDBSCAN:
    """固定返回预设 labels 的 HDBSCAN 替身，避免测试依赖真实聚类算法的不确定性"""

    def __init__(self, labels: np.ndarray) -> None:
        self._labels = labels

    def __call__(self, **kwargs) -> "_FakeHDBSCAN":
        return self

    def fit_predict(self, matrix: np.ndarray) -> np.ndarray:
        return self._labels


class _FakeSentimentModel:
    """固定返回某个情感分数的假 LLM 模型"""

    def __init__(self, score_text: str) -> None:
        self._score_text = score_text

    async def ainvoke(self, prompt: str):
        class _Response:
            content = self._score_text

        return _Response()


class _FailingSentimentModel:
    """情感打分调用必定抛出异常的假 LLM 模型"""

    async def ainvoke(self, prompt: str):
        raise ConnectionError("情感打分 Provider 暂时不可用")


def _fake_vectors(count: int, dim: int = 3) -> list[list[float]]:
    """生成任意可参与质心计算的向量（HDBSCAN 本身被 mock，向量取值不影响聚类结果）"""
    return [[float(i), float(i) * 2, float(dim)] for i in range(count)]


@pytest.mark.asyncio
async def test_cluster_texts_insufficient_sample_size_returns_empty_clusters(monkeypatch):
    """样本量低于 MIN_SAMPLES_FOR_CLUSTERING 时应直接返回 insufficient_data=True，不调用 HDBSCAN"""

    def _fail_if_called(**kwargs):
        raise AssertionError("样本量不足时不应尝试聚类")

    monkeypatch.setattr(clusterer, "HDBSCAN", _fail_if_called)

    texts = ["文本一", "文本二", "文本三"]
    result = await clusterer.cluster_texts(texts, _fake_vectors(len(texts)))

    assert result.insufficient_data is True
    assert result.clusters == []
    assert result.noise_count == 0


@pytest.mark.asyncio
async def test_cluster_texts_normal_output_has_clusters_and_noise_count(monkeypatch):
    """正常聚类：应正确划分簇、统计 sample_count，并附带情感打分"""
    texts = ["文本A1", "文本A2", "文本A3", "文本B1", "文本B2", "噪声文本"]
    # 前 3 条归为簇 0，中间 2 条归为簇 1，最后 1 条为噪声（-1）
    labels = np.array([0, 0, 0, 1, 1, -1])
    monkeypatch.setattr(clusterer, "HDBSCAN", _FakeHDBSCAN(labels))
    monkeypatch.setattr(clusterer, "get_default_model", lambda: _FakeSentimentModel("0.5"))

    result = await clusterer.cluster_texts(texts, _fake_vectors(len(texts)))

    assert result.insufficient_data is False
    assert result.noise_count == 1
    assert len(result.clusters) == 2

    sample_counts = sorted(c.sample_count for c in result.clusters)
    assert sample_counts == [2, 3]
    assert all(c.sentiment_score == 0.5 for c in result.clusters)
    assert all(c.representative_text in texts for c in result.clusters)
    assert all(c.label for c in result.clusters)


@pytest.mark.asyncio
async def test_cluster_texts_all_noise_treated_as_insufficient_data(monkeypatch):
    """HDBSCAN 判定全部样本为噪声（无法形成任何簇）时同样应视为数据不足"""
    texts = ["文本一", "文本二", "文本三", "文本四", "文本五", "文本六"]
    labels = np.array([-1, -1, -1, -1, -1, -1])
    monkeypatch.setattr(clusterer, "HDBSCAN", _FakeHDBSCAN(labels))

    result = await clusterer.cluster_texts(texts, _fake_vectors(len(texts)))

    assert result.insufficient_data is True
    assert result.clusters == []
    assert result.noise_count == 6


@pytest.mark.asyncio
async def test_cluster_texts_sentiment_scoring_failure_degrades_to_zero(monkeypatch):
    """情感打分 LLM 调用失败时，对应簇的 sentiment_score 应降级为 0.0，不影响聚类本身"""
    texts = ["文本A1", "文本A2", "文本A3", "文本B1", "文本B2", "文本B3"]
    labels = np.array([0, 0, 0, 1, 1, 1])
    monkeypatch.setattr(clusterer, "HDBSCAN", _FakeHDBSCAN(labels))
    monkeypatch.setattr(clusterer, "get_default_model", lambda: _FailingSentimentModel())

    result = await clusterer.cluster_texts(texts, _fake_vectors(len(texts)))

    assert result.insufficient_data is False
    assert len(result.clusters) == 2
    assert all(c.sentiment_score == 0.0 for c in result.clusters)
