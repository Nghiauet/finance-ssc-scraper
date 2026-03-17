"""CLI entry point for scrape-ssc."""

import argparse
import asyncio
from pathlib import Path

from scrape_ssc.scraper import SSCScraper


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape financial reports from SSC Vietnam",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
examples:
  scrape-ssc                                   # latest 5 pages
  scrape-ssc --ticker VNM                      # all VNM reports
  scrape-ssc --ticker VNM --download-all       # + download files
  scrape-ssc --ticker FPT --from-date 01/01/2024 --to-date 31/12/2024
  scrape-ssc --max-pages 50                    # 50 pages of all reports
""",
    )
    parser.add_argument("--ticker", help="Filter by stock ticker (e.g. VNM)")
    parser.add_argument("--max-pages", type=int, default=5,
                        help="Max pages (default: 5, 0 = all)")
    parser.add_argument("--max-downloads", type=int, default=0,
                        help="Download N files from page 1 (default: 0)")
    parser.add_argument("--download-all", action="store_true",
                        help="Download every file on every page")
    parser.add_argument("--from-date", help="From date (dd/mm/yyyy)")
    parser.add_argument("--to-date", help="To date (dd/mm/yyyy)")
    parser.add_argument("--output", "-o", help="Output directory (default: auto)")
    args = parser.parse_args()

    ticker = args.ticker if args.ticker else None
    suffix = f"_{ticker}" if ticker else ""
    output_dir = Path(args.output) if args.output else Path(f"financial_reports_data{suffix}")
    downloads_dir = output_dir / "downloads"

    def on_page(page_num: int, rows: list[dict]) -> None:
        count = len(rows)
        sample = ""
        if rows:
            r = rows[0]
            sample = f" | {r.get('ticker', '?')} - {r.get('report_name', '')[:50]}"
        print(f"  Page {page_num}: {count} rows{sample}")

    async def run() -> None:
        async with SSCScraper() as scraper:
            print(f"Scraping SSC portal...")
            if ticker:
                print(f"  Ticker: {ticker}")
            if args.from_date:
                print(f"  From: {args.from_date}")
            if args.to_date:
                print(f"  To: {args.to_date}")

            result = await scraper.scrape(
                ticker=ticker,
                from_date=args.from_date,
                to_date=args.to_date,
                max_pages=args.max_pages or None,
                max_downloads=args.max_downloads,
                download_all=args.download_all,
                downloads_dir=str(downloads_dir),
                on_page=on_page,
            )

            result.save(output_dir)

            print(f"\nScraped {len(result.reports)} reports")
            print(f"  JSON: {output_dir / 'financial_reports.json'}")
            print(f"  CSV:  {output_dir / 'financial_reports.csv'}")
            if result.downloaded_files:
                print(f"  Downloads: {len(result.downloaded_files)} files in {downloads_dir}/")

            tickers = {r["ticker"] for r in result.reports if r.get("ticker")}
            if len(tickers) > 1:
                print(f"  Unique tickers: {len(tickers)}")

    asyncio.run(run())


if __name__ == "__main__":
    main()
