"""
Fetches recent papers from arXiv and Semantic Scholar
based on the configured keyword list.
"""

from __future__ import annotations

import time
from loguru import logger

import arxiv
import requests

import os

from config.settings import (
    ARXIV_CATEGORIES,
    ARXIV_MAX_RESULTS,
    KEYWORDS,
    SEMANTIC_SCHOLAR_MAX_RESULTS,
    SEMANTIC_SCHOLAR_FIELDS,
)

_S2_API_KEY = os.getenv("SEMANTIC_SCHOLAR_API_KEY", "")
_S2_BASE = "https://api.semanticscholar.org/graph/v1"


class AcademicAPI:
    """Collects papers from arXiv and Semantic Scholar."""

    def fetch(self) -> list[dict]:
        items: list[dict] = []
        items.extend(self._fetch_arxiv())
        items.extend(self._fetch_semantic_scholar())
        return items

    # ── arXiv ──────────────────────────────────────────────────────────────────

    def _fetch_arxiv(self) -> list[dict]:
        results: list[dict] = []

        query_parts = [f'"{kw}"' for kw in KEYWORDS[:8]]
        query = " OR ".join(query_parts)
        cat_filter = " OR ".join(f"cat:{c}" for c in ARXIV_CATEGORIES)
        full_query = f"({query}) AND ({cat_filter})"

        try:
            client = arxiv.Client()
            search = arxiv.Search(
                query=full_query,
                max_results=ARXIV_MAX_RESULTS,
                sort_by=arxiv.SortCriterion.SubmittedDate,
            )
            for paper in client.results(search):
                results.append({
                    "item_type": "academic",
                    "source": "arXiv",
                    "title": paper.title,
                    "url": paper.entry_id,
                    "published": str(paper.published.date()),
                    "summary": paper.summary.replace("\n", " ").strip(),
                    "authors": [a.name for a in paper.authors[:5]],
                    "categories": paper.categories,
                    "content": "",
                })
            logger.debug(f"[arXiv] collected {len(results)} papers")
        except Exception as exc:
            logger.warning(f"[arXiv] fetch failed: {exc}")

        return results

    # ── Semantic Scholar ───────────────────────────────────────────────────────

    def _fetch_semantic_scholar(self) -> list[dict]:
        results: list[dict] = []
        query = " ".join(KEYWORDS[:5])
        headers = {"x-api-key": _S2_API_KEY} if _S2_API_KEY else {}

        params = {
            "query": query,
            "limit": SEMANTIC_SCHOLAR_MAX_RESULTS,
            "fields": ",".join(SEMANTIC_SCHOLAR_FIELDS),
        }

        try:
            resp = requests.get(
                f"{_S2_BASE}/paper/search",
                params=params,
                headers=headers,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            for paper in data.get("data", []):
                abstract = paper.get("abstract") or ""
                results.append({
                    "item_type": "academic",
                    "source": "Semantic Scholar",
                    "title": paper.get("title", ""),
                    "url": paper.get("url", ""),
                    "published": str(paper.get("year", "")),
                    "summary": abstract[:500],
                    "authors": [
                        a.get("name", "") for a in paper.get("authors", [])[:5]
                    ],
                    "citations": paper.get("citationCount", 0),
                    "content": "",
                })
            logger.debug(f"[Semantic Scholar] collected {len(results)} papers")
        except Exception as exc:
            logger.warning(f"[Semantic Scholar] fetch failed: {exc}")

        return results
