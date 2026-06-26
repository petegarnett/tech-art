/**
 * Pure function: convert a grayscale frame into per-voice amplitudes.
 *
 * Image rows are top-down; voices are bottom-up (voice 0 = lowest pitch =
 * bottom of image). We compress `height` rows into `voices` bands by
 * averaging contiguous row groups.
 *
 * In sweep mode, we sample a 3-column window at `scanX`. In freeze mode,
 * we average across all columns.
 */
import type { ScanMode, VoiceLevels } from "./types";

/**
 * Compute per-voice amplitude from a grayscale frame.
 *
 * - The image has `height` rows. We compress that into `voices` bands by
 *   averaging contiguous row groups.
 * - In sweep mode, only the column at `scanX` (0-1 normalised) is read.
 *   We sample a small window (3 columns) for smoother results.
 * - In freeze mode, all columns are averaged.
 * - Output is bottom-up: index 0 = bottom row band (lowest pitch),
 *   index voices-1 = top row band (highest pitch).
 *
 * Caller is responsible for clearing/initialising `out`.
 */
export function sonifyFrame(
  gray: Float32Array,
  width: number,
  height: number,
  voices: number,
  mode: ScanMode,
  scanX: number, // 0-1 normalised, used only in sweep mode
  out: VoiceLevels,
): void {
  const rowsPerVoice = height / voices;
  if (mode === "sweep") {
    // Sample a small 3-column window around scanX for smoother sweeps.
    const cx = Math.floor(scanX * (width - 1));
    const c0 = Math.max(0, cx - 1);
    const c1 = Math.min(width - 1, cx + 1);
    for (let v = 0; v < voices; v++) {
      // Voice 0 = bottom, voices-1 = top. Image rows go top-to-bottom.
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
    // freeze mode: average all columns.
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
