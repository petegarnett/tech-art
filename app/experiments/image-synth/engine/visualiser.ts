/**
 * Pure draw helpers for the image synth overlay.
 *
 * Called from CameraView's draw loop after the B&W camera image is drawn.
 * Don't read state — everything is passed in.
 */
import type { VoiceLevels } from "./types";

/** Draw the moving scanline (sweep mode only). */
export function drawScanline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scanX: number, // 0-1
): void {
  const x = scanX * width;
  // Gradient for a glow effect
  const grad = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
  grad.addColorStop(0, "rgba(100, 200, 255, 0)");
  grad.addColorStop(0.5, "rgba(100, 200, 255, 0.85)");
  grad.addColorStop(1, "rgba(100, 200, 255, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x - 12, 0, 24, height);
  // Hard centre line
  ctx.fillStyle = "rgba(180, 230, 255, 0.95)";
  ctx.fillRect(x - 0.5, 0, 1, height);
}

/**
 * Draw faint horizontal lines marking each oscillator row (the "staff").
 * Loud rows highlight more brightly.
 */
export function drawStaff(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  levels: VoiceLevels,
): void {
  const voices = levels.length;
  ctx.lineWidth = 1;
  for (let v = 0; v < voices; v++) {
    // Voice 0 = bottom (low pitch), highest index = top (high pitch).
    const y = height - ((v + 0.5) / voices) * height;
    const lv = Math.min(1, levels[v]);
    const a = 0.05 + lv * 0.45;
    ctx.strokeStyle = `rgba(180, 230, 255, ${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}
