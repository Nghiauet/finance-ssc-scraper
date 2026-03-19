"""High-level scraper service wrapping SSCBrowser."""

from __future__ import annotations

import json
import csv
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from playwright.async_api import async_playwright

from scrape_ssc.browser import SSCBrowser


@dataclass
class ScrapeResult:
    reports: list[dict] = field(default_factory=list)
    downloaded_files: list[dict] = field(default_factory=list)
    total_items: int = 0
    total_pages: int = 0

    def save(self, output_dir: str | Path) -> None:
        """Write reports to JSON + CSV and downloads manifest."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        with open(out / "financial_reports.json", "w", encoding="utf-8") as f:
            json.dump(self.reports, f, ensure_ascii=False, indent=2)

        if self.reports:
            keys = ["stt", "exchange", "ticker", "report_name", "company",
                    "summary", "submission_date", "download_url", "page"]
            with open(out / "financial_reports.csv", "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=keys)
                w.writeheader()
                w.writerows(self.reports)

        if self.downloaded_files:
            with open(out / "downloaded_files.json", "w", encoding="utf-8") as f:
                json.dump(self.downloaded_files, f, ensure_ascii=False, indent=2)


class SSCScraper:
    """
    Scrapes financial reports from the SSC disclosure portal.

    Usage::

        async with SSCScraper() as scraper:
            result = await scraper.scrape(ticker="VNM", download_all=True)
            result.save("output/VNM")
    """

    def __init__(self, headless: bool = True):
        self._headless = headless
        self._pw = None
        self._browser_ctx = None
        self._ssc: SSCBrowser | None = None

    async def __aenter__(self) -> SSCScraper:
        self._pw = await async_playwright().start()
        browser = await self._pw.chromium.launch(headless=self._headless)
        self._browser_ctx = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="vi-VN",
            accept_downloads=True,
        )
        page = await self._browser_ctx.new_page()
        self._ssc = SSCBrowser(page)
        return self

    async def __aexit__(self, *exc) -> None:
        if self._browser_ctx:
            await self._browser_ctx.browser.close()
        if self._pw:
            await self._pw.stop()

    async def scrape(
        self,
        *,
        ticker: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
        max_pages: int | None = None,
        max_downloads: int = 0,
        download_all: bool = False,
        downloads_dir: str | Path = "downloads",
        on_page: "Callable[[int, list[dict]], None] | None" = None,
        on_download: "Callable[[dict], None] | None" = None,
    ) -> ScrapeResult:
        """
        Scrape financial reports from the SSC portal.

        Args:
            ticker: Filter by stock ticker (e.g. "VNM").
            from_date: Start date filter (dd/mm/yyyy).
            to_date: End date filter (dd/mm/yyyy).
            max_pages: Limit pages to scrape (None = all).
            max_downloads: Download N files from page 1 (0 = none).
            download_all: Download every file on every page.
            downloads_dir: Where to save downloaded files.
            on_page: Optional callback(page_num, rows) for progress.
            on_download: Optional callback(dl_info) called after each file download.

        Returns:
            ScrapeResult with all report metadata and download info.
        """
        ssc = self._ssc
        dl_dir = Path(downloads_dir)

        await ssc.load()

        # The SSC portal only returns ~10 recent results when no date
        # range is specified.  Always apply a wide date range so we get
        # complete data (the portal accepts dates back to 2000).
        if not from_date:
            from_date = "01/01/2000"
        if not to_date:
            from datetime import datetime as _dt
            to_date = _dt.now().strftime("%d/%m/%Y")

        await ssc.apply_filters(
            ticker=ticker.upper() if ticker else None,
            from_date=from_date,
            to_date=to_date,
        )

        pag = await ssc.get_pagination()
        total_items = pag.get("total_items", 0)
        total_pages = pag.get("total_pages", 1)

        if max_pages is None or max_pages == 0:
            pages = total_pages
        else:
            pages = min(max_pages, total_pages)

        result = ScrapeResult(total_items=total_items, total_pages=total_pages)

        for page_num in range(1, pages + 1):
            rows = await ssc.extract_rows()
            for row in rows:
                row["page"] = page_num
            result.reports.extend(rows)

            if on_page:
                on_page(page_num, rows)

            # Downloads
            should_dl = download_all or (page_num == 1 and max_downloads > 0)
            if should_dl and rows:
                dl_dir.mkdir(parents=True, exist_ok=True)
                n = len(rows) if download_all else min(max_downloads, len(rows))
                for i in range(n):
                    path = await ssc.download_file(i, str(dl_dir))
                    if path:
                        dl_info = {
                            "ticker": rows[i].get("ticker", ""),
                            "company": rows[i].get("company", ""),
                            "report": rows[i].get("report_name", ""),
                            "file": path,
                        }
                        result.downloaded_files.append(dl_info)
                        if on_download:
                            on_download(dl_info)

            if page_num < pages:
                if not await ssc.next_page():
                    break

        return result
