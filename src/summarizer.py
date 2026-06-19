from __future__ import annotations

import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from openai import OpenAI, RateLimitError

from src.config import PROJECT_ROOT, Settings
from src.models import FilteredArticle, SummarizedArticle

logger = logging.getLogger(__name__)

# Seconds to wait between requests to stay within free-tier RPM limits.
_REQUEST_DELAY = float(os.getenv("SUMMARIZER_REQUEST_DELAY", "1.0"))
_MAX_RETRIES = 5

SYSTEM_PROMPT = """You are a senior tech market intelligence analyst specializing in market sizing, competitive dynamics, and investment trends.

Your primary job is MARKET ANALYSIS, not just technology description. For every article you analyze:
- Extract any quantitative market data: market size (USD), CAGR forecasts, revenue figures, unit shipments, funding amounts.
- Identify key players, competitive positioning, and market share signals.
- Note supply-chain implications, M&A signals, or investment flows.
- If the article is a research paper, translate the technical findings into their commercial/market implications.

Write both an English and Korean 5-step structured summary.
Every response MUST include the source URL in the English summary text.
Return valid JSON with this exact schema:
{
  "summary": "1-sentence English market-focused headline that ends with Source: <url>",
  "en_summary_steps": [
    "Step 1 - Overview: <1-2 sentences: what market/industry segment does this address and why does it matter now?>",
    "Step 2 - Key Content: <core findings, product announcements, or research results>",
    "Step 3 - Technical Significance: <what is novel or differentiated from existing solutions?>",
    "Step 4 - Market Impact & Sizing: <PRIORITIZE quantitative data — cite any TAM/SAM, CAGR, revenue projections, funding rounds, shipment numbers, market share figures. If none available, assess competitive and commercial implications for major players>",
    "Step 5 - Investment & Future Outlook: <who stands to gain/lose, what trends to watch, what catalysts or risks could accelerate/slow adoption?>"
  ],
  "key_trends": ["market-oriented trend phrase 1", "market-oriented trend phrase 2"],
  "ko_summary_steps": [
    "1단계 - 개요: <어떤 시장·산업 분야를 다루며 왜 지금 중요한지 1-2문장으로 소개>",
    "2단계 - 핵심 내용: <주요 발표·연구 결과·제품 내용 요약>",
    "3단계 - 기술적 차별성: <기존 솔루션 대비 혁신 포인트>",
    "4단계 - 시장 규모 및 파급 효과: <시장 규모(TAM/SAM), CAGR, 매출·투자 수치 등 수치 데이터를 최우선으로 인용. 수치가 없으면 주요 플레이어(삼성·SK하이닉스·TSMC·NVIDIA 등)에 대한 사업적 함의를 구체적으로 분석>",
    "5단계 - 투자·미래 전망: <수혜 기업·섹터, 주목할 트렌드, 성장 촉진 요인 또는 리스크>"
  ]
}
"""


def _extract_json(content: str) -> dict:
    content = content.strip()
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


class Summarizer:
    def __init__(self, settings: Settings) -> None:
        load_dotenv(PROJECT_ROOT / ".env")

        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY is required for summarization")

        self.client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"),
        )

    def summarize(self, article: FilteredArticle) -> SummarizedArticle:
        user_prompt = (
            f"Title: {article.title}\n"
            f"URL: {article.url}\n"
            f"Source: {article.source_name} ({article.category})\n"
            f"Matched keywords: {', '.join(article.matched_keywords)}\n"
            f"Content preview: {article.summary[:2000]}"
        )

        model = os.getenv("MODEL_NAME") or os.getenv("OPENAI_MODEL", "gemini-2.0-flash-lite")

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.2,
                )
                break
            except RateLimitError as exc:
                if attempt == _MAX_RETRIES:
                    raise
                wait = 2 ** attempt
                logger.warning(
                    "Rate limited on attempt %d/%d — retrying in %ds", attempt, _MAX_RETRIES, wait
                )
                time.sleep(wait)

        payload = _extract_json(response.choices[0].message.content or "{}")
        summary = (payload.get("summary") or "").strip()
        trends = payload.get("key_trends") or []
        ko_steps = payload.get("ko_summary_steps") or []
        en_steps = payload.get("en_summary_steps") or []

        if article.url not in summary:
            summary = f"{summary} Source: {article.url}".strip()

        return SummarizedArticle(
            title=article.title,
            url=article.url,
            source_name=article.source_name,
            category=article.category,
            published_at=article.published_at,
            matched_keywords=article.matched_keywords,
            llm_summary=summary,
            key_trends=[str(t).strip() for t in trends if str(t).strip()],
            ko_summary_steps=[str(s).strip() for s in ko_steps if str(s).strip()],
            en_summary_steps=[str(s).strip() for s in en_steps if str(s).strip()],
        )

    def summarize_batch(self, articles: list[FilteredArticle]) -> list[SummarizedArticle]:
        results: list[SummarizedArticle] = []
        for index, article in enumerate(articles, start=1):
            logger.info("Summarizing %d/%d: %s", index, len(articles), article.title)
            try:
                results.append(self.summarize(article))
            except Exception as exc:
                logger.error("Failed to summarize '%s': %s", article.title, exc)
            if index < len(articles):
                time.sleep(_REQUEST_DELAY)
        return results
