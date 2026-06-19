# Tech Market Intelligence Monitor

Daily monitoring of tech market trends based on configurable keywords, with LLM summarization and monthly Word report generation.

## Features

- **Daily monitoring** — fetch from tech news, academic, and enterprise sources every 24 hours
- **Keyword filtering** — only stores content matching configured tech keywords
- **LLM summarization** — summarizes articles and extracts key trends with mandatory URL citations
- **Daily logs** — persisted in SQLite (`data/monitor.db`)
- **Monthly reports** — synthesizes daily logs into a structured Word document (`.docx`)

## Quick Start

```powershell
cd C:\Users\Admin\Documents\python-project
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` with your API keys:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM summarization and monthly report synthesis |
| `REPORTS_OUTPUT_DIR` | Output folder for `.docx` reports (default: `reports/`) |

Customize keywords in `config/keywords.yaml` and sources in `config/sources.yaml`.

## Usage

```powershell
# Run daily pipeline once
python -m src.main daily

# Run for a specific date
python -m src.main daily --date 2026-06-17

# Generate monthly Word report
python -m src.main monthly

# Generate report for a specific month
python -m src.main monthly --year 2026 --month 6

# Start 24h scheduler (+ month-end report)
python -m src.main schedule
```

Reports are saved as `reports/tech-market-report-YYYY-MM.docx`.

## Workflow

```
Daily:   Fetch -> Filter -> Summarize -> Store (SQLite)
Monthly: Retrieve logs -> Synthesize trends -> Generate Word report
```

## Source Coverage

| Category | Sources |
|---|---|
| Tech News | TechCrunch, Wired (RSS) |
| Academic | arXiv (CS.AI, CS.LG RSS), Semantic Scholar API |
| Enterprise | Microsoft, Google, NVIDIA news/IR feeds |

## Project Structure

```
config/           Keywords and source definitions
reports/          Generated monthly Word reports
src/
  fetchers/       RSS + API fetchers
  filter.py       Keyword matching
  summarizer.py   LLM summarization with URL citations
  storage.py      SQLite daily log store
  pipeline.py     Daily workflow
  monthly.py      Monthly aggregation
  report_generator.py  Word report generator
  main.py         CLI entry point
```

## Windows Task Scheduler (optional)

Instead of the built-in scheduler, you can register a daily task:

```powershell
schtasks /Create /SC DAILY /TN "TechMarketMonitor" /TR "C:\Users\Admin\Documents\python-project\.venv\Scripts\python.exe -m src.main daily" /ST 08:00
```

## GitHub Actions (cloud scheduler — runs even when PC is off)

The workflow at `.github/workflows/daily-monitor.yml` runs automatically at **08:00 KST every day** using GitHub's free cloud runners.

### One-time setup

1. Push this repo to GitHub (private repo is fine).
2. Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `OPENAI_API_KEY` | your API key |
| `OPENAI_BASE_URL` | e.g. `https://api.groq.com/openai/v1` |
| `MODEL_NAME` | e.g. `llama-3.3-70b-versatile` |

3. Done — daily reports are committed to `output/daily/` automatically.

### Output

| Path | Contents |
|---|---|
| `output/daily/YYYY-MM-DD_daily_report.md` | Per-article summaries (EN + KR), matched keywords, key trends |
| `output/logs/daily.log` | Pipeline execution log (fetch counts, errors, saved path) |

### Generating a report for a missed date

Go to **Actions → Daily Tech Market Monitor → Run workflow**, enter the date (e.g. `2026-06-20`), and click **Run workflow**.

> Note: RSS feeds typically only keep articles from the past 24–48 hours, so backdated runs more than ~2 days ago will likely return no articles.
