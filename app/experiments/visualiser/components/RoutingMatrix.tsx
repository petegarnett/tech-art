"use client";

/**
 * RoutingMatrix — 9 mod sources × N preset uniforms.
 *
 * Grid layout:
 *   - Header row: preset uniform labels (rotated vertical to fit).
 *   - Row per source: label + live-value bar + one bipolar knob per uniform.
 *
 * Each cell is a Knob wrapped to a bipolar range (-1..+1). Double-click a
 * cell to reset to 0 (unroute). Non-zero cells get a coloured ring; strong
 * routes (>0.7) get an emerald ring to highlight them at a glance.
 *
 * The destination columns are DYNAMIC — they come from the current preset's
 * params list. That's why this component takes `preset` as a prop rather
 * than reading from a static config.
 */

import Knob from "@/components/Knob";
import type { PresetDef, PresetParam } from "@/lib/gfx/types";
import type { ModMatrix, ModSourceId, PresetId } from "../engine/types";
import { MOD_SOURCE_IDS, MOD_SOURCE_LABELS, modRouteKey } from "../engine/types";

interface Props {
  preset: PresetDef<PresetId>;
  modMatrix: ModMatrix;
  setModMatrix: (m: ModMatrix) => void;
  /**
   * Live values for the 9 sources — used for the meter bars beside each row.
   * Order matches MOD_SOURCE_IDS: bass, mid, treble, energy, beat, lfo1-4.
   */
  liveSourceValues: Float32Array; // length 9
}

export default function RoutingMatrix({
  preset, modMatrix, setModMatrix, liveSourceValues,
}: Props) {
  const dests = preset.params;

  // Set / unset one cell.
  const setCell = (source: ModSourceId, uniform: string, value: number) => {
    const key = modRouteKey(source, uniform);
    const next: ModMatrix = { ...modMatrix };
    if (value === 0) delete next[key];
    else next[key] = value;
    setModMatrix(next);
  };

  const clearAll = () => setModMatrix({});
  const activeCount = Object.values(modMatrix).filter((v) => v !== 0 && v !== undefined).length;

  return (
    <div className="space-y-2">
      {/* Header — preset name + active count + clear */}
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
        <span className="text-white/50">{preset.label} · {activeCount} route{activeCount === 1 ? "" : "s"}</span>
        <button
          onClick={clearAll}
          disabled={activeCount === 0}
          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed text-white/60 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-block min-w-full">
          {/* Column header — vertical uniform labels */}
          <HeaderRow dests={dests} />

          {/* 9 rows — one per mod source */}
          {MOD_SOURCE_IDS.map((source, sourceIdx) => (
            <SourceRow
              key={source}
              source={source}
              live={liveSourceValues[sourceIdx] ?? 0}
              dests={dests}
              modMatrix={modMatrix}
              setCell={setCell}
            />
          ))}
        </div>
      </div>

      <p className="text-[9px] text-white/30 leading-relaxed">
        Drag a knob to route the source to that uniform. Bipolar: -1 inverts. Double-click a knob to clear.
      </p>
    </div>
  );
}

/* ─── Rows ─── */

function HeaderRow({ dests }: { dests: PresetParam[] }) {
  return (
    <div className="flex items-end gap-1 mb-1" style={{ paddingLeft: 60 }}>
      {dests.map((d) => (
        <div
          key={d.name}
          className="flex-shrink-0 text-[8px] uppercase tracking-wider text-white/40 text-center"
          style={{ width: 32, height: 56, writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}
          title={d.name}
        >
          {d.label}
        </div>
      ))}
    </div>
  );
}

function SourceRow({
  source, live, dests, modMatrix, setCell,
}: {
  source: ModSourceId;
  live: number;
  dests: PresetParam[];
  modMatrix: ModMatrix;
  setCell: (source: ModSourceId, uniform: string, value: number) => void;
}) {
  const labelInfo = MOD_SOURCE_LABELS[source];
  const liveAbs = Math.abs(live);
  const isBipolarSource = source.startsWith("lfo"); // LFOs can be bipolar; bands are 0..1

  return (
    <div className="flex items-center gap-1 mb-1">
      {/* Row label + live bar */}
      <div className="flex flex-col items-center flex-shrink-0" style={{ width: 56 }}>
        <span className="text-[9px] uppercase tracking-wider text-white/60">{labelInfo.short}</span>
        <div className="relative w-12 h-1.5 bg-white/5 rounded mt-0.5 overflow-hidden">
          {isBipolarSource ? (
            <>
              <div
                className="absolute top-0 h-full"
                style={{
                  left: live >= 0 ? "50%" : `${50 - liveAbs * 50}%`,
                  width: `${liveAbs * 50}%`,
                  background: live >= 0 ? "rgba(110,210,255,0.85)" : "rgba(255,170,110,0.85)",
                }}
              />
              <div className="absolute top-0 left-1/2 w-px h-full bg-white/20" />
            </>
          ) : (
            <div
              className="absolute top-0 left-0 h-full"
              style={{ width: `${liveAbs * 100}%`, background: "rgba(110,210,255,0.85)" }}
            />
          )}
        </div>
      </div>

      {/* Cells */}
      {dests.map((d) => {
        const key = modRouteKey(source, d.name);
        const value = modMatrix[key] ?? 0;
        return (
          <BipolarCell
            key={d.name}
            value={value}
            onChange={(v) => setCell(source, d.name, v)}
          />
        );
      })}
    </div>
  );
}

/**
 * Bipolar cell — wraps Knob with -1..+1 mapping.
 *
 * Knob is unipolar (0..1) natively. We map (value + 1) / 2 in and 2v - 1 out.
 * Rings signal activity: strong (>0.7 magnitude) = emerald, active = white.
 */
function BipolarCell({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  const knobValue = (value + 1) / 2;
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
