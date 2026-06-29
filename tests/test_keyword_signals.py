"""Tests for executive-summary keyword signal lines (not fact duplicates)."""
from __future__ import annotations

from datetime import datetime, timezone

from src.daily_report import _build_keyword_signals, _exec_summary_item
from src.models import SummarizedArticle


def _article(title: str, matched: list[str], **overrides) -> SummarizedArticle:
    base = dict(
        title=title,
        url=f"https://example.com/{hash(title) % 10_000}",
        source_name="TechCrunch",
        category="tech_news",
        published_at=datetime(2026, 6, 28, 14, 1, tzinfo=timezone.utc),
        matched_keywords=matched,
        llm_summary="Summary. Source: https://example.com",
        key_trends=[],
        ko_summary_steps=[
            f"**개요:** {title} 관련 내용임.",
            "**핵심:** 2032년까지 $30억 규모 프로젝트로 예상됨.",
        ],
        en_summary_steps=[],
        keyword_relevance="",
        ko_one_liner="",
    )
    base.update(overrides)
    return SummarizedArticle(**base)


def _item(article: SummarizedArticle, kws: list[str]):
    row = _exec_summary_item(article, kws)
    assert row is not None
    return (article, *row)


def test_indirect_signals_explain_classification_not_facts():
    kws = ["전력계통", "파워그리드", "스마트그리드"]
    a1 = _article(
        "AI Startup Firmus to Build Indonesia Data Center With Nvidia",
        ["data center"],
    )
    a2 = _article(
        "SoftBank CEO questions Elon Musk orbital data center hype",
        ["data center"],
    )
    items = [_item(a1, kws), _item(a2, kws)]
    signals = _build_keyword_signals(items, kws)

    assert len(signals) == 1
    line = signals[0]
    assert "간접" in line
    assert "데이터센터" in line
    assert "전력계통" in line
    assert "오늘 2건" in line
    assert "1차 주제" in line
    assert "Firmus" not in line
    assert "$30억" not in line


def test_direct_signal_explains_keyword_link():
    kws = ["전력계통", "파워그리드", "스마트그리드"]
    article = _article(
        "What Europe's heat wave means for the power grid",
        ["power grid"],
        ko_one_liner=(
            "유럽 폭염이 전력계통에 부담을 주며 향후 전기 수요 30% 증가가 예상됨."
        ),
    )
    items = [_item(article, kws)]
    signals = _build_keyword_signals(items, kws)

    assert len(signals) == 1
    line = signals[0]
    assert "직접" in line
    assert "직접' 연관" in line or "직접 연관" in line
    assert "30%" not in line
    assert "폭염" not in line
