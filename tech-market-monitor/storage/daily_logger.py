"""
Persists daily pipeline results to SQLite and exports them as JSON snapshots.

Schema (table: items)
─────────────────────
id          INTEGER PRIMARY KEY AUTOINCREMENT
date        TEXT        YYYY-MM-DD
item_type   TEXT        news | academic | enterprise_ir
source      TEXT
title       TEXT
url         TEXT UNIQUE
published   TEXT
summary     TEXT
llm_summary TEXT
content     TEXT
created_at  TEXT        ISO-8601 timestamp
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Generator

from loguru import logger

from config.settings import DAILY_LOGS_DIR, DB_PATH


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT NOT NULL,
    item_type   TEXT,
    source      TEXT,
    title       TEXT,
    url         TEXT UNIQUE,
    published   TEXT,
    summary     TEXT,
    llm_summary TEXT,
    content     TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_date ON items (date);
CREATE INDEX IF NOT EXISTS idx_source ON items (source);
"""

INSERT_SQL = """
INSERT OR IGNORE INTO items
    (date, item_type, source, title, url, published, summary, llm_summary, content, created_at)
VALUES
    (:date, :item_type, :source, :title, :url, :published, :summary, :llm_summary, :content, :created_at)
"""


class DailyLogger:
    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or DB_PATH
        self._init_db()

    # ── Public API ─────────────────────────────────────────────────────────────

    def save(self, items: list[dict]) -> int:
        today = date.today().isoformat()
        now = datetime.utcnow().isoformat()

        rows = [
            {
                "date": today,
                "item_type": item.get("item_type", ""),
                "source": item.get("source", ""),
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "published": item.get("published", ""),
                "summary": item.get("summary", ""),
                "llm_summary": item.get("llm_summary", ""),
                "content": item.get("content", ""),
                "created_at": now,
            }
            for item in items
        ]

        inserted = 0
        with self._connect() as conn:
            for row in rows:
                cursor = conn.execute(INSERT_SQL, row)
                inserted += cursor.rowcount

        self._export_json(today)
        logger.info(f"DailyLogger: saved {inserted}/{len(items)} new items for {today}")
        return inserted

    def load_date(self, target_date: str | None = None) -> list[dict]:
        """Return all items for a given YYYY-MM-DD (default: today)."""
        target = target_date or date.today().isoformat()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM items WHERE date = ? ORDER BY id", (target,)
            ).fetchall()
        return [dict(r) for r in rows]

    def load_month(self, year: int, month: int) -> list[dict]:
        """Return all items within a calendar month."""
        prefix = f"{year}-{month:02d}-%"
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM items WHERE date LIKE ? ORDER BY date, id", (prefix,)
            ).fetchall()
        return [dict(r) for r in rows]

    def get_cached_summaries(self, urls: list[str]) -> dict[str, str]:
        """Return {url: llm_summary} for URLs that already have a non-empty llm_summary."""
        if not urls:
            return {}
        placeholders = ",".join("?" * len(urls))
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT url, llm_summary FROM items"
                f" WHERE url IN ({placeholders})"
                f"   AND llm_summary IS NOT NULL AND llm_summary != ''",
                urls,
            ).fetchall()
        return {row["url"]: row["llm_summary"] for row in rows}

    # ── Internal ───────────────────────────────────────────────────────────────

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(CREATE_TABLE_SQL)

    def _export_json(self, target_date: str) -> None:
        items = self.load_date(target_date)
        json_path = DAILY_LOGS_DIR / f"{target_date}.json"
        json_path.write_text(
            json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.debug(f"JSON snapshot → {json_path}")

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
