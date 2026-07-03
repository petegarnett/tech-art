"use client";

/**
 * AudioSourcePicker — the SOURCE tab.
 *
 * Fronts the AudioSourceEngine with UI for all five input modes:
 *
 *   silent → just start with no source, LFOs animate the shader
 *   system → Chrome "Entire Screen" + Share system audio
 *   tab    → Chrome tab picker + Share tab audio
 *   mic    → device dropdown + start
 *   file   → file input + tiny transport (play/pause/seek/loop)
 *
 * Each mode gets its own inline help text explaining what Chrome will ask
 * the user to do — necessary because these are Chrome-only, gesture-gated
 * APIs and half the UX is knowing which checkbox to tick.
 *
 * The picker also handles the "already active" state — if a source is
 * running, we show a "Stop" button for it and greyed-out alternatives.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AudioSourceEngine,
  AudioSourceFilePlayhead,
  AudioSourceState,
} from "../engine/audioSource";
import type { AudioSourceMode } from "../engine/types";

interface Props {
  engine: AudioSourceEngine;
  state: AudioSourceState;
  onStart: (mode: AudioSourceMode, opts?: { deviceId?: string; file?: File; loop?: boolean }) => Promise<void>;
  onStop: () => void;
}

interface DeviceInfo { deviceId: string; label: string }

export default function AudioSourcePicker({ engine, state, onStart, onStop }: Props) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [loop, setLoop] = useState(true);
  const [starting, setStarting] = useState<AudioSourceMode | null>(null);
  // Detect insecure context to warn about HTTPS requirement. Note: localhost
  // is treated as secure by browsers so this warning only shows in production.
  const isSecure = typeof window !== "undefined" ? window.isSecureContext : true;

  // Enumerate mic devices. We defer this to a user action so we don't ask
  // for mic permission preemptively — labels are empty before permission is
  // granted anyway.
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const all = await navigator.mediaDevices.enumerateDevices();
    const mics = all
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 6)}` }));
    setDevices(mics);
  }, []);

  useEffect(() => { void refreshDevices(); }, [refreshDevices]);

  /* ─── File playhead poll (needed because <audio> doesn't fire timeupdate at high enough rate) ─── */
  const [playhead, setPlayhead] = useState<AudioSourceFilePlayhead | null>(null);
  const [ph, setPh] = useState({ current: 0, duration: 0, paused: false });

  useEffect(() => {
    if (state.mode !== "file" || !state.active) {
      setPlayhead(null);
      return;
    }
    const p = engine.getFilePlayhead();
    setPlayhead(p);
    if (!p) return;
    const id = window.setInterval(() => {
      setPh({ current: p.currentTime, duration: p.duration, paused: p.paused });
    }, 200);
    return () => window.clearInterval(id);
  }, [engine, state.mode, state.active]);

  /* ─── Handlers ─── */

  const runStart = async (mode: AudioSourceMode, opts?: { deviceId?: string; file?: File; loop?: boolean }) => {
    setStarting(mode);
    try {
      await onStart(mode, opts);
      // Refresh devices — mic mode might have granted us labels.
      if (mode === "mic") void refreshDevices();
    } finally {
      setStarting(null);
    }
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    await runStart("file", { file: f, loop });
    e.target.value = ""; // allow re-selecting same file
  };

  const modeActive = state.active;
  const currentModeLabel = useMemo(() => modeLabel(state.mode), [state.mode]);

  return (
    <div className="space-y-3">
      {/* ── Header status ── */}
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
        <span className="text-white/60">
          {modeActive ? `Listening: ${currentModeLabel}` : "Not started"}
        </span>
        {modeActive && (
          <button
            onClick={onStop}
            className="px-2 py-0.5 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-colors"
          >
            Stop
          </button>
        )}
      </div>

      {/* ── Error ── */}
      {state.error && (
        <div className="text-[10px] px-2 py-1.5 rounded bg-red-500/10 border border-red-500/30 text-red-200/90">
          {state.error}
        </div>
      )}

      {/* ── HTTPS warning (production only — localhost is fine) ── */}
      {!isSecure && (
        <div className="text-[9px] px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200/90 leading-relaxed">
          System / tab audio requires HTTPS in production. Localhost works, but a deployed site over http will refuse.
        </div>
      )}

      {/* ── Silent ── */}
      <ModeCard
        title="Silent"
        active={state.mode === "silent" && modeActive}
        disabled={modeActive && state.mode !== "silent"}
        starting={starting === "silent"}
        onClick={() => runStart("silent")}
        description="No audio input. LFOs alone animate the shader — good for pure motion, or to warm up before hooking a source."
      />

      {/* ── System audio ── */}
      <ModeCard
        title="System Audio"
        active={state.mode === "system" && modeActive}
        disabled={modeActive && state.mode !== "system"}
        starting={starting === "system"}
        onClick={() => runStart("system")}
        description="Chrome will ask you to pick a screen. Choose 'Entire Screen' and tick 'Share system audio' at the bottom of the dialog. Chrome desktop only."
      />

      {/* ── Tab audio ── */}
      <ModeCard
        title="Tab Audio"
        active={state.mode === "tab" && modeActive}
        disabled={modeActive && state.mode !== "tab"}
        starting={starting === "tab"}
        onClick={() => runStart("tab")}
        description="Chrome will let you pick a tab. Choose the tab you want to sample and tick 'Share tab audio'. Also Chrome desktop only."
      />

      {/* ── Microphone ── */}
      <div className={`p-2 rounded border transition-colors ${
        state.mode === "mic" && modeActive
          ? "border-emerald-400/50 bg-emerald-400/5"
          : "border-white/10 bg-white/[0.02]"
      }`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/70 font-medium">Microphone</span>
          {state.mode === "mic" && modeActive && (
            <span className="text-[9px] text-emerald-300/70">ACTIVE</span>
          )}
        </div>
        <p className="text-[9px] text-white/40 leading-relaxed mb-2">
          Pick a mic device. Grants permission on first use; refresh the list after.
        </p>
        <div className="flex gap-1">
          <select
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="flex-1 min-w-0 px-1.5 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
          >
            <option value="">Default input</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
          <button
            onClick={() => runStart("mic", { deviceId: selectedDevice })}
            disabled={modeActive && state.mode !== "mic"}
            className="px-2 py-1 rounded text-[10px] uppercase tracking-wider bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white/80 transition-colors"
          >
            {starting === "mic" ? "…" : "Start"}
          </button>
          <button
            onClick={() => void refreshDevices()}
            className="px-2 py-1 rounded text-[10px] uppercase tracking-wider bg-white/5 hover:bg-white/15 text-white/50 transition-colors"
            title="Re-enumerate audio input devices"
          >
            ↻
          </button>
        </div>
      </div>

      {/* ── File upload ── */}
      <div className={`p-2 rounded border transition-colors ${
        state.mode === "file" && modeActive
          ? "border-emerald-400/50 bg-emerald-400/5"
          : "border-white/10 bg-white/[0.02]"
      }`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-white/70 font-medium">Audio File</span>
          {state.mode === "file" && modeActive && (
            <span className="text-[9px] text-emerald-300/70">
              {state.streamInfo.fileName ? truncate(state.streamInfo.fileName, 18) : "ACTIVE"}
            </span>
          )}
        </div>
        <p className="text-[9px] text-white/40 leading-relaxed mb-2">
          MP3 / WAV / OGG. Streams through the analyser and out to your speakers.
        </p>
        <div className="flex gap-1 items-center">
          <label className="flex-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white/80 transition-colors cursor-pointer text-center">
            {starting === "file" ? "…" : "Choose file"}
            <input
              type="file"
              accept="audio/*"
              onChange={onFileChosen}
              className="hidden"
            />
          </label>
          <label className="flex items-center gap-1 text-[9px] text-white/50 cursor-pointer">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => {
                setLoop(e.target.checked);
                playhead?.setLoop(e.target.checked);
              }}
              className="accent-white/60"
            />
            Loop
          </label>
        </div>

        {/* Playhead transport (visible only in file mode). */}
        {playhead && state.mode === "file" && modeActive && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => playhead.playPause()}
                className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-white/80 text-[10px] transition-colors"
                title={ph.paused ? "Play" : "Pause"}
              >
                {ph.paused ? "▶" : "⏸"}
              </button>
              <input
                type="range"
                min={0}
                max={ph.duration || 1}
                step={0.1}
                value={ph.current}
                onChange={(e) => playhead.seek(Number(e.target.value))}
                className="flex-1 h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
              />
              <span className="text-[9px] text-white/40 tabular-nums">
                {fmt(ph.current)}/{fmt(ph.duration)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function ModeCard({
  title, active, disabled, starting, onClick, description,
}: {
  title: string;
  active: boolean;
  disabled: boolean;
  starting: boolean;
  onClick: () => void;
  description: string;
}) {
  return (
    <div className={`p-2 rounded border transition-colors ${
      active ? "border-emerald-400/50 bg-emerald-400/5" : "border-white/10 bg-white/[0.02]"
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/70 font-medium">{title}</span>
        {active && <span className="text-[9px] text-emerald-300/70">ACTIVE</span>}
      </div>
      <p className="text-[9px] text-white/40 leading-relaxed mb-2">{description}</p>
      <button
        onClick={onClick}
        disabled={disabled || active}
        className={`w-full py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
          active
            ? "bg-emerald-500/20 text-emerald-200 cursor-default"
            : "bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white/80"
        }`}
      >
        {starting ? "…" : active ? "Running" : "Start"}
      </button>
    </div>
  );
}

/* ─── Helpers ─── */

function modeLabel(m: AudioSourceMode): string {
  return {
    silent: "Silent",
    system: "System audio",
    tab: "Tab audio",
    mic: "Microphone",
    file: "Audio file",
  }[m];
}

function fmt(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
