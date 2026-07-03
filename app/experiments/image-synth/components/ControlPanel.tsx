"use client";

/**
 * ControlPanel — tabbed UI for the image synth.
 *
 * v2 layout:
 *   - Module-button tab row (CAMERA / SCAN / SYNTH / MATRIX / SCALE / VIZ).
 *   - Status strip: CAMERA · AUDIO · VIZ with coloured dots, clickable to toggle.
 *   - Tab content area (one of 6 panels).
 *
 * Tabs:
 *   - CAMERA: device picker, start/stop, threshold, B&W, invert, resolution
 *   - SCAN:   mode, speed, direction, loop, scanline visibility
 *   - SYNTH:  audio start/stop, source toggle (osc/sample), waveform pair,
 *             attack/release, master reverb/delay/volume, voices,
 *             sample file input + base note + loop range
 *   - MATRIX: 9 routing destinations × depth knob + live readout
 *   - SCALE:  scale, root, octaves
 *   - VIZ:    preset picker, composition mode, per-preset knob grid
 */

import { useEffect, useRef, useState } from "react";
import Knob from "@/components/Knob";
import { SCALE_LABELS } from "../engine/scales";
import { DESTINATIONS } from "../engine/destinations";
import { PRESETS, PRESET_BY_ID } from "../engine/presets";
import ModSection from "./ModSection";
import type { LFOConfig } from "@/lib/audio/lfo";
import type {
  CameraConfig,
  DestinationId,
  MatrixConfig,
  ModMatrix,
  PresetId,
  ScaleConfig,
  ScaleId,
  ScanConfig,
  ScanMode,
  SourceMode,
  SweepDirection,
  SynthConfig,
  Waveform,
  CompositionMode,
  VizConfig,
} from "../engine/types";

type Tab = "camera" | "scan" | "synth" | "matrix" | "mod" | "scale" | "viz";

const TABS: { id: Tab; icon: string; label: string; short: string }[] = [
  { id: "camera", icon: "📷", label: "Camera", short: "CAM" },
  { id: "scan",   icon: "⏵",  label: "Scan",   short: "SCN" },
  { id: "synth",  icon: "🎹", label: "Synth",  short: "SYN" },
  { id: "matrix", icon: "🎚️", label: "Matrix", short: "MTX" },
  { id: "mod",    icon: "🌊", label: "Mod",    short: "MOD" },
  { id: "scale",  icon: "🎼", label: "Scale",  short: "SCL" },
  { id: "viz",    icon: "✨", label: "Viz",    short: "VIZ" },
];

interface Props {
  camera: CameraConfig;
  setCamera: (c: CameraConfig) => void;
  scan: ScanConfig;
  setScan: (s: ScanConfig) => void;
  synth: SynthConfig;
  setSynth: (s: SynthConfig) => void;
  scale: ScaleConfig;
  setScale: (s: ScaleConfig) => void;
  matrix: MatrixConfig;
  setMatrix: (m: MatrixConfig) => void;
  viz: VizConfig;
  setViz: (v: VizConfig) => void;

  /* ─── MOD tab state ─── */
  lfos: LFOConfig[];
  setLfos: (l: LFOConfig[]) => void;
  modMatrix: ModMatrix;
  setModMatrix: (m: ModMatrix) => void;
  bpm: number;
  setBpm: (n: number) => void;
  modBypass: boolean;
  setModBypass: (b: boolean) => void;
  lfoLiveValues: Float32Array;

  devices: { deviceId: string; label: string }[];
  onRefreshDevices: () => void;

  cameraActive: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;

  audioActive: boolean;
  onStartAudio: () => void;
  onStopAudio: () => void;

  cameraError: string | null;

  showScanline: boolean;
  setShowScanline: (b: boolean) => void;

  /** Live modulated values for the matrix readout — mean across all voices. */
  matrixReadoutRef: React.MutableRefObject<Record<DestinationId, number>>;

  /** Sample state */
  sampleName: string | null;
  sampleDuration: number;
  onLoadSample: (file: File) => Promise<void>;
}

export default function ControlPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("camera");
  const {
    camera, setCamera,
    scan, setScan,
    synth, setSynth,
    scale, setScale,
    matrix, setMatrix,
    viz, setViz,
    lfos, setLfos,
    modMatrix, setModMatrix,
    bpm, setBpm,
    modBypass, setModBypass,
    lfoLiveValues,
    devices, onRefreshDevices,
    cameraActive, onStartCamera, onStopCamera,
    audioActive, onStartAudio, onStopAudio,
    cameraError,
    showScanline, setShowScanline,
    matrixReadoutRef,
    sampleName, sampleDuration, onLoadSample,
  } = props;

  const updateCamera = <K extends keyof CameraConfig>(k: K, v: CameraConfig[K]) =>
    setCamera({ ...camera, [k]: v });
  const updateScan = <K extends keyof ScanConfig>(k: K, v: ScanConfig[K]) =>
    setScan({ ...scan, [k]: v });
  const updateSynth = <K extends keyof SynthConfig>(k: K, v: SynthConfig[K]) =>
    setSynth({ ...synth, [k]: v });
  const updateScale = <K extends keyof ScaleConfig>(k: K, v: ScaleConfig[K]) =>
    setScale({ ...scale, [k]: v });
  const updateMatrix = (id: DestinationId, value: number) =>
    setMatrix({ ...matrix, [id]: value });
  const updateVizParam = (uniformName: string, value: number) =>
    setViz({
      ...viz,
      params: {
        ...viz.params,
        [viz.preset]: { ...viz.params[viz.preset], [uniformName]: value },
      },
    });

  return (
    <div className="lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/60 backdrop-blur-sm overflow-y-auto pb-8 lg:pb-0 touch-manipulation">
      <div className="p-3 space-y-3">
        {/* ─── Tab row: hardware-synth-style module buttons ─── */}
        <div className="grid grid-cols-7 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              title={t.label}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded transition-colors border ${
                tab === t.id
                  ? "bg-white/15 border-white/30 text-white/90"
                  : "bg-white/[0.03] border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <span className="text-base leading-none" aria-hidden>{t.icon}</span>
              <span className="text-[8px] uppercase tracking-wider mt-0.5">{t.short}</span>
            </button>
          ))}
        </div>

        {/* ─── Status strip ─── */}
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
          <StatusDot
            label="Cam"
            on={cameraActive}
            onClick={() => (cameraActive ? onStopCamera() : onStartCamera())}
          />
          <span className="text-white/15">|</span>
          <StatusDot
            label="Aud"
            on={audioActive}
            onClick={() => (audioActive ? onStopAudio() : onStartAudio())}
          />
          <span className="text-white/15">|</span>
          <button
            onClick={() => setTab("viz")}
            className="flex items-center gap-1.5 hover:text-white/80 transition-colors text-white/40"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${viz.composition === "camera-only" ? "bg-white/20" : "bg-emerald-400/80"}`} />
            Viz: {PRESET_BY_ID[viz.preset].label}
          </button>
        </div>

        {/* ─── CAMERA ─── */}
        {tab === "camera" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Input Device
              </label>
              <div className="flex gap-1">
                <select
                  value={camera.deviceId}
                  onChange={(e) => updateCamera("deviceId", e.target.value)}
                  className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
                >
                  <option value="">System default</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onRefreshDevices}
                  title="Refresh device list"
                  className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/50 bg-white/5 hover:bg-white/10 rounded transition-colors"
                >
                  ↻
                </button>
              </div>
              <p className="text-[9px] text-white/30 leading-relaxed">
                Labels appear after granting camera permission once.
              </p>
            </div>

            <button
              onClick={cameraActive ? onStopCamera : onStartCamera}
              className={`w-full py-2 rounded text-[10px] uppercase tracking-wider transition-colors ${
                cameraActive
                  ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              {cameraActive ? "Stop Camera" : "Start Camera"}
            </button>

            {cameraError && (
              <div className="text-[10px] text-red-400/80 leading-relaxed">
                {cameraError}
              </div>
            )}

            <Slider
              label="Threshold"
              value={camera.threshold}
              min={0}
              max={1}
              step={0.01}
              display={camera.threshold.toFixed(2)}
              onChange={(v) => updateCamera("threshold", v)}
            />

            <Toggle label="Hard B&W" value={camera.bw} onChange={(v) => updateCamera("bw", v)} />
            <Toggle label="Invert" value={camera.invert} onChange={(v) => updateCamera("invert", v)} />

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Resolution
              </label>
              <select
                value={camera.resolution}
                onChange={(e) =>
                  updateCamera("resolution", Number(e.target.value) as CameraConfig["resolution"])
                }
                className="w-full px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
              >
                {[64, 128, 256, 512].map((r) => (
                  <option key={r} value={r}>
                    {r} × {Math.round((r * 3) / 4)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ─── SCAN ─── */}
        {tab === "scan" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-white/40">Mode</label>
              <div className="flex gap-1">
                {(["sweep", "freeze"] as ScanMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => updateScan("mode", m)}
                    className={`flex-1 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
                      scan.mode === m
                        ? "bg-white/15 text-white/80"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-white/30 leading-relaxed">
                {scan.mode === "sweep"
                  ? "A vertical line sweeps left→right. Only that column plays."
                  : "Every column averaged together. The whole frame sings at once."}
              </p>
            </div>

            {scan.mode === "sweep" && (
              <>
                <Slider
                  label="Speed (sweeps/sec)"
                  value={scan.speed}
                  min={0.1}
                  max={10}
                  step={0.1}
                  display={scan.speed.toFixed(1)}
                  onChange={(v) => updateScan("speed", v)}
                />
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-white/40">
                    Direction
                  </label>
                  <div className="flex gap-1">
                    {(["right", "left", "bounce"] as SweepDirection[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => updateScan("direction", d)}
                        className={`flex-1 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
                          scan.direction === d
                            ? "bg-white/15 text-white/80"
                            : "bg-white/5 text-white/40 hover:bg-white/10"
                        }`}
                      >
                        {d === "right" ? "→" : d === "left" ? "←" : "⇄"} {d}
                      </button>
                    ))}
                  </div>
                </div>
                {scan.direction !== "bounce" && (
                  <Toggle label="Loop" value={scan.loop} onChange={(v) => updateScan("loop", v)} />
                )}
                <Toggle
                  label="Show Scanline"
                  value={showScanline}
                  onChange={setShowScanline}
                />
              </>
            )}
          </div>
        )}

        {/* ─── SYNTH ─── */}
        {tab === "synth" && (
          <div className="space-y-4">
            <button
              onClick={audioActive ? onStopAudio : onStartAudio}
              className={`w-full py-2 rounded text-[10px] uppercase tracking-wider transition-colors ${
                audioActive
                  ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                  : "bg-white/10 text-white/80 hover:bg-white/20"
              }`}
            >
              {audioActive ? "Stop Audio" : "Start Audio"}
            </button>

            {/* Source toggle */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-white/40">Source</label>
              <div className="flex gap-1">
                {(["oscillator", "sample"] as SourceMode[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateSynth("source", s)}
                    className={`flex-1 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
                      synth.source === s
                        ? "bg-white/15 text-white/80"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {s === "oscillator" ? "OSC" : "SAMPLE"}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-white/30 leading-relaxed">
                {synth.source === "oscillator"
                  ? "Two oscillators per voice, crossfaded by Wave Morph."
                  : "Each voice plays the loaded sample, transposed to its row pitch."}
              </p>
            </div>

            {synth.source === "oscillator" && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-white/40">
                    Primary Wave
                  </label>
                  <div className="flex gap-1">
                    {(["sine", "triangle", "sawtooth", "square"] as Waveform[]).map((w) => (
                      <WaveButton key={w} w={w} active={synth.waveform === w} onClick={() => updateSynth("waveform", w)} />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-wider text-white/40">
                    Secondary Wave (morph target)
                  </label>
                  <div className="flex gap-1">
                    {(["sine", "triangle", "sawtooth", "square"] as Waveform[]).map((w) => (
                      <WaveButton key={w} w={w} active={synth.waveformSecondary === w} onClick={() => updateSynth("waveformSecondary", w)} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {synth.source === "sample" && (
              <SampleSection
                synth={synth}
                updateSynth={updateSynth}
                sampleName={sampleName}
                sampleDuration={sampleDuration}
                onLoadSample={onLoadSample}
              />
            )}

            <Slider label="Attack (s)" value={synth.attack} min={0.005} max={1} step={0.005}
              display={synth.attack.toFixed(3)} onChange={(v) => updateSynth("attack", v)} />
            <Slider label="Release (s)" value={synth.release} min={0.01} max={2} step={0.01}
              display={synth.release.toFixed(2)} onChange={(v) => updateSynth("release", v)} />
            <Slider label="Reverb Wet" value={synth.reverbWet} min={0} max={1} step={0.01}
              display={synth.reverbWet.toFixed(2)} onChange={(v) => updateSynth("reverbWet", v)} />
            <Slider label="Delay Wet" value={synth.delayWet} min={0} max={1} step={0.01}
              display={synth.delayWet.toFixed(2)} onChange={(v) => updateSynth("delayWet", v)} />
            <Slider label="Master Volume" value={synth.masterVolume} min={0} max={1} step={0.01}
              display={synth.masterVolume.toFixed(2)} onChange={(v) => updateSynth("masterVolume", v)} />

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40">Voices</label>
              <select
                value={synth.voices}
                onChange={(e) =>
                  updateSynth("voices", Number(e.target.value) as SynthConfig["voices"])
                }
                className="w-full px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
              >
                {[8, 16, 32, 64, 128].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <p className="text-[9px] text-white/30 leading-relaxed">
                More voices = higher pitch resolution, more CPU.
              </p>
            </div>
          </div>
        )}

        {/* ─── MATRIX ─── */}
        {tab === "matrix" && (
          <MatrixSection
            matrix={matrix}
            updateMatrix={updateMatrix}
            readoutRef={matrixReadoutRef}
          />
        )}

        {/* ─── MOD ─── */}
        {tab === "mod" && (
          <ModSection
            lfos={lfos}
            setLfos={setLfos}
            modMatrix={modMatrix}
            setModMatrix={setModMatrix}
            bpm={bpm}
            setBpm={setBpm}
            modBypass={modBypass}
            setModBypass={setModBypass}
            lfoLiveValues={lfoLiveValues}
            matrix={matrix}
            onLoadPatch={(p) => {
              setMatrix({ ...p.matrix });
              setLfos(p.lfos.map((l) => ({ ...l })));
              setModMatrix({ ...p.modMatrix });
              setBpm(p.bpm);
            }}
          />
        )}

        {/* ─── SCALE ─── */}
        {tab === "scale" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40">Scale</label>
              <select
                value={scale.scale}
                onChange={(e) => updateScale("scale", e.target.value as ScaleId)}
                className="w-full px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
              >
                {(Object.keys(SCALE_LABELS) as ScaleId[]).map((id) => (
                  <option key={id} value={id}>
                    {SCALE_LABELS[id]}
                  </option>
                ))}
              </select>
            </div>
            <Slider label="Root Note" value={scale.rootMidi} min={24} max={72} step={1}
              display={`${midiToName(scale.rootMidi)} (${scale.rootMidi})`}
              onChange={(v) => updateScale("rootMidi", v)} />
            <Slider label="Octaves" value={scale.octaves} min={1} max={7} step={1}
              display={`${scale.octaves}`}
              onChange={(v) => updateScale("octaves", v)} />
            <p className="text-[9px] text-white/30 leading-relaxed">
              Voices are spread across {scale.octaves} octaves of {SCALE_LABELS[scale.scale]}, starting at {midiToName(scale.rootMidi)}.
            </p>
          </div>
        )}

        {/* ─── VIZ ─── */}
        {tab === "viz" && (
          <VizSection
            viz={viz}
            setViz={setViz}
            updateVizParam={updateVizParam}
          />
        )}
      </div>
    </div>
  );
}

/* ═══ Subsections ═════════════════════════════════════════════════════ */

function MatrixSection({
  matrix,
  updateMatrix,
  readoutRef,
}: {
  matrix: MatrixConfig;
  updateMatrix: (id: DestinationId, value: number) => void;
  readoutRef: React.MutableRefObject<Record<DestinationId, number>>;
}) {
  // Snapshot the ref into state on a 100ms tick — gives a live UI readout
  // without React re-rendering every frame. We never read the ref during
  // render (React Compiler enforces this).
  const [snapshot, setSnapshot] = useState<Record<DestinationId, number>>(
    () => Object.fromEntries(DESTINATIONS.map((d) => [d.id, 0])) as Record<DestinationId, number>,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.setInterval(() => {
      setSnapshot({ ...readoutRef.current });
    }, 100);
    return () => window.clearInterval(id);
  }, [readoutRef]);

  return (
    <div className="space-y-2">
      <p className="text-[9px] text-white/30 leading-relaxed">
        Each row&apos;s grey value modulates these destinations. Knob = depth (0-1).
        Right column = mean modulated value across all voices.
      </p>
      <div className="space-y-1">
        {DESTINATIONS.map((d) => {
          const depth = matrix[d.id];
          const liveVal = snapshot[d.id] ?? 0;
          return (
            <div
              key={d.id}
              className="flex items-center gap-2 py-1.5 px-2 rounded bg-white/[0.02] border border-white/[0.05]"
              title={d.description}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-white/70 leading-tight">
                  {d.label}
                </div>
                <div className="text-[9px] text-white/30 tabular-nums leading-tight">
                  {d.format(liveVal)}
                </div>
              </div>
              <Knob
                value={depth}
                onChange={(v) => updateMatrix(d.id, v)}
                size={32}
                label={d.label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VizSection({
  viz,
  setViz,
  updateVizParam,
}: {
  viz: VizConfig;
  setViz: (v: VizConfig) => void;
  updateVizParam: (uniformName: string, value: number) => void;
}) {
  const presetDef = PRESET_BY_ID[viz.preset];
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-white/40">Preset</label>
        <select
          value={viz.preset}
          onChange={(e) => setViz({ ...viz, preset: e.target.value as PresetId })}
          className="w-full px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <p className="text-[9px] text-white/30 leading-relaxed">{presetDef.description}</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-white/40">Composition</label>
        <div className="grid grid-cols-2 gap-1">
          {(["viz-only", "viz-overlay", "viz-underlay", "camera-only"] as CompositionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setViz({ ...viz, composition: m })}
              className={`py-1.5 rounded text-[9px] uppercase tracking-wider transition-colors ${
                viz.composition === m
                  ? "bg-white/15 text-white/80"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {m.replace("-", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-white/40">
          {presetDef.label} Params
        </label>
        <div className="grid grid-cols-3 gap-2 pt-1">
          {presetDef.params.map((p) => {
            const v = viz.params[viz.preset]?.[p.name] ?? p.default;
            return (
              <div key={p.name} className="flex flex-col items-center gap-1">
                <Knob value={v} onChange={(val) => updateVizParam(p.name, val)} size={32} label={p.label} />
                <span className="text-[8px] text-white/40 uppercase tracking-wider text-center leading-tight">
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SampleSection({
  synth,
  updateSynth,
  sampleName,
  sampleDuration,
  onLoadSample,
}: {
  synth: SynthConfig;
  updateSynth: <K extends keyof SynthConfig>(k: K, v: SynthConfig[K]) => void;
  sampleName: string | null;
  sampleDuration: number;
  onLoadSample: (file: File) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  return (
    <div className="space-y-3 p-2 rounded bg-white/[0.02] border border-white/10">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/wav,audio/mpeg,audio/ogg,audio/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setLoading(true);
          try { await onLoadSample(f); } finally { setLoading(false); }
        }}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="w-full py-2 rounded text-[10px] uppercase tracking-wider bg-white/10 text-white/80 hover:bg-white/20 transition-colors disabled:opacity-50"
      >
        {loading ? "Loading…" : sampleName ? "Replace Sample" : "Load Sample"}
      </button>
      <div className="text-[9px] text-white/40 leading-relaxed">
        {sampleName
          ? `${sampleName} · ${sampleDuration.toFixed(2)}s`
          : "No sample loaded — voices silent until you load one."}
      </div>
      <Slider
        label="Base Note"
        value={synth.sampleBaseMidi}
        min={24}
        max={72}
        step={1}
        display={`${midiToName(synth.sampleBaseMidi)} (${synth.sampleBaseMidi})`}
        onChange={(v) => updateSynth("sampleBaseMidi", v)}
      />
      <Slider
        label="Loop Start"
        value={synth.sampleLoopStart}
        min={0}
        max={1}
        step={0.001}
        display={(synth.sampleLoopStart * sampleDuration).toFixed(2) + "s"}
        onChange={(v) => updateSynth("sampleLoopStart", Math.min(v, synth.sampleLoopEnd - 0.01))}
      />
      <Slider
        label="Loop End"
        value={synth.sampleLoopEnd}
        min={0}
        max={1}
        step={0.001}
        display={(synth.sampleLoopEnd * sampleDuration).toFixed(2) + "s"}
        onChange={(v) => updateSynth("sampleLoopEnd", Math.max(v, synth.sampleLoopStart + 0.01))}
      />
    </div>
  );
}

/* ═══ Helpers ═════════════════════════════════════════════════════════ */

function StatusDot({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 hover:text-white/80 transition-colors text-white/40"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${on ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-white/20"}`} />
      {label}: {on ? "On" : "Off"}
    </button>
  );
}

function WaveButton({ w, active, onClick }: { w: Waveform; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 rounded text-[9px] uppercase tracking-wider transition-colors ${
        active ? "bg-white/15 text-white/80" : "bg-white/5 text-white/40 hover:bg-white/10"
      }`}
    >
      {w === "sawtooth" ? "saw" : w}
    </button>
  );
}

function midiToName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = names[midi % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider text-white/40">{props.label}</span>
        <span className="text-[10px] text-white/30 tabular-nums">{props.display}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
      />
    </div>
  );
}

function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-white/40">{props.label}</span>
      <button
        onClick={() => props.onChange(!props.value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          props.value ? "bg-white/30" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
            props.value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
