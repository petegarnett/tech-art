"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import { clamp } from "@/lib/math/utils";
import LEDCanvas from "./components/LEDCanvas";
import ControlPanel from "./components/ControlPanel";
import { FrameBuffer } from "./engine/frame-buffer";
import { ANIMATION_PRESETS } from "./engine/animations";
import { compilePixelFunction } from "./engine/evaluator";
import type {
  GridMapping,
  PixelShape,
  AppearanceConfig,
  PixelFunction,
} from "./engine/types";

const DEFAULT_CODE = `// Each pixel receives x, y coordinates and time t
// Return [r, g, b] where each value is 0-255
const hue = (x + y + t * 2) * 10 % 360;
const s = 1, l = 0.5;
const c = (1 - Math.abs(2 * l - 1)) * s;
const h2 = hue / 60;
const x2 = c * (1 - Math.abs(h2 % 2 - 1));
const m = l - c / 2;
let r1, g1, b1;
if (h2 < 1) { r1 = c; g1 = x2; b1 = 0; }
else if (h2 < 2) { r1 = x2; g1 = c; b1 = 0; }
else if (h2 < 3) { r1 = 0; g1 = c; b1 = x2; }
else if (h2 < 4) { r1 = 0; g1 = x2; b1 = c; }
else if (h2 < 5) { r1 = x2; g1 = 0; b1 = c; }
else { r1 = c; g1 = 0; b1 = x2; }
return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];`;

export default function LEDMatrixPage() {
  // Grid config
  const [cols, setCols] = useState(16);
  const [rows, setRows] = useState(16);
  const [mapping, setMapping] = useState<GridMapping>("ltr");

  // Appearance
  const [pixelShape, setPixelShape] = useState<PixelShape>("circle");
  const [gap, setGap] = useState(2);
  const [bloom, setBloom] = useState(true);
  const [bgColor, setBgColor] = useState("#111111");
  const [brightness, setBrightness] = useState(1);

  // Animation
  const [activePreset, setActivePreset] = useState<string | null>(
    "rainbow-wave",
  );
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);

  // Custom code
  const [customCode, setCustomCode] = useState(DEFAULT_CODE);
  const [codeError, setCodeError] = useState<string | null>(null);

  // FPS tracking
  const [fps, setFps] = useState(60);

  // Frame buffer
  const bufferRef = useRef(new FrameBuffer(cols, rows));

  // Recreate buffer when grid size changes
  useEffect(() => {
    bufferRef.current = new FrameBuffer(cols, rows);
  }, [cols, rows]);

  // Active pixel function
  const pixelFnRef = useRef<PixelFunction>(ANIMATION_PRESETS[0].fn);

  // Update pixel function when preset changes
  useEffect(() => {
    if (activePreset) {
      const preset = ANIMATION_PRESETS.find((p) => p.id === activePreset);
      if (preset) pixelFnRef.current = preset.fn;
    }
  }, [activePreset]);

  // Apply custom code
  const handleApplyCode = useCallback(() => {
    const { fn, error } = compilePixelFunction(customCode);
    if (error) {
      setCodeError(error);
    } else if (fn) {
      setCodeError(null);
      pixelFnRef.current = fn;
      setActivePreset(null);
    }
  }, [customCode]);

  // Animation loop — runs in a rAF, updates the buffer
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const fpsAccRef = useRef(0);
  const fpsCountRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    lastTimeRef.current = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // FPS tracking
      fpsAccRef.current += dt;
      fpsCountRef.current += 1;
      if (fpsAccRef.current >= 0.5) {
        setFps(fpsCountRef.current / fpsAccRef.current);
        fpsAccRef.current = 0;
        fpsCountRef.current = 0;
      }

      if (!paused) {
        timeRef.current += dt * speed;
        frameRef.current += 1;
      }

      const buf = bufferRef.current;
      const fn = pixelFnRef.current;
      const t = timeRef.current;
      const frame = frameRef.current;
      const c = buf.cols;
      const r = buf.rows;
      const br = brightness;

      for (let y = 0; y < r; y++) {
        for (let x = 0; x < c; x++) {
          try {
            const [pr, pg, pb] = fn(x, y, t, c, r, frame);
            buf.setPixel(
              x,
              y,
              Math.round(clamp(pr, 0, 255) * br),
              Math.round(clamp(pg, 0, 255) * br),
              Math.round(clamp(pb, 0, 255) * br),
            );
          } catch {
            buf.setPixel(x, y, 0, 0, 0);
          }
        }
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [paused, speed, brightness]);

  const appearance: AppearanceConfig = {
    pixelShape,
    gap,
    bloom,
    bgColor,
    brightness,
  };

  return (
    <ExperimentLayout title="LED Matrix">
      <div className="w-full h-auto lg:h-full flex flex-col lg:flex-row pt-12">
        {/* Canvas area */}
        <div className="h-[60vh] lg:h-auto lg:flex-1 relative min-h-0">
          <LEDCanvas buffer={bufferRef.current} appearance={appearance} />
        </div>

        {/* Control panel */}
        <ControlPanel
          cols={cols}
          rows={rows}
          setCols={setCols}
          setRows={setRows}
          mapping={mapping}
          setMapping={setMapping}
          pixelShape={pixelShape}
          setPixelShape={setPixelShape}
          gap={gap}
          setGap={setGap}
          bloom={bloom}
          setBloom={setBloom}
          bgColor={bgColor}
          setBgColor={setBgColor}
          brightness={brightness}
          setBrightness={setBrightness}
          activePreset={activePreset}
          setActivePreset={setActivePreset}
          speed={speed}
          setSpeed={setSpeed}
          paused={paused}
          setPaused={setPaused}
          customCode={customCode}
          setCustomCode={setCustomCode}
          codeError={codeError}
          onApplyCode={handleApplyCode}
          buffer={bufferRef.current}
          fps={fps}
        />
      </div>
    </ExperimentLayout>
  );
}
