from __future__ import annotations

import json
import logging
import os
import re
from collections import Counter
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from dotenv import load_dotenv
from openai import OpenAI

from src.config import PROJECT_ROOT, Settings

logger = logging.getLogger(__name__)

CATEGORY_LABELS = {
    "tech_news": "Tech News",
    "academic": "Academic",
    "enterprise": "Enterprise",
}


def _add_hyperlink(paragraph, text: str, url: str) -> None:
    part = paragraph.part
    r_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )

    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), r_id)

    run_element = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "0563C1")
    r_pr.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    r_pr.append(underline)
    run_element.append(r_pr)

    text_element = OxmlElement("w:t")
    text_element.text = text
    run_element.append(text_element)
    hyperlink.append(run_element)
    paragraph._p.append(hyperlink)


class ReportGenerator:
    def __init__(self, settings: Settings) -> None:
        load_dotenv(PROJECT_ROOT / ".env")

        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY is required for monthly reporting")

        self.llm = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url=os.getenv("OPENAI_BASE_URL"),
        )
        self.output_dir = settings.reports_output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _synthesize_monthly_report(self, year: int, month: int, logs: list[dict]) -> str:
        compact_logs = [
            {
                "date": item["log_date"],
                "title": item["title"],
                "url": item["url"],
                "category": item["category"],
                "summary": item["llm_summary"],
                "trends": item["key_trends"],
            }
            for item in logs
        ]

        prompt = (
            f"Create a monthly tech market intelligence report for {year}-{month:02d}.\n"
            "Use markdown headings (##, ###) and bullet lists.\n"
            "Include: Executive Summary, Top Trends, Category Breakdown "
            "(tech_news, academic, enterprise), Notable Sources with URLs, "
            "and Strategic Implications.\n"
            "Every claim must reference at least one source URL from the data.\n\n"
            f"Daily logs JSON:\n{json.dumps(compact_logs, ensure_ascii=False)}"
        )

        response = self.llm.chat.completions.create(
            model=os.getenv("MODEL_NAME", "gemini-1.5-flash"),
            messages=[
                {
                    "role": "system",
                    "content": "You write concise, citation-heavy market intelligence reports.",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        return (response.choices[0].message.content or "").strip()

    @staticmethod
    def _add_markdown_content(document: Document, markdown: str) -> None:
        url_pattern = re.compile(r"(https?://[^\s)>\]]+)")

        for line in markdown.splitlines():
            stripped = line.strip()
            if not stripped:
                continue

            if stripped.startswith("### "):
                document.add_heading(stripped[4:], level=3)
            elif stripped.startswith("## "):
                document.add_heading(stripped[3:], level=2)
            elif stripped.startswith("# "):
                document.add_heading(stripped[2:], level=1)
            elif stripped.startswith("- ") or stripped.startswith("* "):
                paragraph = document.add_paragraph(style="List Bullet")
                content = stripped[2:]
                last_end = 0
                for match in url_pattern.finditer(content):
                    if match.start() > last_end:
                        paragraph.add_run(content[last_end : match.start()])
                    _add_hyperlink(paragraph, match.group(1), match.group(1))
                    last_end = match.end()
                if last_end < len(content):
                    paragraph.add_run(content[last_end:])
            else:
                paragraph = document.add_paragraph()
                last_end = 0
                for match in url_pattern.finditer(stripped):
                    if match.start() > last_end:
                        paragraph.add_run(stripped[last_end : match.start()])
                    _add_hyperlink(paragraph, match.group(1), match.group(1))
                    last_end = match.end()
                if last_end < len(stripped):
                    paragraph.add_run(stripped[last_end:])

    @staticmethod
    def _style_title(document: Document, text: str) -> None:
        title = document.add_paragraph()
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = title.add_run(text)
        run.bold = True
        run.font.size = Pt(24)
        run.font.color.rgb = RGBColor(0x1F, 0x39, 0x64)

    def _build_document(self, year: int, month: int, logs: list[dict], report_body: str) -> Document:
        document = Document()

        section = document.sections[0]
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

        title_text = f"Tech Market Intelligence Report"
        self._style_title(document, title_text)

        subtitle = document.add_paragraph()
        subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
        subtitle_run = subtitle.add_run(f"{year}-{month:02d}")
        subtitle_run.font.size = Pt(16)
        subtitle_run.font.color.rgb = RGBColor(0x44, 0x54, 0x6A)

        meta = document.add_paragraph()
        meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
        meta.add_run(
            f"Generated on {date.today().isoformat()} | "
            f"{len(logs)} daily log entries"
        ).italic = True

        document.add_paragraph()

        trend_counter: Counter[str] = Counter()
        category_counter: Counter[str] = Counter()
        for item in logs:
            category_counter[item["category"]] += 1
            for trend in item["key_trends"]:
                trend_counter[trend] += 1

        document.add_heading("Overview", level=1)

        overview = document.add_table(rows=1, cols=2)
        overview.style = "Light Grid Accent 1"
        header_cells = overview.rows[0].cells
        header_cells[0].text = "Metric"
        header_cells[1].text = "Value"

        metrics = [
            ("Reporting period", f"{year}-{month:02d}"),
            ("Total entries", str(len(logs))),
            (
                "Top category",
                CATEGORY_LABELS.get(
                    category_counter.most_common(1)[0][0],
                    category_counter.most_common(1)[0][0],
                )
                if category_counter
                else "N/A",
            ),
            (
                "Top trend",
                trend_counter.most_common(1)[0][0] if trend_counter else "N/A",
            ),
        ]

        for metric, value in metrics:
            row = overview.add_row().cells
            row[0].text = metric
            row[1].text = value

        document.add_paragraph()
        document.add_heading("Monthly Analysis", level=1)
        self._add_markdown_content(document, report_body)

        document.add_page_break()
        document.add_heading("Source Index", level=1)

        source_table = document.add_table(rows=1, cols=4)
        source_table.style = "Light Grid Accent 1"
        headers = source_table.rows[0].cells
        headers[0].text = "Date"
        headers[1].text = "Title"
        headers[2].text = "Category"
        headers[3].text = "Source URL"

        for item in logs:
            row = source_table.add_row().cells
            row[0].text = item["log_date"]
            row[1].text = item["title"]
            row[2].text = CATEGORY_LABELS.get(item["category"], item["category"])
            url_cell = row[3].paragraphs[0]
            _add_hyperlink(url_cell, item["url"], item["url"])

        return document

    def generate_monthly_report(
        self,
        year: int,
        month: int,
        logs: list[dict],
    ) -> Path:
        report_body = self._synthesize_monthly_report(year, month, logs)
        document = self._build_document(year, month, logs, report_body)

        output_path = self.output_dir / f"tech-market-report-{year}-{month:02d}.docx"
        document.save(output_path)

        logger.info("Generated Word report: %s", output_path)
        return output_path
