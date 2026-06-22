from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from src.config import PROJECT_ROOT
from src.models import SummarizedArticle
from src.summarizer import polish_korean

logger = logging.getLogger(__name__)

_OUTPUT_BASE = PROJECT_ROOT / "output" / "daily"


def save_daily_report(
    log_date: date,
    articles: list[SummarizedArticle],
    output_dir: Path | None = None,
    top_keywords: list[str] | None = None,
) -> Path | None:
    """Build and write a Markdown daily report, returning the saved path (or None if no articles)."""
    if not articles:
        logger.info("No articles to report for %s — skipping daily report", log_date)
        return None

    out_dir = output_dir or _OUTPUT_BASE
    out_dir.mkdir(parents=True, exist_ok=True)

    report_path = out_dir / f"{log_date.isoformat()}_daily_report.md"
    report_path.write_text(_build_markdown(log_date, articles, top_keywords), encoding="utf-8")
    logger.info("Daily Markdown report saved → %s", report_path)
    return report_path


def _cite(text: str, n: int) -> str:
    """Append an IEEE-style in-text citation bracket to a text string."""
    return f"{text.rstrip()} [{n}]"


def _build_summary_section(articles: list[SummarizedArticle]) -> list[str]:
    """Build an executive summary block covering all articles."""
    lines: list[str] = [
        "## 📋 전체 요약",
        "",
    ]

    # Article index table
    lines += [
        "| # | 제목 | 출처 | 카테고리 |",
        "|---|------|------|----------|",
    ]
    for i, a in enumerate(articles, start=1):
        lines.append(f"| [{i}] | {a.title} | {a.source_name} | {a.category} |")
    lines.append("")

    # Aggregated key trends (deduplicated, preserving order)
    seen: set[str] = set()
    all_trends: list[str] = []
    for a in articles:
        for t in a.key_trends:
            if t not in seen:
                seen.add(t)
                all_trends.append(t)

    if all_trends:
        lines += ["### 🔍 주요 트렌드 종합", ""]
        for trend in all_trends:
            lines.append(f"- {trend}")
        lines.append("")

    # One-line overview per article
    lines += ["### 📰 기사별 핵심 요점", ""]
    for i, a in enumerate(articles, start=1):
        if a.ko_summary_steps:
            first_step = polish_korean(a.ko_summary_steps[0])
        elif a.en_summary_steps:
            first_step = a.en_summary_steps[0]
        else:
            first_step = None
        if first_step:
            lines.append(f"**[{i}]** {first_step}")
        else:
            lines.append(f"**[{i}]** {a.llm_summary[:200]}…" if len(a.llm_summary) > 200 else f"**[{i}]** {a.llm_summary}")
        lines.append("")

    lines += ["---", ""]
    return lines


def _build_markdown(log_date: date, articles: list[SummarizedArticle], top_keywords: list[str] | None = None) -> str:
    lines: list[str] = []
    today_str = log_date.isoformat()

    # ── Header ──────────────────────────────────────────────────────────────
    lines += [
        f"# {log_date.year}년 {log_date.month:02d}월 기술 시장 조사",
        "",
        f"| 항목 | 내용 |",
        f"|------|------|",
        f"| **날짜** | {log_date.isoformat()} |",
        f"| **총 요약 기사 수** | {len(articles)}건 |",
        "",
        "---",
        "",
    ]

    # ── Executive summary ────────────────────────────────────────────────────
    lines += _build_summary_section(articles)

    for index, article in enumerate(articles, start=1):
        # ── Article heading ────────────────────────────────────────────────
        lines.append(f"## {index}. {article.title}")
        lines.append("")
        lines.append(f"> 🔗 [{article.url}]({article.url})")
        lines.append("")

        # ── Metadata table ────────────────────────────────────────────────
        pub = (
            article.published_at.strftime("%Y-%m-%d %H:%M")
            if article.published_at
            else "N/A"
        )
        kw_badges = " ".join(f"`{k}`" for k in article.matched_keywords)
        lines += [
            "| 항목 | 내용 |",
            "|------|------|",
            f"| **출처** | {article.source_name} |",
            f"| **카테고리** | {article.category} |",
            f"| **발행일** | {pub} |",
            f"| **매칭 키워드** | {kw_badges} |",
            "",
        ]

        # ── English summary ───────────────────────────────────────────────
        lines += [
            "### 🇬🇧 English Summary",
            "",
        ]
        if article.en_summary_steps:
            for step in article.en_summary_steps:
                lines.append(f"> {_cite(step, index)}")
                lines.append("")
        else:
            lines += [f"> {_cite(article.llm_summary, index)}", ""]

        # ── Korean summary ────────────────────────────────────────────────
        lines += [
            "### 🇰🇷 한국어 요약",
            "",
        ]
        if article.ko_summary_steps:
            for step in article.ko_summary_steps:
                lines.append(f"> {_cite(polish_korean(step), index)}")
                lines.append("")
        else:
            lines += ["> *(한국어 요약을 생성하지 못했습니다.)*", ""]

        # ── Key trends ────────────────────────────────────────────────────
        if article.key_trends:
            lines += ["### 📊 Key Trends", ""]
            for trend in article.key_trends:
                lines.append(f"- {trend}")
            lines.append("")

        # ── Keyword relevance (top 3 from keywords.txt) ──────────────────
        top_kw = (top_keywords or [])[:3]
        kw_badges_top = " ".join(f"`{k}`" for k in top_kw) if top_kw else ""
        header_line = f"**분석 기준 키워드 (파일 상위 3개): {kw_badges_top}**" if kw_badges_top else "**분석 기준 키워드**"
        lines += [
            "---",
            "",
            "### 🔑 키워드 관련성 및 시장적 의미",
            "",
            header_line,
            "",
        ]
        if article.keyword_relevance:
            lines.append(_cite(polish_korean(article.keyword_relevance), index))
        else:
            lines.append("*(키워드 관련성 설명을 생성하지 못했습니다.)*")
        lines.append("")

        lines += ["---", ""]

    # ── References section ────────────────────────────────────────────────
    lines += ["## 참고문헌 (References)", ""]
    for i, article in enumerate(articles, start=1):
        pub_date = (
            article.published_at.strftime("%Y-%m-%d") if article.published_at else "n.d."
        )
        lines.append(
            f'[{i}] {article.source_name}, "{article.title}," '
            f"{article.source_name}, {pub_date}. "
            f"[Online]. Available: {article.url} [Accessed: {today_str}]."
        )
    lines.append("")

    return "\n".join(lines)
