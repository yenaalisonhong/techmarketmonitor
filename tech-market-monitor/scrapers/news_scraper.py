"""
Collects articles from tech news RSS feeds (TechCrunch, Wired, etc.)
and falls back to lightweight HTML scraping when a feed is unavailable.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import feedparser
import requests
from bs4 import BeautifulSoup
from loguru import logger

from config.settings import NEWS_RSS_FEEDS, NEWS_MAX_PER_FEED


@dataclass
class NewsItem:
    source: str
    title: str
    url: str
    published: str
    summary: str
    content: str = ""
    item_type: str = "news"
    raw: dict[str, Any] = field(default_factory=dict)


class NewsScraper:
    """Fetches articles from configured RSS feeds."""

    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; TechMarketMonitor/1.0; "
            "+https://github.com/your-org/tech-market-monitor)"
        )
    }
    REQUEST_TIMEOUT = 15
    FEED_DELAY = 0.5  # seconds between feed requests

    def fetch(self) -> list[dict]:
        items: list[dict] = []
        for source, url in NEWS_RSS_FEEDS.items():
            try:
                feed_items = self._fetch_feed(source, url)
                items.extend(feed_items)
                logger.debug(f"[{source}] collected {len(feed_items)} items")
            except Exception as exc:
                logger.warning(f"[{source}] failed: {exc}")
            time.sleep(self.FEED_DELAY)
        return items

    def _fetch_feed(self, source: str, url: str) -> list[dict]:
        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            raise ValueError(f"feedparser bozo error: {feed.bozo_exception}")

        results: list[dict] = []
        for entry in feed.entries[: NEWS_MAX_PER_FEED]:
            summary = entry.get("summary", "")
            if summary:
                summary = BeautifulSoup(summary, "lxml").get_text(separator=" ").strip()

            published = entry.get("published", entry.get("updated", ""))

            item = NewsItem(
                source=source,
                title=entry.get("title", "").strip(),
                url=entry.get("link", ""),
                published=published,
                summary=summary,
                raw=dict(entry),
            )
            results.append(self._to_dict(item))
        return results

    def scrape_full_text(self, url: str) -> str:
        """Optionally fetch and extract the main article text from a URL."""
        try:
            resp = requests.get(url, headers=self.HEADERS, timeout=self.REQUEST_TIMEOUT)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()

            article = soup.find("article") or soup.find("main") or soup.body
            if article is None:
                return ""
            return article.get_text(separator="\n", strip=True)[:5000]
        except Exception as exc:
            logger.debug(f"Full-text scrape failed for {url}: {exc}")
            return ""

    @staticmethod
    def _to_dict(item: NewsItem) -> dict:
        return {
            "item_type": item.item_type,
            "source": item.source,
            "title": item.title,
            "url": item.url,
            "published": item.published,
            "summary": item.summary,
            "content": item.content,
        }
