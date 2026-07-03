"use client";

/**
 * ShaderCanvas — the fullscreen WebGL host.
 *
 * Bare wrapper: a `<canvas>` sized to fill the viewport, plus a graceful
 * fallback message when WebGL2 is unavailable or the shader fails to compile.
 *
 * The canvas ref is forwarded up to page.tsx via `onCanvasReady`, which
 * calls VisualiserGL.init(canvas) once. From then on, the loop hook drives
 * update/draw.
 */

import { useEffect, useRef } from "react";

interface Props {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  /** True when init returned false — show a fallback banner. */
  fallbackVisible?: boolean;
}

export default function ShaderCanvas({ onCanvasReady, fallbackVisible }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (ref.current && !notifiedRef.current) {
      notifiedRef.current = true;
      onCanvasReady(ref.current);
    }
  }, [onCanvasReady]);

  return (
    <>
      <canvas
        ref={ref}
        className="fixed inset-0 w-full h-full block"
        style={{ zIndex: 0 }}
      />
      {fallbackVisible && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
          <div className="max-w-md px-6 py-4 rounded bg-black/70 border border-white/10 text-center">
            <p className="text-white/70 text-sm mb-1">WebGL2 unavailable</p>
            <p className="text-white/40 text-xs leading-relaxed">
              This experiment needs WebGL2. Try Chrome, or check that hardware acceleration is enabled in your browser settings.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
