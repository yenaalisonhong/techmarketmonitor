from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

from src.config import PROJECT_ROOT, load_settings
from src.report_generator import ReportGenerator
from src.storage import DailyLogStore

logger = logging.getLogger(__name__)

_DAILY_OUTPUT_DIR = PROJECT_ROOT / "output" / "daily"


def _delete_daily_reports(year: int, month: int) -> list[str]:
    """Delete daily markdown report files for the given year/month.

    Returns the list of deleted file names.
    """
    prefix = f"{year:04d}-{month:02d}-"
    deleted: list[str] = []
    if not _DAILY_OUTPUT_DIR.exists():
        return deleted

    for path in sorted(_DAILY_OUTPUT_DIR.glob(f"{prefix}*_daily_report.md")):
        try:
            path.unlink()
            deleted.append(path.name)
            logger.info("Deleted daily report: %s", path.name)
        except OSError as exc:
            logger.warning("Could not delete %s: %s", path.name, exc)
    return deleted


def run_monthly_report(
    year: int | None = None,
    month: int | None = None,
    cleanup_daily: bool = True,
) -> dict:
    today = date.today()
    year = year or today.year
    month = month or today.month

    settings = load_settings()
    store = DailyLogStore(settings.database_path)
    logs = store.get_logs_for_month(year, month)

    if not logs:
        return {
            "year": year,
            "month": month,
            "entries": 0,
            "report_path": None,
            "message": "No daily logs found for this month.",
        }

    generator = ReportGenerator(settings)
    report_path = generator.generate_monthly_report(year, month, logs)

    deleted_files: list[str] = []
    if cleanup_daily:
        deleted_files = _delete_daily_reports(year, month)
        logger.info(
            "Cleaned up %d daily report(s) for %04d-%02d", len(deleted_files), year, month
        )

    return {
        "year": year,
        "month": month,
        "entries": len(logs),
        "report_path": str(report_path),
        "deleted_daily_reports": deleted_files,
    }
