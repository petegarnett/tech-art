/**
 * Routing — pure functions over the 6×8 modulation matrix.
 *
 * The matrix is a depth grid: matrix[band][destination] in [0, 1].
 * Per frame the draw loop sums level[band] * matrix[band][destination]
 * across all bands for each visual destination — that's the modulation
 * amount fed into that parameter.
 */

import { BAND_IDS, DESTINATION_IDS } from "./types";
import type { BandLevels, DestinationId, RoutingMatrix } from "./types";

/** Empty matrix — all zero. */
export function emptyMatrix(): RoutingMatrix {
  const m = {} as RoutingMatrix;
  for (const b of BAND_IDS) {
    m[b] = {} as Record<DestinationId, number>;
    for (const d of DESTINATION_IDS) m[b][d] = 0;
  }
  return m;
}

/** Deep clone — presets share structure with the live matrix, so we copy on use. */
export function cloneMatrix(m: RoutingMatrix): RoutingMatrix {
  const out = {} as RoutingMatrix;
  for (const b of BAND_IDS) {
    out[b] = {} as Record<DestinationId, number>;
    for (const d of DESTINATION_IDS) out[b][d] = m[b][d];
  }
  return out;
}

/**
 * Routing presets — common patches.
 * Values are depth (0-1) for each band → destination.
 */
export type PresetId =
  | "off"
  | "default"
  | "kick"
  | "vocal"
  | "synthwave"
  | "subtle";

export const PRESETS: Record<PresetId, { label: string; matrix: RoutingMatrix }> =
  {
    off: { label: "Off", matrix: emptyMatrix() },
    default: {
      label: "Default",
      matrix: (() => {
        const m = emptyMatrix();
        m.bass.amplitude = 0.8;
        m.lowMid.frequency = 0.5;
        m.high.detail = 0.6;
        return m;
      })(),
    },
    kick: {
      label: "Kick Driven",
      matrix: (() => {
        const m = emptyMatrix();
        m.sub.amplitude = 1.0;
        m.sub.brightness = 0.6;
        m.bass.speed = 0.4;
        return m;
      })(),
    },
    vocal: {
      label: "Vocal Reactive",
      matrix: (() => {
        const m = emptyMatrix();
        m.highMid.hueShift = 0.7;
        m.high.detail = 0.5;
        m.air.lineWidth = 0.4;
        return m;
      })(),
    },
    synthwave: {
      label: "Synthwave",
      matrix: (() => {
        const m = emptyMatrix();
        m.bass.amplitude = 0.7;
        m.bass.speed = 0.3;
        m.lowMid.tilt = 0.3;
        m.highMid.hueShift = 0.8;
        m.high.brightness = 0.4;
        m.air.lineWidth = 0.5;
        return m;
      })(),
    },
    subtle: {
      label: "Subtle",
      matrix: (() => {
        const m = emptyMatrix();
        for (const b of BAND_IDS)
          for (const d of DESTINATION_IDS) m[b][d] = 0.15;
        return m;
      })(),
    },
  };

/**
 * Total modulation at a destination =
 *   sum over bands of (level[band] * matrix[band][destination])
 * Returns 0-N (can exceed 1 if multiple bands sum).
 */
export function getDestinationMod(
  matrix: RoutingMatrix,
  levels: BandLevels,
  dest: DestinationId,
): number {
  let total = 0;
  for (const b of BAND_IDS) total += levels[b] * matrix[b][dest];
  return total;
}
