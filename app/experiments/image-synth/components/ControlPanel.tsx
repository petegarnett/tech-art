"use client";

/**
 * ControlPanel — tabbed UI for the image synth.
 *
 * Tabs:
 *   - CAMERA: device picker, start/stop, threshold, B&W toggle, invert, resolution
 *   - SCAN:   mode (sweep/freeze), speed, direction, loop, scanline visibility
 *   - SYNTH:  audio start/stop, waveform, attack/release, reverb, delay, volume, voices
 *   - SCALE:  scale, root note, octaves
 */

import { useState } from "react";
import { SCALE_LABELS } from "../engine/scales";
import type {
  CameraConfig,
  ScaleConfig,
  ScaleId,
  ScanConfig,
  ScanMode,
  SweepDirection,
  SynthConfig,
  Waveform,
} from "../engine/types";

type Tab = "camera" | "scan" | "synth" | "scale";

const TABS: { id: Tab; label: string }[] = [
  { id: "camera", label: "Camera" },
  { id: "scan", label: "Scan" },
  { id: "synth", label: "Synth" },
  { id: "scale", label: "Scale" },
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
}

export default function ControlPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("camera");
  const {
    camera, setCamera,
    scan, setScan,
    synth, setSynth,
    scale, setScale,
    devices, onRefreshDevices,
    cameraActive, onStartCamera, onStopCamera,
    audioActive, onStartAudio, onStopAudio,
    cameraError,
    showScanline, setShowScanline,
  } = props;

  const updateCamera = <K extends keyof CameraConfig>(k: K, v: CameraConfig[K]) =>
    setCamera({ ...camera, [k]: v });
  const updateScan = <K extends keyof ScanConfig>(k: K, v: ScanConfig[K]) =>
    setScan({ ...scan, [k]: v });
  const updateSynth = <K extends keyof SynthConfig>(k: K, v: SynthConfig[K]) =>
    setSynth({ ...synth, [k]: v });
  const updateScale = <K extends keyof ScaleConfig>(k: K, v: ScaleConfig[K]) =>
    setScale({ ...scale, [k]: v });

  return (
    <div className="lg:w-80 xl:w-96 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/60 backdrop-blur-sm overflow-y-auto pb-8 lg:pb-0 touch-manipulation">
      <div className="p-4 space-y-4">
        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                tab === t.id
                  ? "bg-white/15 text-white/80"
                  : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50"
              }`}
            >
              {t.label}
            </button>
          ))}
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

            <Toggle
              label="Hard B&W"
              value={camera.bw}
              onChange={(v) => updateCamera("bw", v)}
            />
            <Toggle
              label="Invert"
              value={camera.invert}
              onChange={(v) => updateCamera("invert", v)}
            />

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
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Mode
              </label>
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
                  <Toggle
                    label="Loop"
                    value={scan.loop}
                    onChange={(v) => updateScan("loop", v)}
                  />
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

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Waveform
              </label>
              <div className="flex gap-1">
                {(["sine", "triangle", "sawtooth", "square"] as Waveform[]).map((w) => (
                  <button
                    key={w}
                    onClick={() => updateSynth("waveform", w)}
                    className={`flex-1 py-1.5 rounded text-[9px] uppercase tracking-wider transition-colors ${
                      synth.waveform === w
                        ? "bg-white/15 text-white/80"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {w === "sawtooth" ? "saw" : w}
                  </button>
                ))}
              </div>
            </div>

            <Slider
              label="Attack (s)"
              value={synth.attack}
              min={0.005}
              max={1}
              step={0.005}
              display={synth.attack.toFixed(3)}
              onChange={(v) => updateSynth("attack", v)}
            />
            <Slider
              label="Release (s)"
              value={synth.release}
              min={0.01}
              max={2}
              step={0.01}
              display={synth.release.toFixed(2)}
              onChange={(v) => updateSynth("release", v)}
            />
            <Slider
              label="Reverb Wet"
              value={synth.reverbWet}
              min={0}
              max={1}
              step={0.01}
              display={synth.reverbWet.toFixed(2)}
              onChange={(v) => updateSynth("reverbWet", v)}
            />
            <Slider
              label="Delay Wet"
              value={synth.delayWet}
              min={0}
              max={1}
              step={0.01}
              display={synth.delayWet.toFixed(2)}
              onChange={(v) => updateSynth("delayWet", v)}
            />
            <Slider
              label="Master Volume"
              value={synth.masterVolume}
              min={0}
              max={1}
              step={0.01}
              display={synth.masterVolume.toFixed(2)}
              onChange={(v) => updateSynth("masterVolume", v)}
            />

            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Voices
              </label>
              <select
                value={synth.voices}
                onChange={(e) =>
                  updateSynth("voices", Number(e.target.value) as SynthConfig["voices"])
                }
                className="w-full px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
              >
                {[8, 16, 32, 64, 128].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <p className="text-[9px] text-white/30 leading-relaxed">
                More voices = higher pitch resolution, more CPU.
              </p>
            </div>
          </div>
        )}

        {/* ─── SCALE ─── */}
        {tab === "scale" && (
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Scale
              </label>
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

            <Slider
              label="Root Note"
              value={scale.rootMidi}
              min={24}
              max={72}
              step={1}
              display={`${midiToName(scale.rootMidi)} (${scale.rootMidi})`}
              onChange={(v) => updateScale("rootMidi", v)}
            />

            <Slider
              label="Octaves"
              value={scale.octaves}
              min={1}
              max={7}
              step={1}
              display={`${scale.octaves}`}
              onChange={(v) => updateScale("octaves", v)}
            />

            <p className="text-[9px] text-white/30 leading-relaxed">
              Voices are spread across {scale.octaves} octaves of{" "}
              {SCALE_LABELS[scale.scale]}, starting at {midiToName(scale.rootMidi)}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

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
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          {props.label}
        </span>
        <span className="text-[10px] text-white/30 tabular-nums">
          {props.display}
        </span>
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

function Toggle(props: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-white/40">
        {props.label}
      </span>
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
