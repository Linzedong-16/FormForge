"""
文本预处理 — 分词 / 停用词过滤 / TF-IDF 关键词提取 / 词频统计

对应 contracts/function-calling-tools.md 工具 4（analyze_text_batch）的底层实现之一，
供 analysis_tools.py 与 topic_grouping.py 复用。纯本地计算，无网络调用（R4）。
"""

from __future__ import annotations

import re
from collections import Counter

import jieba
import jieba.analyse

# ─── 停用词表 ─────────────────────────────────────────────────
# jieba 默认不加载停用词，此处内置常用中文停用词 + 标点符号，
# 覆盖问卷开放题文本中最常见的无实际语义的功能词
STOPWORDS: frozenset[str] = frozenset(
    """
    的 了 在 是 我 有 和 就 不 人 都 一 一个 上 也 很 到 说 要 去 你 会 着
    没有 看 好 自己 这 那 这个 那个 这些 那些 与 及 或 但 而 且 因为 所以
    如果 虽然 但是 然后 因此 于是 并且 以及 之 其 之类 等 等等 呢 吧 啊
    么 什么 怎么 怎样 为什么 哪 哪里 哪个 谁 多少 几 可以 可能 应该 需要
    比较 非常 挺 还 还是 就是 只是 只 都是 觉得 感觉 希望 建议 认为
    对于 关于 由于 通过 进行 一些 一直 一般 一样 一点 目前 现在 已经
    """.split()
)

# 仅保留含中文/字母/数字的词，过滤纯标点与空白
_VALID_TOKEN_RE = re.compile(r"[一-龥a-zA-Z0-9]+")


def segment(text: str) -> list[str]:
    """分词 + 停用词过滤，返回有效词列表（过滤单字符噪声词与标点）"""
    tokens = jieba.lcut(text.strip())
    return [
        token
        for token in tokens
        if len(token) > 1 and token not in STOPWORDS and _VALID_TOKEN_RE.fullmatch(token)
    ]


def extract_keywords(texts: list[str], top_k: int = 20) -> list[dict]:
    """基于语料整体的 TF-IDF 关键词提取（jieba.analyse），返回 [{word, weight}]"""
    corpus = "\n".join(t for t in texts if t and t.strip())
    if not corpus.strip():
        return []

    tags = jieba.analyse.extract_tags(corpus, topK=top_k * 2, withWeight=True)
    keywords = [
        {"word": word, "weight": round(float(weight), 4)}
        for word, weight in tags
        if word not in STOPWORDS and _VALID_TOKEN_RE.fullmatch(word)
    ]
    return keywords[:top_k]


def extract_keywords_per_text(text: str, top_k: int = 5) -> list[str]:
    """单条文本的 TF-IDF 关键词（供 topic_grouping 做关键词重合度聚类）"""
    if not text or not text.strip():
        return []
    tags = jieba.analyse.extract_tags(text, topK=top_k, withWeight=False)
    return [word for word in tags if word not in STOPWORDS]


def word_frequency(texts: list[str], top_k: int = 20) -> list[dict]:
    """基于分词结果的词频统计（collections.Counter），返回 [{word, count}]"""
    counter: Counter[str] = Counter()
    for text in texts:
        if text and text.strip():
            counter.update(segment(text))

    return [{"word": word, "count": count} for word, count in counter.most_common(top_k)]
