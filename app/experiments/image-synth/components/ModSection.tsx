"use client";

/**
 * ModSection — the centralised MOD tab in the ControlPanel.
 *
 * Lays out:
 *   1. Header status — active-route count + bypass toggle.
 *   2. 4 LFO panels (2×2 grid on desktop, 1×4 on mobile) — shape picker,
 *      rate (Hz / sync), phase, amp, polarity, smooth + live mini-waveform.
 *   3. Tempo input — BPM, drives sync-rate LFOs.
 *   4. Routing matrix — 4 rows × N columns, filtered by group sub-tab.
 *      Each cell is a small bipolar Knob (-1..+1) writing into modMatrix.
 *   5. Patch save/load/delete row — localStorage roundtrip.
 *
 * All UI state stays local to this component except modMatrix / lfos / bpm /
 * bypass — those are owned by page.tsx and threaded down.
 */

import { useEffect, useRef, useState } from "react";
import Knob from "@/components/Knob";
import { previewWaveform, SYNC_RATES, SYNC_LABELS } from "@/lib/audio/lfo";
import type { LFOConfig, LFOShape, SyncRate } from "@/lib/audio/lfo";
import {
  MOD_DESTINATIONS,
  MOD_DESTINATIONS_BY_GROUP,
  MOD_GROUPS,
  MOD_GROUP_LABELS,
} from "../engine/modDestinations";
import type { ModDestinationDef } from "../engine/modDestinations";
import {
  loadPatches,
  savePatch,
  deletePatch,
} from "../engine/storage";
import type { ImageSynthPatch } from "../engine/storage";
import { modRouteKey } from "../engine/types";
import type { MatrixConfig, ModDestGroup, ModMatrix } from "../engine/types";

interface Props {
  lfos: LFOConfig[];
  setLfos: (lfos: LFOConfig[]) => void;
  modMatrix: ModMatrix;
  setModMatrix: (m: ModMatrix) => void;
  bpm: number;
  setBpm: (n: number) => void;
  modBypass: boolean;
  setModBypass: (b: boolean) => void;
  lfoLiveValues: Float32Array; // length 4
  /** Used when saving a patch alongside the LFOs. */
  matrix: MatrixConfig;
  /** Called after a patch is loaded — page applies all four pieces. */
  onLoadPatch: (patch: ImageSynthPatch) => void;
}

const SHAPES: { id: LFOShape; label: string }[] = [
  { id: "sine",       label: "sine" },
  { id: "triangle",   label: "tri" },
  { id: "saw",        label: "saw" },
  { id: "square",     label: "sq" },
  { id: "sampleHold", label: "s&h" },
  { id: "noise",      label: "nz" },
];

export default function ModSection(props: Props) {
  const {
    lfos, setLfos,
    modMatrix, setModMatrix,
    bpm, setBpm,
    modBypass, setModBypass,
    lfoLiveValues,
    matrix,
    onLoadPatch,
  } = props;

  // Group filter for the routing matrix.
  const [group, setGroup] = useState<ModDestGroup | "all">("all");

  const updateLFO = (i: number, patch: Partial<LFOConfig>) => {
    const next = lfos.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setLfos(next);
  };

  // Count of non-zero routes — for header status.
  const activeRoutes = Object.values(modMatrix).filter((v) => v !== 0 && v !== undefined).length;

  // Destinations to render in the grid, filtered by group.
  const visibleDests = group === "all"
    ? MOD_DESTINATIONS
    : MOD_DESTINATIONS_BY_GROUP[group];

  return (
    <div className="space-y-4">
      {/* ─── Header status ─── */}
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
        <span className="text-white/40">
          {activeRoutes} active route{activeRoutes === 1 ? "" : "s"}
        </span>
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

      {/* ─── 4 LFO panels ─── */}
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

      {/* ─── Group sub-tabs ─── */}
      <div className="space-y-2">
        <label className="text-[10px] uppercase tracking-wider text-white/40">Routing</label>
        <div className="grid grid-cols-6 gap-1">
          {MOD_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`py-1 rounded text-[9px] uppercase tracking-wider transition-colors ${
                group === g
                  ? "bg-white/15 text-white/80"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              {MOD_GROUP_LABELS[g]}
            </button>
          ))}
        </div>

        {/* ─── Routing matrix grid ─── */}
        <RoutingGrid
          visibleDests={visibleDests}
          modMatrix={modMatrix}
          setModMatrix={setModMatrix}
          lfoLiveValues={lfoLiveValues}
        />
      </div>

      {/* ─── Patch persistence ─── */}
      <PatchSection
        matrix={matrix}
        lfos={lfos}
        modMatrix={modMatrix}
        bpm={bpm}
        onLoadPatch={onLoadPatch}
      />
    </div>
  );
}

/* ═══ LFO Panel ═══════════════════════════════════════════════════════ */

function LFOPanel({
  index,
  lfo,
  liveValue,
  update,
}: {
  index: number;
  lfo: LFOConfig;
  liveValue: number;
  update: (patch: Partial<LFOConfig>) => void;
}) {
  // Maps rateHz (0.01..30) to a 0..1 knob position, logarithmic so low rates
  // get more resolution.
  const hzToKnob = (hz: number) => Math.max(0, Math.min(1, Math.log(hz / 0.01) / Math.log(30 / 0.01)));
  const knobToHz = (k: number) => 0.01 * Math.pow(30 / 0.01, k);

  // Phase 0..1 ↔ knob 0..1 directly.
  const phaseKnob = lfo.phase;
  // Amp 0..1 ↔ knob 0..1 directly.
  const ampKnob = lfo.amp;
  // Smooth 0..1 ↔ knob 0..1 directly.
  const smoothKnob = lfo.smooth;

  // Live preview canvas — uses the bank's current value to also nudge the cursor.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const w = cvs.width;
    const h = cvs.height;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    // Draw centre line.
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    // Draw shape.
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
    // Cursor — current value.
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

      {/* Rate row */}
      <div className="flex items-center gap-2">
        {/* Hz / SYNC toggle */}
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
          value={phaseKnob}
          onChange={(v) => update({ phase: v })}
          display={`${Math.round(lfo.phase * 360)}°`}
        />
        <ControlKnob
          label="Amp"
          value={ampKnob}
          onChange={(v) => update({ amp: v })}
          display={lfo.amp.toFixed(2)}
        />
        {(lfo.shape === "sampleHold" || lfo.shape === "noise") && (
          <ControlKnob
            label="Smooth"
            value={smoothKnob}
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

/* ═══ Routing grid ════════════════════════════════════════════════════ */

function RoutingGrid({
  visibleDests,
  modMatrix,
  setModMatrix,
  lfoLiveValues,
}: {
  visibleDests: ModDestinationDef[];
  modMatrix: ModMatrix;
  setModMatrix: (m: ModMatrix) => void;
  lfoLiveValues: Float32Array;
}) {
  const setCell = (lfoIdx: number, destId: ModDestinationDef["id"], value: number) => {
    const key = modRouteKey(lfoIdx, destId);
    const next = { ...modMatrix };
    if (value === 0) delete next[key];
    else next[key] = value;
    setModMatrix(next);
  };

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="inline-block min-w-full">
        {/* Header row — destination labels (rotated vertical so they fit). */}
        <div className="flex items-end gap-1 mb-1" style={{ paddingLeft: 56 }}>
          {visibleDests.map((d) => (
            <div
              key={d.id}
              className="flex-shrink-0 text-[8px] uppercase tracking-wider text-white/40 text-center"
              style={{ width: 32, height: 56, writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}
              title={d.hint || d.label}
            >
              {d.short}
            </div>
          ))}
        </div>

        {/* 4 rows, one per LFO. */}
        {[0, 1, 2, 3].map((lfoIdx) => {
          const live = lfoLiveValues[lfoIdx] ?? 0;
          // Live value bar — map -1..+1 to a bipolar bar.
          const liveAbs = Math.abs(live);
          return (
            <div key={lfoIdx} className="flex items-center gap-1 mb-1">
              {/* Row label + live bar */}
              <div className="flex flex-col items-center flex-shrink-0" style={{ width: 52 }}>
                <span className="text-[9px] uppercase tracking-wider text-white/60">LFO {lfoIdx + 1}</span>
                <div className="relative w-10 h-1.5 bg-white/5 rounded mt-0.5 overflow-hidden">
                  <div
                    className="absolute top-0 h-full"
                    style={{
                      left: live >= 0 ? "50%" : `${50 - liveAbs * 50}%`,
                      width: `${liveAbs * 50}%`,
                      background: live >= 0 ? "rgba(110,210,255,0.85)" : "rgba(255,170,110,0.85)",
                    }}
                  />
                  <div className="absolute top-0 left-1/2 w-px h-full bg-white/20" />
                </div>
              </div>

              {/* Cells */}
              {visibleDests.map((d) => {
                const key = modRouteKey(lfoIdx, d.id);
                const value = modMatrix[key] ?? 0; // -1..+1
                return (
                  <BipolarCell
                    key={d.id}
                    value={value}
                    onChange={(v) => setCell(lfoIdx, d.id, v)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Small bipolar cell — wraps Knob, mapping the -1..+1 value to 0..1 via
 * (v + 1)/2. Active routes get a brighter outline.
 */
function BipolarCell({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  const knobValue = (value + 1) / 2; // 0..1 representation
  const handleChange = (k: number) => onChange(k * 2 - 1);
  const active = value !== 0;
  const strong = Math.abs(value) > 0.7;
  return (
    <div
      className={`flex-shrink-0 rounded transition-colors ${
        strong
          ? "ring-2 ring-emerald-400/70 bg-emerald-400/10"
          : active
          ? "ring-1 ring-white/40 bg-white/[0.04]"
          : ""
      }`}
      onDoubleClick={() => onChange(0)}
      style={{ width: 32, height: 32 }}
      title={value === 0 ? "Unrouted (drag to set)" : value.toFixed(2)}
    >
      <Knob
        value={knobValue}
        onChange={handleChange}
        size={28}
        dragRange={200}
      />
    </div>
  );
}

/* ═══ Patch persistence ═══════════════════════════════════════════════ */

function PatchSection({
  matrix, lfos, modMatrix, bpm, onLoadPatch,
}: {
  matrix: MatrixConfig;
  lfos: LFOConfig[];
  modMatrix: ModMatrix;
  bpm: number;
  onLoadPatch: (p: ImageSynthPatch) => void;
}) {
  // Lazy initialiser reads localStorage on first render — no effect needed,
  // no SSR error (loadPatches() is browser-safe and returns [] on the server).
  const [patches, setPatches] = useState<ImageSynthPatch[]>(() => loadPatches());
  const [name, setName] = useState("");

  const refresh = () => setPatches(loadPatches());

  const onSave = () => {
    const p = savePatch(name || "Untitled", matrix, lfos, modMatrix, bpm);
    if (p) {
      setName("");
      refresh();
    }
  };

  const onDelete = (id: string) => {
    deletePatch(id);
    refresh();
  };

  return (
    <div className="space-y-2 p-2 rounded bg-white/[0.02] border border-white/10">
      <label className="text-[10px] uppercase tracking-wider text-white/40">Patches</label>
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="Patch name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
        />
        <button
          onClick={onSave}
          className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/70 bg-white/10 hover:bg-white/20 rounded transition-colors"
        >
          Save
        </button>
      </div>

      {patches.length === 0 ? (
        <p className="text-[9px] text-white/30 leading-relaxed">
          No patches saved yet. Save the current LFOs + routing to recall later.
        </p>
      ) : (
        <ul className="space-y-0.5 max-h-32 overflow-y-auto">
          {patches.map((p) => (
            <li key={p.id} className="flex items-center gap-1 text-[10px]">
              <button
                onClick={() => onLoadPatch(p)}
                className="flex-1 text-left px-2 py-1 rounded bg-white/[0.03] hover:bg-white/10 text-white/70 transition-colors truncate"
                title={`Saved ${new Date(p.createdAt).toLocaleString()}`}
              >
                {p.name}
              </button>
              <button
                onClick={() => onDelete(p.id)}
                className="px-1.5 py-1 rounded text-white/30 hover:bg-red-500/20 hover:text-red-200 transition-colors"
                title="Delete"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
