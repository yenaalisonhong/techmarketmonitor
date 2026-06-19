"""
Keyword filtering logic.

An item passes if its title or summary contains at least one
configured keyword (case-insensitive, whole-word aware).
"""

from __future__ import annotations

import re
from loguru import logger

from config.settings import KEYWORDS


class KeywordFilter:
    def __init__(self, keywords: list[str] | None = None, min_score: int = 1) -> None:
        self._keywords = keywords or KEYWORDS
        self._min_score = min_score
        self._patterns = self._compile_patterns(self._keywords)

    # ── Public API ─────────────────────────────────────────────────────────────

    def filter(self, items: list[dict]) -> list[dict]:
        filtered = [item for item in items if self._score(item) >= self._min_score]
        logger.debug(
            f"KeywordFilter: {len(items)} → {len(filtered)} items "
            f"(min_score={self._min_score})"
        )
        return filtered

    def score(self, item: dict) -> int:
        """Return the number of distinct keywords matched in an item."""
        return self._score(item)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _score(self, item: dict) -> int:
        text = " ".join([
            item.get("title", ""),
            item.get("summary", ""),
            item.get("content", ""),
        ]).lower()

        matched = sum(1 for pat in self._patterns if pat.search(text))
        return matched

    @staticmethod
    def _compile_patterns(keywords: list[str]) -> list[re.Pattern]:
        patterns: list[re.Pattern] = []
        for kw in keywords:
            escaped = re.escape(kw.lower())
            # Use word boundaries when keyword starts/ends with word characters
            if re.match(r"\w", escaped[0]) and re.match(r"\w", escaped[-1]):
                patterns.append(re.compile(rf"\b{escaped}\b"))
            else:
                patterns.append(re.compile(escaped))
        return patterns
