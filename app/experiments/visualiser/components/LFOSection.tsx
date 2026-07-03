"use client";

/**
 * LFOSection — 4 LFO panels + tempo control + bypass toggle.
 *
 * Adapted from Image Synth's ModSection.tsx (the LFO panel bits), but
 * carved into its own file because the Visualiser splits LFO editing and
 * routing into separate tabs.
 *
 * Each panel offers:
 *   - Shape picker (sine / triangle / saw / square / S&H / noise)
 *   - Rate: Hz mode (log-scaled knob) OR sync mode (drop-down)
 *   - Phase / Amp / Smooth knobs
 *   - Bipolar / Unipolar polarity toggle
 *   - Live waveform preview canvas with a cursor at the current value
 *
 * Master row: BPM slider (drives sync-mode LFOs) + bypass toggle.
 */

import { useEffect, useRef } from "react";
import Knob from "@/components/Knob";
import { previewWaveform, SYNC_RATES, SYNC_LABELS } from "@/lib/audio/lfo";
import type { LFOConfig, LFOShape, SyncRate } from "@/lib/audio/lfo";

interface Props {
  lfos: LFOConfig[];
  setLfos: (lfos: LFOConfig[]) => void;
  bpm: number;
  setBpm: (n: number) => void;
  modBypass: boolean;
  setModBypass: (b: boolean) => void;
  lfoLiveValues: Float32Array; // length 4, updated at ~30Hz
}

const SHAPES: { id: LFOShape; label: string }[] = [
  { id: "sine",       label: "sine" },
  { id: "triangle",   label: "tri" },
  { id: "saw",        label: "saw" },
  { id: "square",     label: "sq" },
  { id: "sampleHold", label: "s&h" },
  { id: "noise",      label: "nz" },
];

export default function LFOSection(props: Props) {
  const { lfos, setLfos, bpm, setBpm, modBypass, setModBypass, lfoLiveValues } = props;

  const updateLFO = (i: number, patch: Partial<LFOConfig>) => {
    const next = lfos.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setLfos(next);
  };

  return (
    <div className="space-y-3">
      {/* ─── Bypass strip ─── */}
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
        <span className="text-white/50">LFO Bank</span>
        <button
          onClick={() => setModBypass(!modBypass)}
          className={`px-2 py-0.5 rounded transition-colors ${
            modBypass
              ? "bg-red-500/30 text-red-200"
              : "bg-white/10 text-white/50 hover:bg-white/20"
          }`}
          title="Mute all LFO output (instant kill switch)"
        >
          {modBypass ? "Bypassed" : "Bypass"}
        </button>
      </div>

      {/* ─── 4 LFO panels (2×2 on desktop, stacked on mobile) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {lfos.map((lfo, i) => (
          <LFOPanel
            key={i}
            index={i}
            lfo={lfo}
            liveValue={lfoLiveValues[i] ?? 0}
            update={(p) => updateLFO(i, p)}
          />
        ))}
      </div>

      {/* ─── Tempo ─── */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-wider text-white/40">Tempo (BPM)</span>
          <span className="text-[10px] text-white/30 tabular-nums">{bpm}</span>
        </div>
        <input
          type="range"
          min={40}
          max={300}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
        />
        <p className="text-[9px] text-white/30 leading-relaxed">
          Sync-mode LFOs lock their rate to this tempo.
        </p>
      </div>
    </div>
  );
}

/* ═══ LFO panel ═══════════════════════════════════════════════════════ */

function LFOPanel({
  index, lfo, liveValue, update,
}: {
  index: number;
  lfo: LFOConfig;
  liveValue: number;
  update: (patch: Partial<LFOConfig>) => void;
}) {
  // Log-scaled Hz knob: 0.01 Hz .. 30 Hz.
  const hzToKnob = (hz: number) => Math.max(0, Math.min(1, Math.log(hz / 0.01) / Math.log(30 / 0.01)));
  const knobToHz = (k: number) => 0.01 * Math.pow(30 / 0.01, k);

  // Live waveform preview canvas — redraws when shape / liveValue changes.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const w = cvs.width;
    const h = cvs.height;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    // Centre line for bipolar reference.
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    // Shape waveform.
    const samples = previewWaveform(lfo.shape, w, index + 1);
    ctx.strokeStyle = "rgba(180, 220, 255, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < w; i++) {
      const y = h / 2 - samples[i] * (h / 2 - 2);
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    // Live cursor dot on the right edge, positioned by current value.
    const cursorY = h / 2 - liveValue * (h / 2 - 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(w - 3, cursorY, 2, 0, Math.PI * 2);
    ctx.fill();
  }, [lfo.shape, liveValue, index]);

  return (
    <div className="p-2 rounded bg-white/[0.02] border border-white/10 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-white/70 font-medium">
          LFO {index + 1}
        </span>
        <canvas ref={canvasRef} width={80} height={24} className="rounded bg-black/40" />
      </div>

      {/* Shape picker */}
      <div className="grid grid-cols-6 gap-0.5">
        {SHAPES.map((s) => (
          <button
            key={s.id}
            onClick={() => update({ shape: s.id })}
            className={`py-1 rounded text-[8px] uppercase tracking-wider transition-colors ${
              lfo.shape === s.id
                ? "bg-white/15 text-white/80"
                : "bg-white/5 text-white/40 hover:bg-white/10"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Rate row: Hz-mode knob or Sync-mode dropdown */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => update({ rateSync: lfo.rateSync == null ? "4n" : null })}
          className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider transition-colors ${
            lfo.rateSync != null
              ? "bg-emerald-400/20 text-emerald-200"
              : "bg-white/5 text-white/50 hover:bg-white/10"
          }`}
        >
          {lfo.rateSync != null ? "SYNC" : "HZ"}
        </button>

        {lfo.rateSync != null ? (
          <select
            value={lfo.rateSync}
            onChange={(e) => update({ rateSync: e.target.value as SyncRate })}
            className="flex-1 px-1 py-0.5 text-[9px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
          >
            {SYNC_RATES.map((s) => (
              <option key={s} value={s}>{SYNC_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <>
            <Knob
              value={hzToKnob(lfo.rateHz)}
              onChange={(v) => update({ rateHz: knobToHz(v) })}
              size={28}
              label={`LFO ${index + 1} Rate`}
            />
            <span className="text-[9px] text-white/40 tabular-nums flex-1">
              {lfo.rateHz.toFixed(2)} Hz
            </span>
          </>
        )}
      </div>

      {/* Phase / Amp / Smooth row */}
      <div className="flex items-center gap-3">
        <ControlKnob
          label="Phase"
          value={lfo.phase}
          onChange={(v) => update({ phase: v })}
          display={`${Math.round(lfo.phase * 360)}°`}
        />
        <ControlKnob
          label="Amp"
          value={lfo.amp}
          onChange={(v) => update({ amp: v })}
          display={lfo.amp.toFixed(2)}
        />
        {(lfo.shape === "sampleHold" || lfo.shape === "noise") && (
          <ControlKnob
            label="Smooth"
            value={lfo.smooth}
            onChange={(v) => update({ smooth: v })}
            display={lfo.smooth.toFixed(2)}
          />
        )}
      </div>

      {/* Polarity */}
      <div className="flex gap-1">
        <button
          onClick={() => update({ unipolar: false })}
          className={`flex-1 py-1 rounded text-[8px] uppercase tracking-wider transition-colors ${
            !lfo.unipolar
              ? "bg-white/15 text-white/80"
              : "bg-white/5 text-white/40 hover:bg-white/10"
          }`}
        >
          Bipolar
        </button>
        <button
          onClick={() => update({ unipolar: true })}
          className={`flex-1 py-1 rounded text-[8px] uppercase tracking-wider transition-colors ${
            lfo.unipolar
              ? "bg-white/15 text-white/80"
              : "bg-white/5 text-white/40 hover:bg-white/10"
          }`}
        >
          Unipolar
        </button>
      </div>
    </div>
  );
}

function ControlKnob({
  label, value, onChange, display,
}: { label: string; value: number; onChange: (v: number) => void; display: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Knob value={value} onChange={onChange} size={28} label={label} />
      <span className="text-[8px] uppercase tracking-wider text-white/40">{label}</span>
      <span className="text-[8px] text-white/30 tabular-nums leading-none">{display}</span>
    </div>
  );
}
