"use client";

/**
 * VisualiserView — a <canvas> that hosts a VisualiserGL instance.
 *
 * Owns the canvas DOM node; the engine ref is passed in from the page so
 * the main animation loop can call `update` / `draw` directly.
 *
 * If the browser doesn't support WebGL2, the component renders a centered
 * fallback message instead of attempting to draw.
 */
import { useEffect, useRef, useState } from "react";
import type { VisualiserGL } from "../engine/visualiserGL";
import type { CompositionMode } from "../engine/types";

interface Props {
  /** Ref to the engine. Created lazily on mount if .current is null. */
  engineRef: React.MutableRefObject<VisualiserGL | null>;
  /** Factory to instantiate the engine on first mount. */
  makeEngine: () => VisualiserGL;
  /** Current composition mode — controls visibility / opacity. */
  composition: CompositionMode;
}

export default function VisualiserView({ engineRef, makeEngine, composition }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!engineRef.current) engineRef.current = makeEngine();
    const ok = engineRef.current.init(canvas);
    const errMsg = ok ? null : (engineRef.current.error ?? "WebGL2 unavailable");
    // Defer the setState so we're not synchronously updating React from the
    // effect body — pattern preferred by react-hooks/set-state-in-effect.
    const tid = queueMicrotask(() => setError(errMsg));
    void tid;
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [engineRef, makeEngine]);

  const visible = composition !== "camera-only";
  const opacity = composition === "viz-underlay" ? 1 : 1;
  const blendMode = composition === "viz-overlay" ? "screen" : "normal";

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity,
        mixBlendMode: blendMode as React.CSSProperties["mixBlendMode"],
        display: visible ? "block" : "none",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/60 text-center px-4 leading-relaxed">
          {error}
          <br />
          Falling back to camera view.
        </div>
      )}
    </div>
  );
}
