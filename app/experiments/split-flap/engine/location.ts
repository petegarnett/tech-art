/**
 * Browser geolocation with reverse geocoding.
 * Uses the Geolocation API to get lat/lon, then Nominatim
 * (OpenStreetMap) to resolve a human-readable city name.
 * Falls back to London if geolocation is denied or unavailable.
 */

export interface Location {
  lat: number;
  lon: number;
  name: string;
}

/** Request browser location and reverse-geocode to a city name. */
export function getLocation(): Promise<Location> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      // SSR or no geolocation — default to London
      resolve({ lat: 51.5074, lon: -0.1278, name: 'LONDON' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json();
          const name = data.address?.city || data.address?.town || data.address?.village || 'UNKNOWN';
          resolve({ lat: latitude, lon: longitude, name });
        } catch {
          resolve({ lat: latitude, lon: longitude, name: 'UNKNOWN' });
        }
      },
      () => {
        // Default to London if geolocation denied
        resolve({ lat: 51.5074, lon: -0.1278, name: 'LONDON' });
      },
      { timeout: 5000 }
    );
  });
}
