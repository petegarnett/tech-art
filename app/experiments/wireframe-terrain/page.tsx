"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import { useCanvas } from "@/lib/canvas/setup";
import { octaveNoise2D } from "@/lib/math/noise";
import { clamp, map, lerp } from "@/lib/math/utils";

/* ─── Colour helpers ─── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/* ─── Gradient presets ─── */

interface GradientPreset {
  name: string;
  colorA: string;
  colorB: string;
}

const GRADIENT_PRESETS: GradientPreset[] = [
  { name: "Classic Green", colorA: "#003300", colorB: "#00ff00" },
  { name: "Synthwave", colorA: "#ff00ff", colorB: "#00ffff" },
  { name: "Fire", colorA: "#ff0000", colorB: "#ffff00" },
  { name: "Ocean", colorA: "#000066", colorB: "#00ffff" },
  { name: "Amber", colorA: "#331a00", colorB: "#ffaa00" },
  { name: "Monochrome", colorA: "#333333", colorB: "#ffffff" },
];

/* ─── Audio analyser ─── */

interface AudioState {
  analyser: AnalyserNode | null;
  dataArray: Uint8Array<ArrayBuffer> | null;
  stream: MediaStream | null;
  context: AudioContext | null;
}

function getAudioBands(dataArray: Uint8Array<ArrayBuffer>): {
  bass: number;
  mids: number;
  highs: number;
  rms: number;
} {
  // Bass: bins 0-10
  let bassSum = 0;
  for (let i = 0; i <= 10; i++) bassSum += dataArray[i];
  const bass = bassSum / (11 * 255);

  // Mids: bins 10-40
  let midsSum = 0;
  for (let i = 10; i <= 40; i++) midsSum += dataArray[i];
  const mids = midsSum / (31 * 255);

  // Highs: bins 40-80
  let highsSum = 0;
  for (let i = 40; i <= 80; i++) highsSum += dataArray[i];
  const highs = highsSum / (41 * 255);

  // RMS of all bins
  let rmsSum = 0;
  const len = Math.min(dataArray.length, 128);
  for (let i = 0; i < len; i++) {
    const v = dataArray[i] / 255;
    rmsSum += v * v;
  }
  const rms = Math.sqrt(rmsSum / len);

  return { bass, mids, highs, rms };
}

/* ─── Main component ─── */

export default function WireframeTerrainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mode
  const [audioMode, setAudioMode] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<AudioState>({
    analyser: null,
    dataArray: null,
    stream: null,
    context: null,
  });

  // Smoothed audio values
  const smoothedAudio = useRef({ bass: 0, mids: 0, highs: 0, rms: 0 });

  // Parameters
  const [amplitude, setAmplitude] = useState(80);
  const [speed, setSpeed] = useState(1);
  const [frequency, setFrequency] = useState(0.05);
  const [gridDensity, setGridDensity] = useState(40);
  const [tilt, setTilt] = useState(0.6);
  const [lineWidth, setLineWidth] = useState(1);
  const [sensitivity, setSensitivity] = useState(1.5);

  // Colour
  const [baseColor, setBaseColor] = useState("#00ff00");
  const [gradientMode, setGradientMode] = useState(false);
  const [gradientA, setGradientA] = useState("#003300");
  const [gradientB, setGradientB] = useState("#00ff00");

  // Refs for draw loop (avoid stale closures)
  const paramsRef = useRef({
    amplitude,
    speed,
    frequency,
    gridDensity,
    tilt,
    lineWidth,
    baseColor,
    gradientMode,
    gradientA,
    gradientB,
    audioMode,
    sensitivity,
  });

  useEffect(() => {
    paramsRef.current = {
      amplitude,
      speed,
      frequency,
      gridDensity,
      tilt,
      lineWidth,
      baseColor,
      gradientMode,
      gradientA,
      gradientB,
      audioMode,
      sensitivity,
    };
  }, [
    amplitude,
    speed,
    frequency,
    gridDensity,
    tilt,
    lineWidth,
    baseColor,
    gradientMode,
    gradientA,
    gradientB,
    audioMode,
    sensitivity,
  ]);

  /* ─── Audio setup / teardown ─── */

  const startAudio = useCallback(async () => {
    try {
      setAudioError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      audioRef.current = { analyser, dataArray, stream, context };
      setAudioMode(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Microphone access denied";
      setAudioError(msg);
      setAudioMode(false);
    }
  }, []);

  const stopAudio = useCallback(() => {
    const { stream, context } = audioRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (context) context.close();
    audioRef.current = {
      analyser: null,
      dataArray: null,
      stream: null,
      context: null,
    };
    smoothedAudio.current = { bass: 0, mids: 0, highs: 0, rms: 0 };
    setAudioMode(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const { stream, context } = audioRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (context) context.close();
    };
  }, []);

  /* ─── Draw loop ─── */

  useCanvas(canvasRef, ({ ctx, width, height, elapsed }) => {
    const p = paramsRef.current;

    // Read audio data if in audio mode
    let audioAmp = p.amplitude;
    let audioFreq = p.frequency;
    let audioDetail = 0;
    let audioIntensity = 1;

    if (p.audioMode && audioRef.current.analyser && audioRef.current.dataArray) {
      audioRef.current.analyser.getByteFrequencyData(audioRef.current.dataArray);
      const bands = getAudioBands(audioRef.current.dataArray);

      // Smooth values
      const s = smoothedAudio.current;
      const smoothing = 0.15;
      s.bass = lerp(s.bass, bands.bass, smoothing);
      s.mids = lerp(s.mids, bands.mids, smoothing);
      s.highs = lerp(s.highs, bands.highs, smoothing);
      s.rms = lerp(s.rms, bands.rms, smoothing);

      const sens = p.sensitivity;
      audioAmp = p.amplitude * (0.3 + s.bass * 3.0 * sens);
      audioFreq = p.frequency * (0.5 + s.mids * 2.0 * sens);
      audioDetail = s.highs * 40 * sens;
      audioIntensity = 0.4 + s.rms * 2.0 * sens;
    }

    // Clear
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const cols = Math.round(p.gridDensity);
    const rows = Math.round(p.gridDensity * 1.5);

    // Grid dimensions in world space
    const gridWidth = 800;
    const gridDepth = 1200;
    const cellW = gridWidth / cols;
    const cellD = gridDepth / rows;

    // Camera / projection
    const focalLength = Math.min(width, height) * 0.9;
    const centerX = width / 2;
    const centerY = height * 0.5;

    // Camera elevation and tilt angle
    // tilt 0 = looking straight ahead, tilt 1 = looking steeply down
    const cameraHeight = 250 + p.tilt * 350; // 250-600 units above ground
    const tiltAngle = 0.3 + p.tilt * 0.7; // 0.3-1.0 radians (~17°-57°)
    const cosT = Math.cos(tiltAngle);
    const sinT = Math.sin(tiltAngle);

    const nearZ = 50;
    const farZ = nearZ + gridDepth;

    // Scrolling offset
    const scrollOffset = (elapsed * p.speed * 100) % cellD;

    // Precompute colour values
    const baseRgb = hexToRgb(p.baseColor);
    const gradARgb = hexToRgb(p.gradientA);
    const gradBRgb = hexToRgb(p.gradientB);

    // Build vertex grid
    // vertices[row][col] = { x, y, z, screenX, screenY, heightNorm }
    const vertices: {
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      hn: number;
    }[][] = [];

    const timeOffset = elapsed * p.speed * 0.5;

    let minH = Infinity;
    let maxH = -Infinity;

    for (let r = 0; r <= rows; r++) {
      const row: (typeof vertices)[0] = [];
      for (let c = 0; c <= cols; c++) {
        const x = (c - cols / 2) * cellW;
        const z = nearZ + r * cellD - scrollOffset;

        // Noise-based height
        const nx = x * audioFreq + timeOffset;
        const nz = z * audioFreq + timeOffset;
        let h = octaveNoise2D(nx, nz, 4, 0.5) * audioAmp;

        // Add high-frequency detail from audio
        if (audioDetail > 0) {
          h += octaveNoise2D(nx * 3, nz * 3, 2, 0.5) * audioDetail;
        }

        // Apply audio intensity
        h *= audioIntensity;

        if (h < minH) minH = h;
        if (h > maxH) maxH = h;

        // Tilt: shift y based on tilt parameter
        const y = -h;

        row.push({ x, y, z, sx: 0, sy: 0, hn: h });
      }
      vertices.push(row);
    }

    // Normalize heights and project
    const hRange = maxH - minH || 1;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const v = vertices[r][c];
        v.hn = (v.hn - minH) / hRange; // 0 to 1

        // Apply camera transform: elevate camera and rotate around X-axis
        // Camera is at (0, cameraHeight, 0) looking forward and down
        const vy = v.y - cameraHeight; // translate: camera is above
        const vz = v.z;

        // Rotate around X-axis by tiltAngle (look downward)
        const rotY = vy * cosT - vz * sinT;
        const rotZ = vy * sinT + vz * cosT;

        // Perspective projection
        if (rotZ > 10) {
          v.sx = (v.x / rotZ) * focalLength + centerX;
          v.sy = (rotY / rotZ) * focalLength + centerY;
          v.z = rotZ; // store rotated z for depth sorting/fog
        } else {
          v.z = 0; // mark as behind camera
        }
      }
    }

    // Draw grid lines
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const drawLine = (
      x1: number,
      y1: number,
      z1: number,
      hn1: number,
      x2: number,
      y2: number,
      z2: number,
      hn2: number,
    ) => {
      if (z1 <= 10 || z2 <= 10) return;

      const avgZ = (z1 + z2) / 2;
      const depthFade = clamp(map(avgZ, 10, farZ * cosT + cameraHeight * sinT, 1, 0.08), 0, 1);
      const avgHn = (hn1 + hn2) / 2;

      // Colour
      let r: number, g: number, b: number;
      if (p.gradientMode) {
        const col = lerpColor(gradARgb, gradBRgb, avgHn);
        r = col[0];
        g = col[1];
        b = col[2];
      } else {
        r = baseRgb[0];
        g = baseRgb[1];
        b = baseRgb[2];
      }

      const alpha = depthFade * (p.gradientMode ? 1 : 0.3 + avgHn * 0.7);
      ctx.strokeStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha.toFixed(3)})`;
      ctx.lineWidth = p.lineWidth * clamp(map(avgZ, 10, farZ * cosT + cameraHeight * sinT, 1, 0.2), 0.1, 3);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    // Draw back-to-front for proper layering
    for (let r = rows; r >= 0; r--) {
      for (let c = 0; c <= cols; c++) {
        const v = vertices[r][c];

        // Horizontal line (to right neighbor)
        if (c < cols) {
          const vr = vertices[r][c + 1];
          drawLine(v.sx, v.sy, v.z, v.hn, vr.sx, vr.sy, vr.z, vr.hn);
        }

        // Vertical line (to next row, closer to viewer)
        if (r > 0) {
          const vd = vertices[r - 1][c];
          drawLine(v.sx, v.sy, v.z, v.hn, vd.sx, vd.sy, vd.z, vd.hn);
        }
      }
    }

    // Audio level indicator
    if (p.audioMode) {
      const s = smoothedAudio.current;
      const barW = 3;
      const barH = 30;
      const bx = 16;
      const by = height - 16 - barH;

      ctx.globalAlpha = 0.4;
      const levels = [
        { val: s.bass, col: "#ff4444" },
        { val: s.mids, col: "#44ff44" },
        { val: s.highs, col: "#4444ff" },
        { val: s.rms, col: "#ffffff" },
      ];
      levels.forEach((l, i) => {
        ctx.fillStyle = l.col;
        const h = l.val * barH;
        ctx.fillRect(bx + i * (barW + 2), by + barH - h, barW, h);
      });
      ctx.globalAlpha = 1;
    }
  });

  /* ─── Toggle handlers ─── */

  const handleAudioToggle = () => {
    if (audioMode) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  const handleGradientPreset = (preset: GradientPreset) => {
    setGradientA(preset.colorA);
    setGradientB(preset.colorB);
    setGradientMode(true);
  };

  /* ─── Render ─── */

  return (
    <ExperimentLayout title="Wireframe Terrain">
      <div className="w-full h-full flex flex-col lg:flex-row pt-12">
        {/* Canvas area */}
        <div className="flex-1 relative min-h-0">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>

        {/* Control panel */}
        <div className="lg:w-72 xl:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="p-4 space-y-5">
            <h2 className="text-[10px] uppercase tracking-widest text-white/30 mb-4">
              Controls
            </h2>

            {/* ─── Mode ─── */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Input Mode
              </label>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/50">
                  {audioMode ? "Audio Reactive" : "Manual"}
                </span>
                <button
                  onClick={handleAudioToggle}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    audioMode ? "bg-white/30" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                      audioMode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              {audioError && (
                <p className="text-[10px] text-red-400/70">{audioError}</p>
              )}
            </div>

            {/* ─── Parameters ─── */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Parameters
              </label>

              {/* Amplitude */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Amplitude
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {amplitude}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={amplitude}
                  onChange={(e) => setAmplitude(Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                />
              </div>

              {/* Speed */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Speed
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {speed.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                />
              </div>

              {/* Frequency */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Frequency
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {frequency.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={0.2}
                  step={0.005}
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                />
              </div>

              {/* Grid Density */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Grid Density
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {gridDensity}
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={80}
                  step={1}
                  value={gridDensity}
                  onChange={(e) => setGridDensity(Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                />
              </div>

              {/* Tilt */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Tilt
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {tilt.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={tilt}
                  onChange={(e) => setTilt(Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                />
              </div>

              {/* Line Width */}
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider text-white/40">
                    Line Width
                  </span>
                  <span className="text-[10px] text-white/30 tabular-nums">
                    {lineWidth.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={lineWidth}
                  onChange={(e) => setLineWidth(Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                />
              </div>

              {/* Sensitivity (audio mode only) */}
              {audioMode && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      Sensitivity
                    </span>
                    <span className="text-[10px] text-white/30 tabular-nums">
                      {sensitivity.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={sensitivity}
                    onChange={(e) => setSensitivity(Number(e.target.value))}
                    className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
                  />
                </div>
              )}
            </div>

            {/* ─── Colours ─── */}
            <div className="space-y-3 pt-2 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Colour
              </label>

              {/* Base colour */}
              {!gradientMode && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={baseColor}
                    onChange={(e) => setBaseColor(e.target.value)}
                    className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-white/30 tabular-nums uppercase">
                    {baseColor}
                  </span>
                </div>
              )}

              {/* Gradient toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Gradient Mode
                </span>
                <button
                  onClick={() => setGradientMode(!gradientMode)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    gradientMode ? "bg-white/30" : "bg-white/10"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                      gradientMode ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Gradient colour pickers */}
              {gradientMode && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={gradientA}
                      onChange={(e) => setGradientA(e.target.value)}
                      className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                    />
                    <span className="text-[10px] text-white/30">Valley</span>
                    <span className="text-[10px] text-white/20 tabular-nums uppercase">
                      {gradientA}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={gradientB}
                      onChange={(e) => setGradientB(e.target.value)}
                      className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                    />
                    <span className="text-[10px] text-white/30">Peak</span>
                    <span className="text-[10px] text-white/20 tabular-nums uppercase">
                      {gradientB}
                    </span>
                  </div>
                  {/* Gradient preview bar */}
                  <div
                    className="h-2 rounded-full border border-white/10"
                    style={{
                      background: `linear-gradient(to right, ${gradientA}, ${gradientB})`,
                    }}
                  />
                </div>
              )}

              {/* Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-white/30">
                  Presets
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {GRADIENT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handleGradientPreset(preset)}
                      className="group relative h-6 rounded border border-white/10 hover:border-white/30 transition-colors overflow-hidden"
                      title={preset.name}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(to right, ${preset.colorA}, ${preset.colorB})`,
                        }}
                      />
                      <span className="relative text-[8px] text-white/70 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                        {preset.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="text-[10px] text-white/15 leading-relaxed pt-2 border-t border-white/5">
              Retro 3D wireframe terrain — simplex noise drives the landscape.
              Toggle audio mode to let your microphone shape the terrain in
              real-time.
            </div>
          </div>
        </div>
      </div>
    </ExperimentLayout>
  );
}
