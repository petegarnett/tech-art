import { NextResponse } from 'next/server';

/**
 * News API — fetches BBC News RSS feed and parses headlines.
 * No API key required. Cached for 5 minutes.
 * Returns: array of { title, source } objects (up to 20 items).
 * Handles both CDATA-wrapped and plain XML title formats.
 */
export async function GET() {
  try {
    const res = await fetch('https://feeds.bbci.co.uk/news/rss.xml', { next: { revalidate: 300 } });
    const xml = await res.text();

    // Simple XML parsing — extract <item><title> elements
    const items: { title: string; source: string }[] = [];
    const itemRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<\/item>/g;
    const itemRegex2 = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<\/item>/g;

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      items.push({ title: match[1], source: 'BBC NEWS' });
    }
    if (items.length === 0) {
      while ((match = itemRegex2.exec(xml)) !== null) {
        if (!match[1].includes('<')) {
          items.push({ title: match[1], source: 'BBC NEWS' });
        }
      }
    }

    return NextResponse.json({ items: items.slice(0, 20) });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}
