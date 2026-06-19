"""
Collects press releases, earnings reports, and whitepapers
from major enterprise IR pages via lightweight HTML scraping.
"""

from __future__ import annotations

import re
import time
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from loguru import logger

from config.settings import ENTERPRISE_IR_SOURCES, KEYWORDS


class EnterpriseIR:
    """Scrapes IR / press-release pages for keyword-relevant items."""

    HEADERS = {
        "User-Agent": (
            "Mozilla/5.0 (compatible; TechMarketMonitor/1.0; "
            "+https://github.com/your-org/tech-market-monitor)"
        )
    }
    REQUEST_TIMEOUT = 20
    PAGE_DELAY = 1.0

    def fetch(self) -> list[dict]:
        items: list[dict] = []
        for company, url in ENTERPRISE_IR_SOURCES.items():
            try:
                page_items = self._scrape_ir_page(company, url)
                items.extend(page_items)
                logger.debug(f"[{company} IR] collected {len(page_items)} items")
            except Exception as exc:
                logger.warning(f"[{company} IR] scrape failed: {exc}")
            time.sleep(self.PAGE_DELAY)
        return items

    def _scrape_ir_page(self, company: str, url: str) -> list[dict]:
        resp = requests.get(url, headers=self.HEADERS, timeout=self.REQUEST_TIMEOUT)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        candidates = self._extract_links(soup, url)
        relevant = [c for c in candidates if self._is_relevant(c["title"])]
        return [
            {
                "item_type": "enterprise_ir",
                "source": company,
                "title": item["title"],
                "url": item["url"],
                "published": "",
                "summary": item["title"],
                "content": "",
            }
            for item in relevant[:10]
        ]

    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> list[dict]:
        """Return all anchor tags that look like press releases or news items."""
        results: list[dict] = []
        seen: set[str] = set()

        press_indicators = re.compile(
            r"(press|release|news|earnings|report|whitepaper|announcement|invest)",
            re.IGNORECASE,
        )

        for a in soup.find_all("a", href=True):
            href: str = a["href"]
            text: str = a.get_text(strip=True)

            if not text or len(text) < 10:
                continue

            abs_url = urljoin(base_url, href)
            if abs_url in seen:
                continue
            seen.add(abs_url)

            if press_indicators.search(href) or press_indicators.search(text):
                results.append({"title": text, "url": abs_url})

        return results

    def _is_relevant(self, text: str) -> bool:
        text_lower = text.lower()
        return any(kw.lower() in text_lower for kw in KEYWORDS)
