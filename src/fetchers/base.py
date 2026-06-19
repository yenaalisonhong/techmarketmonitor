from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser

from src.models import RawArticle

logger = logging.getLogger(__name__)


def _parse_published(entry: dict) -> datetime | None:
    for key in ("published_parsed", "updated_parsed"):
        parsed = entry.get(key)
        if parsed:
            return datetime(*parsed[:6], tzinfo=timezone.utc)

    for key in ("published", "updated"):
        raw = entry.get(key)
        if not raw:
            continue
        try:
            return parsedate_to_datetime(raw)
        except (TypeError, ValueError):
            continue
    return None


class BaseFetcher(ABC):
    @abstractmethod
    def fetch(self) -> list[RawArticle]:
        raise NotImplementedError


class RSSFetcher(BaseFetcher):
    def __init__(self, name: str, url: str, category: str) -> None:
        self.name = name
        self.url = url
        self.category = category

    def fetch(self) -> list[RawArticle]:
        logger.info("Fetching RSS feed: %s", self.name)
        parsed = feedparser.parse(self.url)
        articles: list[RawArticle] = []

        for entry in parsed.entries:
            link = entry.get("link", "").strip()
            title = entry.get("title", "").strip()
            if not link or not title:
                continue

            summary = entry.get("summary", entry.get("description", "")).strip()
            articles.append(
                RawArticle(
                    title=title,
                    url=link,
                    summary=summary,
                    source_name=self.name,
                    category=self.category,
                    published_at=_parse_published(entry),
                )
            )

        logger.info("Fetched %d articles from %s", len(articles), self.name)
        return articles
