"use client";

/**
 * ActivityMeter — vertical strip of horizontal bars showing live voice levels.
 *
 * Lowest voice at bottom, highest at top. Reads directly from `levelsRef`
 * each rAF tick, so no React re-renders. Used to make the polyphony visible
 * even when the camera image alone is hard to read.
 */
import { useEffect, useRef } from "react";
import type { VoiceLevels } from "../engine/types";

interface Props {
  levelsRef: React.MutableRefObject<VoiceLevels>;
}

export default function ActivityMeter({ levelsRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const levels = levelsRef.current;
      const n = levels.length;
      for (let i = 0; i < n; i++) {
        const y = H - ((i + 1) / n) * H;
        const lv = Math.min(1, levels[i]);
        const hue = (i / n) * 240 + 180; // sweep through blues/purples bottom→top
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.3 + lv * 0.7})`;
        const bandH = H / n;
        ctx.fillRect(0, y, lv * W, bandH - 1);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelsRef]);
  return <canvas ref={canvasRef} className="w-full h-full" />;
}
