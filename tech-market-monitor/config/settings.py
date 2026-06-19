"""
Central configuration: keywords, source URLs, and file paths.
Override any value via environment variables where noted.
"""

import os
from pathlib import Path

# ── Project root ─────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent

# ── Storage paths ─────────────────────────────────────────────────────────────
DATA_DIR = BASE_DIR / "storage" / "data"
DAILY_LOGS_DIR = DATA_DIR / "daily_logs"
REPORTS_DIR = DATA_DIR / "reports"
DB_PATH = Path(os.getenv("DB_PATH", str(DAILY_LOGS_DIR / "monitor.db")))

# Ensure directories exist at import time
DAILY_LOGS_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

# ── Tracking keywords ─────────────────────────────────────────────────────────
_KEYWORDS_FILE = BASE_DIR / "keywords.txt"

_DEFAULT_KEYWORDS: list[str] = [
    "large language model", "LLM", "generative AI", "foundation model",
    "transformer", "diffusion model", "multimodal",
    "cloud computing", "edge computing", "serverless", "kubernetes",
    "semiconductor", "GPU", "NPU", "TSMC", "chip shortage",
    "digital transformation", "MLOps", "DevOps", "platform engineering",
    "AI startup", "tech IPO", "venture capital", "Series A",
]


def _load_keywords() -> list[str]:
    try:
        lines = _KEYWORDS_FILE.read_text(encoding="utf-8").splitlines()
        keywords = [
            line.strip()
            for line in lines
            if line.strip() and not line.strip().startswith("#")
        ]
        if keywords:
            return keywords
    except FileNotFoundError:
        pass
    return _DEFAULT_KEYWORDS


KEYWORDS: list[str] = _load_keywords()

# ── News RSS sources ──────────────────────────────────────────────────────────
NEWS_RSS_FEEDS: dict[str, str] = {
    "TechCrunch":     "https://techcrunch.com/feed/",
    "Wired":          "https://www.wired.com/feed/rss",
    "The Verge":      "https://www.theverge.com/rss/index.xml",
    "VentureBeat":    "https://venturebeat.com/feed/",
    "MIT Tech Review":"https://www.technologyreview.com/feed/",
    "Ars Technica":   "https://feeds.arstechnica.com/arstechnica/index",
}

# Max articles to collect per feed per run
NEWS_MAX_PER_FEED: int = 20

# ── Academic API settings ─────────────────────────────────────────────────────
ARXIV_MAX_RESULTS: int = 30
ARXIV_CATEGORIES: list[str] = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "econ.GN"]

SEMANTIC_SCHOLAR_MAX_RESULTS: int = 20
SEMANTIC_SCHOLAR_FIELDS: list[str] = [
    "title", "abstract", "year", "authors", "url", "citationCount",
]

# ── Enterprise IR sources ─────────────────────────────────────────────────────
ENTERPRISE_IR_SOURCES: dict[str, str] = {
    "Microsoft IR":   "https://www.microsoft.com/en-us/investor",
    "Google IR":      "https://abc.xyz/investor/",
    "NVIDIA IR":      "https://investor.nvidia.com/home/default.aspx",
    "Meta IR":        "https://investor.fb.com/home/default.aspx",
    "Amazon IR":      "https://ir.aboutamazon.com/overview/default.aspx",
}

# ── LLM settings ──────────────────────────────────────────────────────────────
# MODEL_NAME takes priority (matches .env); OPENAI_MODEL is kept for backwards compat
OPENAI_MODEL: str = os.getenv("MODEL_NAME") or os.getenv("OPENAI_MODEL", "gemini-2.0-flash")
SUMMARY_MAX_TOKENS: int = 300
TREND_MAX_TOKENS: int = 1500

SUMMARY_SYSTEM_PROMPT: str = (
    "You are a concise technology market analyst. "
    "Summarize the provided article in 2-3 sentences, focusing on business impact and technical significance. "
    "Respond in the same language as the article."
)

TREND_SYSTEM_PROMPT: str = (
    "You are a senior technology market analyst. "
    "Given the following collection of tech news and research summaries from this month, "
    "identify the top 5 trends and provide strategic insights for enterprise decision-makers. "
    "Structure your response with clear headings."
)

# ── Report settings ───────────────────────────────────────────────────────────
REPORT_AUTHOR: str = "Tech Market Monitor"
REPORT_COMPANY: str = ""
