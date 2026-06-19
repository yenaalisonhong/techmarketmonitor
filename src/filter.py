from __future__ import annotations

import re

from src.models import FilteredArticle, RawArticle

_HTML_TAG = re.compile(r"<[^>]+>")


def _normalize(text: str) -> str:
    cleaned = _HTML_TAG.sub(" ", text)
    return " ".join(cleaned.lower().split())


def match_keywords(text: str, keywords: list[str]) -> list[str]:
    normalized = _normalize(text)
    return [keyword for keyword in keywords if keyword in normalized]


def filter_articles(
    articles: list[RawArticle],
    keywords: list[str],
) -> list[FilteredArticle]:
    filtered: list[FilteredArticle] = []
    seen_urls: set[str] = set()

    for article in articles:
        if article.url in seen_urls:
            continue

        searchable = " ".join([article.title, article.summary, article.source_name])
        matched = match_keywords(searchable, keywords)
        if not matched:
            continue

        seen_urls.add(article.url)
        filtered.append(
            FilteredArticle(
                title=article.title,
                url=article.url,
                summary=article.summary,
                source_name=article.source_name,
                category=article.category,
                published_at=article.published_at,
                matched_keywords=matched,
            )
        )

    return filtered
