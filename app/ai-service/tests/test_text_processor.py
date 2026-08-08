"""text_processor.py 单元测试 —— 分词/关键词提取/词频统计核心路径"""

from __future__ import annotations

from src.analysis.text_processor import (
    extract_keywords,
    extract_keywords_per_text,
    segment,
    word_frequency,
)


def test_segment_filters_stopwords_and_punctuation():
    """分词结果应过滤停用词、单字符噪声词与标点，仅保留有效词"""
    tokens = segment("这个功能非常好用，界面也很美观！")
    assert "这个" not in tokens
    assert "，" not in tokens
    assert "功能" in tokens
    assert "美观" in tokens


def test_segment_empty_text_returns_empty_list():
    """空白文本分词应返回空列表，不抛出异常"""
    assert segment("") == []
    assert segment("   ") == []


def test_extract_keywords_returns_weighted_words_within_top_k():
    """TF-IDF 关键词提取应返回不超过 top_k 条，且每条含 word/weight 字段"""
    texts = ["界面设计非常美观，操作流程也很流畅", "界面设计有待改进，操作流程比较繁琐"]
    keywords = extract_keywords(texts, top_k=5)
    assert len(keywords) <= 5
    for item in keywords:
        assert "word" in item and "weight" in item
        assert isinstance(item["weight"], float)


def test_extract_keywords_empty_corpus_returns_empty_list():
    """全空白语料应直接返回空列表，不调用 jieba.analyse"""
    assert extract_keywords(["", "   "], top_k=10) == []


def test_extract_keywords_per_text_returns_words_only():
    """单条文本关键词提取应返回纯词语列表（无权重），供主题聚类使用"""
    keywords = extract_keywords_per_text("界面设计非常美观，操作流程也很流畅", top_k=3)
    assert len(keywords) <= 3
    assert all(isinstance(word, str) for word in keywords)


def test_extract_keywords_per_text_empty_text_returns_empty_list():
    """空文本应直接返回空列表"""
    assert extract_keywords_per_text("", top_k=5) == []


def test_word_frequency_counts_repeated_words_across_texts():
    """词频统计应跨多条文本累加同一词的出现次数，并按频次降序排列"""
    texts = ["价格实惠质量好", "价格实惠但物流慢", "价格实惠推荐购买"]
    freq = word_frequency(texts, top_k=10)
    words = {item["word"]: item["count"] for item in freq}
    assert words.get("价格") == 3
    assert freq[0]["word"] == "价格"


def test_word_frequency_empty_texts_returns_empty_list():
    """全空文本列表应返回空统计结果"""
    assert word_frequency(["", "   "], top_k=10) == []
