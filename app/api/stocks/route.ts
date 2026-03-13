import { NextResponse } from 'next/server';

/**
 * Stock market API — fetches real-time prices from Yahoo Finance.
 * No API key required. Cached for 1 minute.
 * Returns: array of { symbol, price, changePercent } objects.
 * Falls back gracefully if Yahoo Finance blocks the request.
 */
const SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];

export async function GET() {
  try {
    const results = await Promise.all(
      SYMBOLS.map(async (symbol) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
          const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            next: { revalidate: 60 },
          });
          const data = await res.json();
          const meta = data.chart?.result?.[0]?.meta;
          if (!meta) return null;

          const price = meta.regularMarketPrice ?? 0;
          const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? price;
          const changePercent = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;

          return { symbol, price, changePercent };
        } catch {
          return null;
        }
      })
    );

    return NextResponse.json({
      stocks: results.filter(Boolean),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch stocks' }, { status: 500 });
  }
}
