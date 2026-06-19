"""
Entry point for Tech Market Monitor.

Daily job  : scrape → filter → summarize → log
Monthly job: aggregate logs → generate PDF/Word report
"""

import schedule
import time
from datetime import datetime
from loguru import logger
from dotenv import load_dotenv

from scrapers.news_scraper import NewsScraper
from scrapers.academic_api import AcademicAPI
from scrapers.enterprise_ir import EnterpriseIR
from pipeline.filter import KeywordFilter
from pipeline.llm_summarizer import LLMSummarizer
from pipeline.report_generator import ReportGenerator
from storage.daily_logger import DailyLogger

load_dotenv()

logger.add("storage/data/daily_logs/monitor.log", rotation="1 week", retention="1 month")


def run_daily_job() -> None:
    logger.info("=== Daily job started ===")

    news_scraper = NewsScraper()
    academic_api = AcademicAPI()
    enterprise_ir = EnterpriseIR()
    keyword_filter = KeywordFilter()
    summarizer = LLMSummarizer()
    daily_logger = DailyLogger()

    raw_items = []
    raw_items.extend(news_scraper.fetch())
    raw_items.extend(academic_api.fetch())
    raw_items.extend(enterprise_ir.fetch())

    logger.info(f"Collected {len(raw_items)} raw items")

    filtered = keyword_filter.filter(raw_items)
    logger.info(f"Filtered to {len(filtered)} relevant items")

    summarized = summarizer.summarize_batch(filtered)

    daily_logger.save(summarized)
    logger.info("=== Daily job complete ===")


def run_monthly_job() -> None:
    logger.info("=== Monthly report job started ===")

    daily_logger = DailyLogger()
    report_generator = ReportGenerator()
    summarizer = LLMSummarizer()

    now = datetime.now()
    logs = daily_logger.load_month(year=now.year, month=now.month)

    if not logs:
        logger.warning("No logs found for monthly report.")
        return

    trend_summary = summarizer.extract_trends(logs)
    report_generator.generate(logs=logs, trend_summary=trend_summary, year=now.year, month=now.month)

    logger.info("=== Monthly report job complete ===")


def schedule_jobs() -> None:
    schedule.every().day.at("08:00").do(run_daily_job)
    schedule.every().month.do(run_monthly_job)

    logger.info("Scheduler started. Daily @ 08:00 | Monthly on 1st.")
    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "daily":
            run_daily_job()
        elif cmd == "monthly":
            run_monthly_job()
        else:
            print("Usage: python main.py [daily|monthly]")
    else:
        schedule_jobs()
