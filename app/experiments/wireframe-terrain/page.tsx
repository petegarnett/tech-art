"use client";

/**
 * Wireframe Terrain — thin wiring for the experiment.
 *
 * Owns:
 *   - All React state (terrain params, audio config, routing matrix, colours).
 *   - One AudioEngine instance kept in a ref.
 *   - One BandLevels ref the engine writes into each frame; SpectrumAnalyser
 *     and the draw loop read from it directly for zero-lag response.
 *   - The rAF draw loop via `useCanvas`.
 *
 * The actual renderer (projection, line drawing, back-to-front) is unchanged
 * from the pre-refactor version — only the parameter modulation pipeline
 * (audio → matrix → destinations) is new.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import { useCanvas } from "@/lib/canvas/setup";
import { octaveNoise2D } from "@/lib/math/noise";
import { clamp, map } from "@/lib/math/utils";

import { AudioEngine, listAudioInputs } from "./engine/audio";
import { emptyMatrix, getDestinationMod } from "./engine/routing";
import { hexToRgb, lerpColor, shiftHue } from "./engine/colour";
import type {
  AudioSource,
  AudioStatus,
  BandLevels,
  RoutingMatrix,
} from "./engine/types";
import ControlPanel, {
  TERRAIN_DEFAULTS,
  type ColourState,
  type TerrainParams,
} from "./components/ControlPanel";

export default function WireframeTerrainPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* ─── State ─── */

  const [terrain, setTerrain] = useState<TerrainParams>(TERRAIN_DEFAULTS);
  const [colour, setColour] = useState<ColourState>({
    baseColor: "#00ff00",
    gradientMode: false,
    gradientA: "#003300",
    gradientB: "#00ff00",
  });

  // Audio config
  const [source, setSource] = useState<AudioSource>("none");
  const [deviceId, setDeviceId] = useState("");
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>(
    [],
  );
  const [sensitivity, setSensitivity] = useState(1.5);
  const [audioStatus, setAudioStatus] = useState<AudioStatus>({
    active: false,
    source: "none",
    deviceLabel: null,
    sampleRate: 0,
    error: null,
  });

  // Routing matrix
  const [matrix, setMatrix] = useState<RoutingMatrix>(() => emptyMatrix());

  /* ─── Refs for the draw loop ─── */

  // Single AudioEngine kept across renders.
  const audioEngineRef = useRef<AudioEngine | null>(null);
  if (audioEngineRef.current === null) {
    audioEngineRef.current = new AudioEngine();
  }

  // BandLevels written by the draw loop, read by the SpectrumAnalyser.
  const levelsRef = useRef<BandLevels>({
    sub: 0,
    bass: 0,
    lowMid: 0,
    highMid: 0,
    high: 0,
    air: 0,
  });

  // Mirror state into refs so the draw loop sees latest values without re-binding.
  const terrainRef = useRef(terrain);
  const colourRef = useRef(colour);
  const matrixRef = useRef(matrix);
  const sensRef = useRef(sensitivity);

  useEffect(() => {
    terrainRef.current = terrain;
  }, [terrain]);
  useEffect(() => {
    colourRef.current = colour;
  }, [colour]);
  useEffect(() => {
    matrixRef.current = matrix;
  }, [matrix]);
  useEffect(() => {
    sensRef.current = sensitivity;
  }, [sensitivity]);

  /* ─── Audio actions ─── */

  const refreshDevices = useCallback(async () => {
    const ds = await listAudioInputs();
    setDevices(ds);
  }, []);

  // Enumerate once on mount (labels likely empty until permission granted).
  // refreshDevices is async + setState happens after the await, so this isn't
  // a synchronous cascading render — silence the lint rule.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshDevices();
  }, [refreshDevices]);

  const startAudio = useCallback(async () => {
    const engine = audioEngineRef.current!;
    try {
      await engine.start({ source, deviceId, sensitivity });
      setAudioStatus(engine.getStatus());
      // Labels appear post-permission — refresh so the dropdown picks them up.
      refreshDevices();
    } catch {
      // engine.start already populated status.error
      setAudioStatus(engine.getStatus());
    }
  }, [source, deviceId, sensitivity, refreshDevices]);

  const stopAudio = useCallback(async () => {
    const engine = audioEngineRef.current!;
    await engine.stop();
    setAudioStatus(engine.getStatus());
    // Clear the cached level snapshot so the spectrum settles to zero.
    levelsRef.current = {
      sub: 0,
      bass: 0,
      lowMid: 0,
      highMid: 0,
      high: 0,
      air: 0,
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioEngineRef.current?.stop();
    };
  }, []);

  /* ─── Draw loop ─── */

  useCanvas(canvasRef, ({ ctx, width, height, elapsed }) => {
    const p = terrainRef.current;
    const c = colourRef.current;
    const m = matrixRef.current;
    const sens = sensRef.current;
    const engine = audioEngineRef.current!;

    // Tick the engine. If not active, levels stay at 0.
    engine.update(performance.now());
    const levels = engine.getLevels();
    levelsRef.current = levels;

    // Compute modulations — all 0 when audio is off, so the static look is preserved.
    const ampMod = getDestinationMod(m, levels, "amplitude") * sens;
    const freqMod = getDestinationMod(m, levels, "frequency") * sens;
    const speedMod = getDestinationMod(m, levels, "speed") * sens;
    const detailMod = getDestinationMod(m, levels, "detail") * sens;
    const lineMod = getDestinationMod(m, levels, "lineWidth") * sens;
    const hueMod = getDestinationMod(m, levels, "hueShift") * sens;
    const brightMod = getDestinationMod(m, levels, "brightness") * sens;
    const tiltMod = getDestinationMod(m, levels, "tilt") * sens;

    // Apply modulations — additive offset from base so a base of 0 still
    // responds to audio. Each destination has a `scale` — how much an audio
    // level of 1.0 at depth 1.0 contributes. Tuned so a hard-driven preset
    // gives a similar feel to the previous multiplicative version when the
    // base sits at its default, but ALSO works when the base is 0.
    const amplitude = Math.max(0, p.amplitude + ampMod * 120);
    const frequency = Math.max(0.001, p.frequency + freqMod * 0.05);
    const speed = Math.max(0, p.speed + speedMod * 2);
    const detail = detailMod * 40;
    const lineWidthBase = Math.max(0.1, p.lineWidth + lineMod * 1.5);
    const tilt = clamp(p.tilt + tiltMod * 0.3, 0, 1);
    // Brightness combines manual control + audio mod. Allow up to 3 so users
    // can push wireframe visibility well above default.
    const brightness = clamp(p.brightness + brightMod * 0.5, 0.1, 3);
    const hueShift = hueMod * 180; // degrees of hue rotation

    /* ─── Renderer (unchanged from pre-refactor) ─── */

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

    // Camera / projection — classic retro terrain renderer
    const focalLength = Math.min(width, height) * 0.7;
    const centerX = width / 2;
    const horizonY = height * (0.15 + (1 - tilt) * 0.25);
    const cameraHeight = 60 + tilt * 180;

    const nearZ = 80;
    const farZ = nearZ + gridDepth;

    // Scrolling offset uses the modulated speed
    const scrollOffset = (elapsed * speed * 100) % cellD;
    const timeOffset = elapsed * speed * 0.5;

    // Pre-compute colours (with hue shift baked in)
    const baseRgb = shiftHue(hexToRgb(c.baseColor), hueShift);
    const gradARgb = shiftHue(hexToRgb(c.gradientA), hueShift);
    const gradBRgb = shiftHue(hexToRgb(c.gradientB), hueShift);

    // Build vertex grid
    const vertices: {
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      hn: number;
    }[][] = [];

    let minH = Infinity;
    let maxH = -Infinity;

    for (let r = 0; r <= rows; r++) {
      const row: (typeof vertices)[0] = [];
      for (let cc = 0; cc <= cols; cc++) {
        const x = (cc - cols / 2) * cellW;
        const z = nearZ + r * cellD - scrollOffset;

        const nx = x * frequency + timeOffset;
        const nz = z * frequency + timeOffset;
        let h = octaveNoise2D(nx, nz, 2, 0.4) * amplitude;

        // Add high-frequency detail driven by the 'detail' destination
        if (detail > 0) {
          h += octaveNoise2D(nx * 3, nz * 3, 2, 0.5) * detail;
        }

        if (h < minH) minH = h;
        if (h > maxH) maxH = h;

        const y = -h;
        row.push({ x, y, z, sx: 0, sy: 0, hn: h });
      }
      vertices.push(row);
    }

    // Normalize heights and project
    const hRange = maxH - minH || 1;
    for (let r = 0; r <= rows; r++) {
      for (let cc = 0; cc <= cols; cc++) {
        const v = vertices[r][cc];
        v.hn = (v.hn - minH) / hRange; // 0 to 1

        if (v.z > 1) {
          v.sx = (v.x / v.z) * focalLength + centerX;
          v.sy = ((cameraHeight + v.y) / v.z) * focalLength + horizonY;
        } else {
          v.z = 0;
        }
      }
    }

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
      if (z1 <= 1 || z2 <= 1) return;

      const avgZ = (z1 + z2) / 2;
      const depthFade = clamp(map(avgZ, nearZ, farZ, 1, 0.08), 0, 1);
      const avgHn = (hn1 + hn2) / 2;

      let r: number, g: number, b: number;
      if (c.gradientMode) {
        const col = lerpColor(gradARgb, gradBRgb, avgHn);
        r = col[0];
        g = col[1];
        b = col[2];
      } else {
        r = baseRgb[0];
        g = baseRgb[1];
        b = baseRgb[2];
      }

      // Brightness multiplies the per-line alpha. Clamp so we never exceed 1.
      const baseAlpha = depthFade * (c.gradientMode ? 1 : 0.3 + avgHn * 0.7);
      const alpha = clamp(baseAlpha * brightness, 0, 1);
      ctx.strokeStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha.toFixed(3)})`;
      ctx.lineWidth =
        lineWidthBase * clamp(map(avgZ, nearZ, farZ, 1, 0.2), 0.1, 3);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    // Draw back-to-front for proper layering
    for (let r = rows; r >= 0; r--) {
      for (let cc = 0; cc <= cols; cc++) {
        const v = vertices[r][cc];

        if (cc < cols) {
          const vr = vertices[r][cc + 1];
          drawLine(v.sx, v.sy, v.z, v.hn, vr.sx, vr.sy, vr.z, vr.hn);
        }

        if (r > 0) {
          const vd = vertices[r - 1][cc];
          drawLine(v.sx, v.sy, v.z, v.hn, vd.sx, vd.sy, vd.z, vd.hn);
        }

        if (cc < cols && r > 0) {
          const vdr = vertices[r - 1][cc + 1];
          drawLine(v.sx, v.sy, v.z, v.hn, vdr.sx, vdr.sy, vdr.z, vdr.hn);
        }
      }
    }
  });

  /* ─── Render ─── */

  return (
    <ExperimentLayout title="Wireframe Terrain">
      <div className="w-full h-auto lg:h-full flex flex-col lg:flex-row pt-12">
        {/* Canvas area */}
        <div className="h-[55vh] lg:h-auto lg:flex-1 relative min-h-0">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>

        {/* Control panel */}
        <ControlPanel
          terrain={terrain}
          setTerrain={setTerrain}
          source={source}
          setSource={setSource}
          deviceId={deviceId}
          setDeviceId={setDeviceId}
          devices={devices}
          onRefreshDevices={refreshDevices}
          onStart={startAudio}
          onStop={stopAudio}
          audioStatus={audioStatus}
          sensitivity={sensitivity}
          setSensitivity={setSensitivity}
          levelsRef={levelsRef}
          matrix={matrix}
          setMatrix={setMatrix}
          colour={colour}
          setColour={setColour}
        />
      </div>
    </ExperimentLayout>
  );
}
