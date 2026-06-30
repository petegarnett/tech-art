/**
 * Pure functions: convert a grayscale frame into per-voice destination values.
 *
 * The pipeline:
 *   1. computeGrey — fills a Float32Array of per-voice grey values (0-1) from
 *      the frame, using sweep or freeze mode (unchanged from v1).
 *   2. routeToDestinations — uses the user's MatrixConfig depths and the
 *      DESTINATIONS table to turn per-voice grey into per-voice values for
 *      each destination, stored in VoiceStateBuffers.
 *
 * Both functions are pure and allocation-free given pre-allocated outputs.
 */
import type {
  MatrixConfig,
  ScanMode,
  VoiceLevels,
  VoiceStateBuffers,
} from "./types";
import { DESTINATIONS } from "./destinations";

/**
 * Fill per-voice grey value from the frame.
 *
 * - Image rows top-down; voices bottom-up (voice 0 = lowest pitch = bottom).
 * - Sweep mode: read a 3-column window around scanX.
 * - Freeze mode: average all columns.
 *
 * `out` length should equal `voices`.
 */
export function computeGrey(
  gray: Float32Array,
  width: number,
  height: number,
  voices: number,
  mode: ScanMode,
  scanX: number,
  out: VoiceLevels,
): void {
  const rowsPerVoice = height / voices;
  if (mode === "sweep") {
    const cx = Math.floor(scanX * (width - 1));
    const c0 = Math.max(0, cx - 1);
    const c1 = Math.min(width - 1, cx + 1);
    for (let v = 0; v < voices; v++) {
      const topRow = Math.floor((voices - 1 - v) * rowsPerVoice);
      const botRow = Math.floor((voices - v) * rowsPerVoice);
      let sum = 0;
      let count = 0;
      for (let r = topRow; r < botRow; r++) {
        for (let c = c0; c <= c1; c++) {
          sum += gray[r * width + c];
          count++;
        }
      }
      out[v] = count > 0 ? sum / count : 0;
    }
  } else {
    for (let v = 0; v < voices; v++) {
      const topRow = Math.floor((voices - 1 - v) * rowsPerVoice);
      const botRow = Math.floor((voices - v) * rowsPerVoice);
      let sum = 0;
      let count = 0;
      for (let r = topRow; r < botRow; r++) {
        for (let c = 0; c < width; c++) {
          sum += gray[r * width + c];
          count++;
        }
      }
      out[v] = count > 0 ? sum / count : 0;
    }
  }
}

/**
 * Backwards-compatible wrapper kept for any external callers — fills only
 * the voice level (volume-equivalent) array.
 *
 * @deprecated use computeGrey + routeToDestinations instead
 */
export function sonifyFrame(
  gray: Float32Array,
  width: number,
  height: number,
  voices: number,
  mode: ScanMode,
  scanX: number,
  out: VoiceLevels,
): void {
  computeGrey(gray, width, height, voices, mode, scanX, out);
}

/**
 * Apply the routing matrix: for each voice, compute every destination's
 * target value from the grey value + user depth.
 *
 * Pre-allocate `buffers` once per voice-count change; this function only
 * writes into them.
 */
export function routeToDestinations(
  grey: VoiceLevels,
  matrix: MatrixConfig,
  buffers: VoiceStateBuffers,
): void {
  const voices = grey.length;
  // Pull each destination's mapping into local refs to avoid lookups in the
  // hot loop. The destinations list is tiny (9) — order matches the buffer
  // field order, but we cross-reference by id for clarity.
  for (const def of DESTINATIONS) {
    const depth = matrix[def.id];
    const target = buffers[def.id];
    const mapGrey = def.mapGrey;
    for (let v = 0; v < voices; v++) {
      target[v] = mapGrey(depth, grey[v]);
    }
  }
}
