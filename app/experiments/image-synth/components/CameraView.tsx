"use client";

/**
 * CameraView — renders the camera feed (B&W, mirrored) + scanline + staff overlay.
 *
 * Reads frame data from a CameraEngine each rAF tick, converts to grayscale,
 * paints to canvas, then draws overlays. Reads `scanXRef` and `levelsRef`
 * for zero-lag display.
 */
import { useEffect, useRef } from "react";
import type { CameraEngine } from "../engine/camera";
import type { CameraConfig, VoiceLevels } from "../engine/types";
import { drawScanline, drawStaff } from "../engine/visualiser";

interface Props {
  cameraRef: React.MutableRefObject<CameraEngine | null>;
  configRef: React.MutableRefObject<CameraConfig>;
  scanXRef: React.MutableRefObject<number>;
  showScanline: boolean;
  levelsRef: React.MutableRefObject<VoiceLevels>;
}

export default function CameraView({
  cameraRef,
  configRef,
  scanXRef,
  showScanline,
  levelsRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const cam = cameraRef.current;
      const cfg = configRef.current;
      const wrap = canvas.parentElement;
      if (!wrap) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = rect.width;
      const H = rect.height;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      if (cam?.active) {
        const frame = cam.getFrame();
        if (frame) {
          // Convert to grayscale in-place visualisation
          paintGrayscale(ctx, frame, cfg, W, H);
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "11px var(--font-geist-mono, monospace)";
        ctx.textAlign = "center";
        ctx.fillText("Camera off", W / 2, H / 2);
      }

      drawStaff(ctx, W, H, levelsRef.current);
      if (showScanline) drawScanline(ctx, W, H, scanXRef.current);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cameraRef, configRef, scanXRef, showScanline, levelsRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
    />
  );
}

/**
 * Paint the camera frame in B&W (or threshold mode) scaled to fit the canvas.
 *
 * We render the frame at its native size into an offscreen temp canvas, then
 * use drawImage to scale it onto the display canvas (aspect-fit).
 */
function paintGrayscale(
  ctx: CanvasRenderingContext2D,
  frame: ImageData,
  cfg: CameraConfig,
  W: number,
  H: number,
): void {
  const { data, width, height } = frame;
  // Mutate the frame in-place for B&W display
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (cfg.invert) lum = 1 - lum;
    if (lum < cfg.threshold) lum = 0;
    else if (cfg.bw) lum = 1;
    else lum = (lum - cfg.threshold) / (1 - cfg.threshold);
    const v = Math.round(lum * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
  // putImageData to a temp canvas then draw scaled.
  const holder = paintGrayscale as unknown as { _tmp?: HTMLCanvasElement };
  const tmp = holder._tmp ?? (holder._tmp = document.createElement("canvas"));
  tmp.width = width;
  tmp.height = height;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.putImageData(frame, 0, 0);

  // Aspect-fit
  const tar = W / H;
  const far = width / height;
  let dw = W, dh = H, dx = 0, dy = 0;
  if (far > tar) {
    dh = W / far;
    dy = (H - dh) / 2;
  } else {
    dw = H * far;
    dx = (W - dw) / 2;
  }
  ctx.drawImage(tmp, dx, dy, dw, dh);
}
