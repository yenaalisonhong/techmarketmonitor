"""Rebuild daily markdown reports from stored DB data — no LLM calls.

Usage:
    python rebuild_daily_markdown.py            # rebuilds all dates in DB
    python rebuild_daily_markdown.py 2026-06-23 # rebuilds one specific date
"""
from __future__ import annotations

import json
import sqlite3
import sys
from datetime import date, datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.config import load_settings
from src.daily_report import save_daily_report
from src.models import SummarizedArticle


def _row_to_article(row: sqlite3.Row) -> SummarizedArticle:
    published_at = None
    if row["published_at"]:
        try:
            published_at = datetime.fromisoformat(row["published_at"])
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    return SummarizedArticle(
        title=row["title"],
        url=row["url"],
        source_name=row["source_name"],
        category=row["category"],
        published_at=published_at,
        matched_keywords=json.loads(row["matched_keywords"] or "[]"),
        llm_summary=row["llm_summary"] or "",
        key_trends=json.loads(row["key_trends"] or "[]"),
        ko_summary_steps=json.loads(row["ko_summary_steps"] or "[]"),
        en_summary_steps=json.loads(row["en_summary_steps"] or "[]"),
    )


def rebuild(target_date: date, settings) -> None:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM daily_logs WHERE log_date = ? ORDER BY id ASC",
        (target_date.isoformat(),),
    ).fetchall()
    conn.close()

    if not rows:
        print(f"[SKIP] No entries for {target_date.isoformat()}")
        return

    articles = [_row_to_article(r) for r in rows]
    path = save_daily_report(
        target_date,
        articles,
        top_keywords=settings.keywords[:3],
    )
    print(f"[OK]   {target_date.isoformat()} - {len(articles)} articles -> {path}")


def main() -> None:
    settings = load_settings()

    if len(sys.argv) > 1:
        dates = [date.fromisoformat(sys.argv[1])]
    else:
        # Rebuild all dates present in the DB
        conn = sqlite3.connect(settings.database_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT DISTINCT log_date FROM daily_logs ORDER BY log_date ASC"
        ).fetchall()
        conn.close()
        dates = [date.fromisoformat(r["log_date"]) for r in rows]

    if not dates:
        print("No data found in database.")
        return

    print(f"Rebuilding {len(dates)} date(s): {[d.isoformat() for d in dates]}")
    for d in dates:
        rebuild(d, settings)


if __name__ == "__main__":
    main()
