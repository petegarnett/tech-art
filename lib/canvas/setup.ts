"use client";

import { useEffect, useRef, useState, useCallback, type RefObject } from "react";

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  frameCount: number;
  deltaTime: number;
  elapsed: number;
}

export type DrawFn = (context: DrawContext) => void;

export interface UseCanvasResult {
  width: number;
  height: number;
  frameCount: number;
}

/**
 * React hook that manages a canvas element with:
 * - Automatic resize handling
 * - DPR-aware scaling
 * - requestAnimationFrame loop
 *
 * Usage:
 *   const canvasRef = useRef<HTMLCanvasElement>(null);
 *   const { width, height } = useCanvas(canvasRef, ({ ctx, width, height, frameCount }) => {
 *     ctx.clearRect(0, 0, width, height);
 *     // draw...
 *   });
 */
export function useCanvas(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: DrawFn,
): UseCanvasResult {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const frameCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const prevTimeRef = useRef(0);
  const drawRef = useRef(draw);

  // Keep draw callback ref current without re-triggering effect
  drawRef.current = draw;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    setSize({ width, height });
  }, [canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    resize();

    const observer = new ResizeObserver(resize);
    const parent = canvas.parentElement;
    if (parent) observer.observe(parent);

    startTimeRef.current = performance.now();
    prevTimeRef.current = startTimeRef.current;
    frameCountRef.current = 0;

    let rafId: number;

    const loop = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      const deltaTime = (now - prevTimeRef.current) / 1000;
      const elapsed = (now - startTimeRef.current) / 1000;
      prevTimeRef.current = now;
      frameCountRef.current += 1;

      ctx.save();
      ctx.scale(dpr, dpr);

      drawRef.current({
        ctx,
        width,
        height,
        dpr,
        frameCount: frameCountRef.current,
        deltaTime,
        elapsed,
      });

      ctx.restore();

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [canvasRef, resize]);

  return {
    width: size.width,
    height: size.height,
    frameCount: frameCountRef.current,
  };
}
