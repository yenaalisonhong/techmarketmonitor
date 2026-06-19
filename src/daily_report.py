from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from src.config import PROJECT_ROOT
from src.models import SummarizedArticle

logger = logging.getLogger(__name__)

_OUTPUT_BASE = PROJECT_ROOT / "output" / "daily"


def save_daily_report(
    log_date: date,
    articles: list[SummarizedArticle],
    output_dir: Path | None = None,
) -> Path | None:
    """Build and write a Markdown daily report, returning the saved path (or None if no articles)."""
    if not articles:
        logger.info("No articles to report for %s — skipping daily report", log_date)
        return None

    out_dir = output_dir or _OUTPUT_BASE
    out_dir.mkdir(parents=True, exist_ok=True)

    report_path = out_dir / f"{log_date.isoformat()}_daily_report.md"
    report_path.write_text(_build_markdown(log_date, articles), encoding="utf-8")
    logger.info("Daily Markdown report saved → %s", report_path)
    return report_path


def _build_markdown(log_date: date, articles: list[SummarizedArticle]) -> str:
    lines: list[str] = []

    # ── Header ──────────────────────────────────────────────────────────────
    lines += [
        "# 📰 Daily News Summary Report",
        "",
        f"| 항목 | 내용 |",
        f"|------|------|",
        f"| **날짜** | {log_date.isoformat()} |",
        f"| **총 요약 기사 수** | {len(articles)}건 |",
        "",
        "---",
        "",
    ]

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

        # ── English 5-step summary ────────────────────────────────────────
        lines += [
            "### 🇬🇧 English Summary (5-Step Structure)",
            "",
        ]
        if article.en_summary_steps:
            for step in article.en_summary_steps:
                lines.append(f"> {step}")
                lines.append("")
        else:
            lines += [f"> {article.llm_summary}", ""]

        # ── Korean 5-step summary ─────────────────────────────────────────
        lines += [
            "### 🇰🇷 한국어 요약 (5단계 구조)",
            "",
        ]
        if article.ko_summary_steps:
            for step in article.ko_summary_steps:
                lines.append(f"> {step}")
                lines.append("")
        else:
            lines += ["> *(한국어 요약을 생성하지 못했습니다.)*", ""]

        # ── Key trends ────────────────────────────────────────────────────
        if article.key_trends:
            lines += ["### 📊 Key Trends", ""]
            for trend in article.key_trends:
                lines.append(f"- {trend}")
            lines.append("")

        lines += ["---", ""]

    return "\n".join(lines)
