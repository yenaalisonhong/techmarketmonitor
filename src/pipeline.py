from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone

from src.config import Settings, load_settings, load_sources
from src.daily_report import save_daily_report
from src.fetchers.registry import build_fetchers
from src.filter import filter_articles
from src.models import RawArticle
from src.storage import DailyLogStore
from src.summarizer import Summarizer

logger = logging.getLogger(__name__)

_MAX_AGE_HOURS = 24
# Groq free tier: ~100k tokens/day. Each article uses ~2,500 tokens → cap at 30.
# Override with MAX_ARTICLES_PER_RUN env var if needed.
_MAX_ARTICLES_PER_RUN = int(os.getenv("MAX_ARTICLES_PER_RUN", "30"))


def _within_24h(articles: list[RawArticle]) -> list[RawArticle]:
    """Keep only articles published within the last 24 hours.

    Articles with no published_at are kept (we cannot determine their age).
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=_MAX_AGE_HOURS)
    recent: list[RawArticle] = []
    for article in articles:
        if article.published_at is None:
            recent.append(article)
            continue
        pub = article.published_at
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=timezone.utc)
        if pub >= cutoff:
            recent.append(article)
        else:
            logger.debug("Skipping old article (%s): %s", pub.date(), article.title[:60])
    return recent


def run_daily_monitor(log_date: date | None = None, settings: Settings | None = None) -> dict:
    settings = settings or load_settings()
    log_date = log_date or date.today()

    keywords = settings.keywords
    if not keywords:
        raise ValueError("No keywords configured — check keywords.txt in project root")

    sources = load_sources()
    fetchers = build_fetchers(sources, keywords)

    raw_articles = []
    for fetcher in fetchers:
        try:
            raw_articles.extend(fetcher.fetch())
        except Exception as exc:
            logger.error("Fetcher failed (%s): %s", fetcher.__class__.__name__, exc)

    recent_articles = _within_24h(raw_articles)
    logger.info(
        "24h filter: %d → %d articles (dropped %d old)",
        len(raw_articles),
        len(recent_articles),
        len(raw_articles) - len(recent_articles),
    )

    filtered = filter_articles(recent_articles, keywords)
    logger.info("Filtered to %d keyword-matching articles", len(filtered))

    # Sort by relevance (most matched keywords first) and cap to avoid blowing token limits.
    filtered.sort(key=lambda a: len(a.matched_keywords), reverse=True)
    if len(filtered) > _MAX_ARTICLES_PER_RUN:
        logger.info(
            "Capping summarization to top %d articles (dropped %d lower-relevance)",
            _MAX_ARTICLES_PER_RUN,
            len(filtered) - _MAX_ARTICLES_PER_RUN,
        )
        filtered = filtered[:_MAX_ARTICLES_PER_RUN]

    if not filtered:
        return {
            "log_date": log_date.isoformat(),
            "fetched": len(raw_articles),
            "filtered": 0,
            "stored": 0,
        }

    # Deduplicate: skip articles whose URL was already processed on a previous run.
    store = DailyLogStore(settings.database_path)
    seen_urls = store.get_seen_urls()
    new_articles = [a for a in filtered if a.url not in seen_urls]
    skipped = len(filtered) - len(new_articles)
    if skipped:
        logger.info("Dedup filter: skipped %d already-seen article(s)", skipped)
    filtered = new_articles

    if not filtered:
        logger.info("No new articles after dedup filter — skipping summarization")
        return {
            "log_date": log_date.isoformat(),
            "fetched": len(raw_articles),
            "filtered": 0,
            "stored": 0,
        }

    summarizer = Summarizer(settings)
    summarized = summarizer.summarize_batch(filtered)

    stored = store.save_entries(log_date, summarized)

    report_path = save_daily_report(log_date, summarized, top_keywords=settings.keywords[:3])

    return {
        "log_date": log_date.isoformat(),
        "fetched": len(raw_articles),
        "filtered": len(filtered),
        "summarized": len(summarized),
        "stored": stored,
        "daily_report": str(report_path) if report_path else None,
    }
