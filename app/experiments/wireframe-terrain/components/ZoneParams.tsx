"use client";

/**
 * ZoneParams — per-zone parameter panel for the selected zone.
 *
 * Shows the band picker, hardness slider, an 8-knob grid for the destination
 * depths, an optional colour tint, and a delete button. Returns null when no
 * zone is selected.
 *
 * All edits flow back through `onUpdate(next)` — the parent owns state.
 */

import {
  BAND_IDS,
  BAND_LABELS,
  DESTINATION_IDS,
  DESTINATION_LABELS,
} from "../engine/types";
import type { BandId, DestinationId } from "../engine/types";
import type { Zone } from "../engine/zones";
import { BAND_COLOURS } from "../engine/zones";
import Knob from "@/components/Knob";

interface Props {
  zone: Zone;
  onUpdate: (next: Zone) => void;
  onDelete: () => void;
}

export default function ZoneParams({ zone, onUpdate, onDelete }: Props) {
  /** Patch the zone with the given partial. Always writes a fresh object. */
  const update = (patch: Partial<Zone>) => onUpdate({ ...zone, ...patch });

  /** Set a single destination depth; removes the key when depth drops to 0. */
  const setDest = (d: DestinationId, v: number) => {
    const next = { ...zone.destinations };
    if (v <= 0) {
      delete next[d];
    } else {
      next[d] = v;
    }
    update({ destinations: next });
  };

  const tintEnabled = zone.tint !== null;

  return (
    <div className="space-y-3 pt-3 border-t border-white/5">
      {/* Header — band swatch + selected ID hint */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: BAND_COLOURS[zone.band] }}
            aria-hidden
          />
          <span className="text-[10px] uppercase tracking-wider text-white/60">
            Selected Zone · {BAND_LABELS[zone.band]}
          </span>
        </div>
      </div>

      {/* Band picker */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-white/40">
          Band
        </label>
        <div className="grid grid-cols-6 gap-1">
          {BAND_IDS.map((b: BandId) => {
            const active = b === zone.band;
            return (
              <button
                key={b}
                onClick={() => update({ band: b })}
                className={`py-1 rounded text-[9px] uppercase tracking-wider transition-colors ${
                  active
                    ? "text-white/90"
                    : "bg-white/5 text-white/40 hover:bg-white/10"
                }`}
                style={
                  active
                    ? { background: withAlpha(BAND_COLOURS[b], 0.35) }
                    : undefined
                }
              >
                {BAND_LABELS[b]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Hardness */}
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-wider text-white/40">
            Hardness
          </span>
          <span className="text-[10px] text-white/30 tabular-nums">
            {zone.hardness.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={zone.hardness}
          onChange={(e) => update({ hardness: Number(e.target.value) })}
          className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
        />
      </div>

      {/* Destinations */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-white/40">
          Destinations
        </label>
        <div className="grid grid-cols-4 gap-y-2">
          {DESTINATION_IDS.map((d) => (
            <div key={d} className="flex flex-col items-center gap-1">
              <Knob
                size={28}
                value={zone.destinations[d] ?? 0}
                onChange={(v) => setDest(d, v)}
                label={`${BAND_LABELS[zone.band]} ${DESTINATION_LABELS[d]}`}
              />
              <span className="text-[8px] uppercase tracking-wider text-white/40 leading-none">
                {DESTINATION_LABELS[d]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tint */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-wider text-white/40">
            Use Tint
          </label>
          <button
            onClick={() =>
              update({ tint: tintEnabled ? null : "#ff66cc" })
            }
            className={`relative w-9 h-5 rounded-full transition-colors ${
              tintEnabled ? "bg-white/30" : "bg-white/10"
            }`}
            aria-pressed={tintEnabled}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                tintEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {tintEnabled && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={zone.tint ?? "#ff66cc"}
                onChange={(e) => update({ tint: e.target.value })}
                className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
              />
              <span className="text-[10px] text-white/30 tabular-nums uppercase">
                {(zone.tint ?? "#ff66cc").toUpperCase()}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider text-white/40">
                  Tint Depth
                </span>
                <span className="text-[10px] text-white/30 tabular-nums">
                  {zone.tintDepth.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={zone.tintDepth}
                onChange={(e) =>
                  update({ tintDepth: Number(e.target.value) })
                }
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
              />
            </div>
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-full mt-1 py-1.5 text-[10px] uppercase tracking-wider text-red-200/80 bg-red-500/15 hover:bg-red-500/25 rounded transition-colors"
      >
        Delete Zone
      </button>
    </div>
  );
}

/** Append an alpha (0-1) to a #rrggbb hex colour as an rgba() string. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
