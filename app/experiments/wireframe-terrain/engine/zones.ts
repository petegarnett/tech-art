/**
 * Spatial audio zones — circular regions of the terrain that respond
 * to a single frequency band. Adds on top of the global routing matrix.
 *
 * Coordinates are normalised:
 *   x ∈ [0, 1]  — left to right of the terrain
 *   z ∈ [0, 1]  — near (camera) to far (horizon)
 *   radius ∈ (0, 1]
 *
 * The renderer maps these to the world-space grid extent.
 */

import type { BandId, BandLevels, DestinationId } from "./types";

/**
 * A single spatial audio brush. The terrain renderer evaluates each vertex
 * against every zone — if the vertex falls inside the zone, the zone's
 * destinations are scaled by the band level × falloff and contributed.
 */
export interface Zone {
  id: string;
  band: BandId;
  /** Centre X in normalised terrain coords, 0 = left, 1 = right. */
  x: number;
  /** Centre Z in normalised terrain coords, 0 = near, 1 = far. */
  z: number;
  /** Radius in normalised coords (same scale as x). */
  radius: number;
  /** Hardness: 0 = soft fade from centre, 1 = sharp edge. */
  hardness: number;
  /** Per-destination depth contribution inside the zone. */
  destinations: Partial<Record<DestinationId, number>>;
  /** Optional hex colour tint blended into vertices in this zone. */
  tint: string | null;
  /** Tint depth 0-1. */
  tintDepth: number;
}

/** Hard cap on simultaneously-active zones, to keep the per-vertex cost bounded. */
export const MAX_ZONES = 8;

/**
 * Distance-based falloff inside a zone.
 * Returns 0 outside the zone, 1 at the centre, smoothly faded between.
 * `hardness` controls where the "solid" core ends and the fade begins.
 */
export function zoneFalloff(
  vx: number,
  vz: number,
  zone: Zone,
): number {
  const dx = vx - zone.x;
  const dz = vz - zone.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= zone.radius) return 0;
  // Inner core radius — fully active.
  const inner = zone.radius * zone.hardness;
  if (d <= inner) return 1;
  // Smooth fade between inner and outer radius.
  const t = (zone.radius - d) / (zone.radius - inner);
  // Smoothstep for a softer curve than linear.
  return t * t * (3 - 2 * t);
}

/**
 * Result of evaluating all zones at a single vertex.
 *
 * `mods` is a sparse map of destination → modulation amount (added on top of
 * the global matrix mods). `tintR/G/B/tintWeight` accumulate a weighted-sum
 * tint that the draw loop divides through by `tintWeight` to get the colour.
 */
export interface ZoneEvaluation {
  mods: Partial<Record<DestinationId, number>>;
  tintR: number;
  tintG: number;
  tintB: number;
  /** Sum of contributions weighted by tintDepth — also the blend amount (0-1+). */
  tintWeight: number;
}

/**
 * Sum contributions from all zones for a single vertex.
 * Returns a map of destination → modulation amount, plus a weighted tint.
 *
 * The draw loop calls this per vertex per frame — keep it lean.
 */
export function evaluateZones(
  vx: number,
  vz: number,
  zones: Zone[],
  levels: BandLevels,
): ZoneEvaluation {
  const result: ZoneEvaluation = {
    mods: {},
    tintR: 0,
    tintG: 0,
    tintB: 0,
    tintWeight: 0,
  };
  for (const z of zones) {
    const f = zoneFalloff(vx, vz, z);
    if (f === 0) continue;
    const contrib = levels[z.band] * f;
    for (const [dest, depth] of Object.entries(z.destinations)) {
      if (!depth) continue;
      const key = dest as DestinationId;
      result.mods[key] = (result.mods[key] ?? 0) + contrib * depth;
    }
    if (z.tint && z.tintDepth > 0) {
      const [r, g, b] = hexToRgb(z.tint);
      const w = contrib * z.tintDepth;
      result.tintR += r * w;
      result.tintG += g * w;
      result.tintB += b * w;
      result.tintWeight += w;
    }
  }
  return result;
}

/** Inline hex → rgb to avoid a cross-module import in the hot path. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Create a new zone with sensible defaults at the given position. */
export function newZone(x: number, z: number, band: BandId): Zone {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `zone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    band,
    x,
    z,
    radius: 0.2,
    hardness: 0.3,
    destinations: { amplitude: 0.6 },
    tint: null,
    tintDepth: 0.5,
  };
}

/** Default colour per band for the editor display. */
export const BAND_COLOURS: Record<BandId, string> = {
  sub: "#ff3366",
  bass: "#ff8833",
  lowMid: "#ffcc33",
  highMid: "#66ff66",
  high: "#33ccff",
  air: "#cc66ff",
};
