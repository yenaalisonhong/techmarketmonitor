from __future__ import annotations

from src.fetchers.rss import RSSFetcher


def build_fetchers(sources: list[dict], keywords: list[str]) -> list[RSSFetcher]:
    """Instantiate one RSSFetcher per source entry."""
    fetchers: list[RSSFetcher] = []
    for source in sources:
        name = source.get("name", "Unknown")
        url = source.get("url", "")
        category = source.get("category", "general")
        if url:
            fetchers.append(RSSFetcher(name=name, url=url, category=category))
    return fetchers
