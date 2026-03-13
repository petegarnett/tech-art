import { NextResponse } from 'next/server';

/**
 * Weather API proxy — fetches current conditions from Open-Meteo.
 * Uses Open-Meteo (free, no API key required) with 5-minute cache.
 * Expects ?lat=XX&lon=YY query parameters from browser geolocation.
 * Returns: current temp, weather code, wind, humidity, daily high/low.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');

  if (!lat || !lon) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    const data = await res.json();

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch weather' }, { status: 500 });
  }
}
