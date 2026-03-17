#!/usr/bin/env python3
"""Quick-start example of using SSCScraper as a library."""
import asyncio
from scrape_ssc import SSCScraper


async def main():
    async with SSCScraper() as scraper:
        # Scrape all VNM financial reports
        result = await scraper.scrape(ticker="VNM", max_pages=0)
        print(f"Found {len(result.reports)} reports")
        for r in result.reports:
            print(f"  {r['ticker']} | {r['report_name']} | {r['submission_date']}")

        # Save to disk
        result.save("output_VNM")


if __name__ == "__main__":
    asyncio.run(main())
