"use client";

/**
 * SpectrumAnalyser — 6-band live meter rendered to its own canvas.
 *
 * Reads the engine's BandLevels through a ref (mutated each frame by the
 * page's draw loop), so this component never re-renders just for visuals.
 */

import { useEffect, useRef } from "react";
import { BAND_IDS, BAND_LABELS } from "../engine/types";
import type { BandLevels } from "../engine/types";

interface Props {
  /** Ref that the audio engine writes levels into every frame. */
  levelsRef: React.MutableRefObject<BandLevels>;
  height?: number;
}

export default function SpectrumAnalyser({ levelsRef, height = 60 }: Props) {
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
      const W = rect.width;
      const H = rect.height;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const barCount = BAND_IDS.length;
      const gap = 4;
      const barW = (W - gap * (barCount - 1)) / barCount;
      const levels = levelsRef.current;

      for (let i = 0; i < barCount; i++) {
        const band = BAND_IDS[i];
        const level = Math.min(1, levels[band]);
        const x = i * (barW + gap);
        const h = level * (H - 12);
        // Background slot
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x, 0, barW, H - 12);
        // Filled bar — hue rotates across the spectrum
        const hue = (i / barCount) * 280 + 200;
        ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
        ctx.fillRect(x, H - 12 - h, barW, h);
        // Label
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "8px var(--font-geist-mono, monospace)";
        ctx.textAlign = "center";
        ctx.fillText(BAND_LABELS[band], x + barW / 2, H - 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelsRef]);

  return <canvas ref={canvasRef} className="w-full" style={{ height }} />;
}
