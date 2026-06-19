"""
LLM integration for per-item summarization and monthly trend extraction.
Uses OpenAI Chat Completions API.
"""

from __future__ import annotations

import os
import time
from loguru import logger
from openai import OpenAI, RateLimitError, APIError

from config.settings import (
    OPENAI_MODEL,
    SUMMARY_MAX_TOKENS,
    SUMMARY_SYSTEM_PROMPT,
    TREND_MAX_TOKENS,
    TREND_SYSTEM_PROMPT,
)


class LLMSummarizer:
    RETRY_DELAY = 10
    MAX_RETRIES = 3

    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL") or None
        if not api_key or api_key.startswith("your_"):
            logger.warning("OPENAI_API_KEY not set — LLM calls will be skipped.")
        self._client = OpenAI(api_key=api_key, base_url=base_url) if api_key else None
        self._model = OPENAI_MODEL

    # ── Public API ─────────────────────────────────────────────────────────────

    def summarize_batch(self, items: list[dict]) -> list[dict]:
        """Add an 'llm_summary' key to each item dict."""
        results: list[dict] = []
        for item in items:
            item = item.copy()
            item["llm_summary"] = self._summarize_item(item)
            results.append(item)
        return results

    def extract_trends(self, logs: list[dict]) -> str:
        """Synthesize monthly trends from a list of daily log items."""
        if not self._client:
            return "[LLM unavailable — OPENAI_API_KEY not configured]"

        combined = self._build_trend_input(logs)
        logger.info(f"Extracting trends from {len(logs)} items…")
        return self._call(TREND_SYSTEM_PROMPT, combined, TREND_MAX_TOKENS)

    # ── Internal ───────────────────────────────────────────────────────────────

    def _summarize_item(self, item: dict) -> str:
        if not self._client:
            return item.get("summary", "")

        text = self._item_to_text(item)
        if not text.strip():
            return ""

        return self._call(SUMMARY_SYSTEM_PROMPT, text, SUMMARY_MAX_TOKENS)

    def _call(self, system: str, user: str, max_tokens: int) -> str:
        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    max_tokens=max_tokens,
                    temperature=0.3,
                )
                return response.choices[0].message.content.strip()
            except RateLimitError:
                if attempt < self.MAX_RETRIES:
                    logger.warning(f"Rate limited. Retry {attempt}/{self.MAX_RETRIES} in {self.RETRY_DELAY}s…")
                    time.sleep(self.RETRY_DELAY * attempt)
                else:
                    logger.error("Rate limit exceeded after all retries.")
                    return ""
            except APIError as exc:
                logger.error(f"OpenAI API error: {exc}")
                return ""

        return ""

    @staticmethod
    def _item_to_text(item: dict) -> str:
        parts = [
            f"Title: {item.get('title', '')}",
            f"Source: {item.get('source', '')}",
            f"Summary: {item.get('summary', '')}",
        ]
        content = item.get("content", "")
        if content:
            parts.append(f"Content excerpt: {content[:1500]}")
        return "\n".join(parts)

    @staticmethod
    def _build_trend_input(logs: list[dict]) -> str:
        lines: list[str] = []
        for i, item in enumerate(logs[:100], 1):
            summary = item.get("llm_summary") or item.get("summary", "")
            lines.append(
                f"{i}. [{item.get('source', '')}] {item.get('title', '')}\n   {summary}"
            )
        return "\n\n".join(lines)
