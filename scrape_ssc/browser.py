"""Low-level Playwright helpers for Oracle ADF pages."""

from __future__ import annotations

from playwright.async_api import Page


BASE_URL = "https://congbothongtin.ssc.gov.vn/"

# ADF element IDs
TICKER_INPUT = "#pt9\\:it8112\\:\\:content"
DATE_FROM_INPUT = "#pt9\\:id1\\:\\:content"
DATE_TO_INPUT = "#pt9\\:id2\\:\\:content"
SEARCH_BTN = '#pt9\\:b1 a[role="button"]'


class SSCBrowser:
    """Manages a Playwright page pointed at the SSC portal."""

    def __init__(self, page: Page):
        self.page = page

    @property
    def frame(self) -> Frame:
        """Return the ADF content frame (always frame[0])."""
        return self.page.frames[0]

    # ------------------------------------------------------------------
    # Page lifecycle
    # ------------------------------------------------------------------

    async def load(self, retries: int = 3) -> None:
        """Navigate to the SSC portal and wait for the table."""
        for attempt in range(retries):
            try:
                await self.page.goto(BASE_URL, wait_until="load", timeout=60_000)
                await self.page.wait_for_timeout(10_000)
                await self.wait_for_table(timeout=30)
                return
            except TimeoutError:
                if attempt < retries - 1:
                    await self.page.reload(timeout=60_000)
                    await self.page.wait_for_timeout(10_000)
                else:
                    raise

    async def wait_for_table(self, timeout: int = 90) -> None:
        """Block until at least one ADF table row is present."""
        for _ in range(timeout):
            try:
                count = await self.frame.evaluate(
                    '() => document.querySelectorAll(\'tr[role="row"]\').length'
                )
                if count > 0:
                    return
            except Exception:
                pass
            await self.page.wait_for_timeout(1_000)
        raise TimeoutError("Table rows did not appear")

    # ------------------------------------------------------------------
    # Filters
    # ------------------------------------------------------------------

    async def apply_filters(
        self,
        ticker: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> None:
        """Fill search fields and click 'Tìm kiếm'."""
        f = self.frame

        if ticker:
            await f.locator(TICKER_INPUT).fill(ticker)
            await self.page.wait_for_timeout(500)

        if from_date:
            inp = f.locator(DATE_FROM_INPUT)
            await inp.fill("")
            await inp.fill(from_date)

        if to_date:
            inp = f.locator(DATE_TO_INPUT)
            await inp.fill("")
            await inp.fill(to_date)

        await f.locator(SEARCH_BTN).click()
        await self.page.wait_for_timeout(5_000)
        await self.wait_for_table()

    # ------------------------------------------------------------------
    # Data extraction
    # ------------------------------------------------------------------

    async def extract_rows(self) -> list[dict]:
        """Extract all visible table rows from the current page."""
        return await self.frame.evaluate("""
            () => {
                const results = [];
                const trs = document.querySelectorAll('tr[role="row"]');
                for (const tr of trs) {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length < 7) continue;

                    const cellById = {};
                    for (const td of tds) {
                        const m = (td.id || '').match(/:c(\\d+)$/);
                        if (m) cellById['c' + m[1]] = td;
                    }
                    const text = (k) => {
                        const el = cellById[k];
                        return el ? el.textContent.replace(/\\u00a0/g, '').trim() : '';
                    };

                    let download_url = '';
                    const img = tr.querySelector('img[src*="download"]');
                    if (img) {
                        const a = img.closest('a');
                        if (a) download_url = a.href || '';
                    }

                    results.push({
                        stt: text('c12'),
                        exchange: text('c2'),
                        ticker: text('c5'),
                        report_name: text('c3'),
                        company: text('c8'),
                        summary: text('c111'),
                        submission_date: text('c7'),
                        download_url: download_url,
                    });
                }
                return results;
            }
        """)

    async def get_pagination(self) -> dict:
        """Return {total_pages, total_items} from the pagination bar."""
        return await self.frame.evaluate("""
            () => {
                const text = document.body.innerText;
                const m = text.match(/of\\s+(\\d+)\\s+\\((\\d+)-(\\d+)\\s+of\\s+(\\d+)/);
                if (m) return { total_pages: +m[1], total_items: +m[4] };
                return {};
            }
        """)

    async def next_page(self) -> bool:
        """Click 'Next Page' and wait for table content to change."""
        f = self.frame
        old_stt = await f.evaluate("""
            () => {
                const td = document.querySelector('tr[role="row"] td[id$=":c12"]');
                return td ? td.textContent.trim() : '';
            }
        """)

        clicked = await f.evaluate("""
            () => {
                const el = document.querySelector('a[title="Next Page"]')
                         || document.querySelector('a[id$="::nb_nx"]');
                if (el) { el.click(); return true; }
                return false;
            }
        """)
        if not clicked:
            return False

        for _ in range(30):
            await self.page.wait_for_timeout(1_000)
            new_stt = await f.evaluate("""
                () => {
                    const td = document.querySelector('tr[role="row"] td[id$=":c12"]');
                    return td ? td.textContent.trim() : '';
                }
            """)
            if new_stt and new_stt != old_stt:
                return True
        return True

    async def download_file(self, row_index: int, dest: str) -> str | None:
        """Download the file for a given row index. Returns saved path."""
        try:
            async with self.page.expect_download(timeout=30_000) as dl_info:
                await self.frame.evaluate("""
                    (i) => {
                        const imgs = document.querySelectorAll('img[src*="download"]');
                        if (i < imgs.length) {
                            const a = imgs[i].closest('a');
                            if (a) a.click();
                        }
                    }
                """, row_index)
            dl = await dl_info.value
            from pathlib import Path
            save_path = str(Path(dest) / dl.suggested_filename)
            await dl.save_as(save_path)
            return save_path
        except Exception:
            return None
