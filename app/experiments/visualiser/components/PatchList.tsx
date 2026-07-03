"use client";

/**
 * PatchList — save/load/delete for Visualiser patches.
 *
 * A patch captures: presetId + presetParams + lfos + modMatrix + bpm.
 *
 * Loading a patch always switches back to the patch's preset — that's why
 * we take a callback that hands over the full applied state to page.tsx.
 *
 * Local-only useState mirror of loadPatches() — refreshed after each save
 * / delete so the list stays in sync without any global store.
 */

import { useState } from "react";
import { loadPatches, savePatch, deletePatch } from "../engine/storage";
import type { VisualiserPatch } from "../engine/storage";
import type { LFOConfig } from "@/lib/audio/lfo";
import type { ModMatrix, PresetId } from "../engine/types";
import { PRESET_BY_ID } from "../engine/presets";

interface Props {
  presetId: PresetId;
  presetParams: Record<string, number>;
  lfos: LFOConfig[];
  modMatrix: ModMatrix;
  bpm: number;
  onLoad: (patch: VisualiserPatch) => void;
}

export default function PatchList(props: Props) {
  const [patches, setPatches] = useState<VisualiserPatch[]>(() => loadPatches());
  const [name, setName] = useState("");

  const refresh = () => setPatches(loadPatches());

  const onSave = () => {
    savePatch(name || "Untitled", props.presetId, props.presetParams, props.lfos, props.modMatrix, props.bpm);
    setName("");
    refresh();
  };

  const onDelete = (id: string) => {
    deletePatch(id);
    refresh();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          type="text"
          placeholder="Patch name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 min-w-0 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
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
          No patches yet. Save the current preset + params + LFOs + routing to recall later.
        </p>
      ) : (
        <ul className="space-y-0.5 max-h-72 overflow-y-auto">
          {patches.map((p) => (
            <li key={p.id} className="flex items-center gap-1 text-[10px]">
              <button
                onClick={() => props.onLoad(p)}
                className="flex-1 min-w-0 text-left px-2 py-1 rounded bg-white/[0.03] hover:bg-white/10 text-white/70 transition-colors"
                title={`Saved ${new Date(p.createdAt).toLocaleString()} — preset: ${PRESET_BY_ID[p.presetId]?.label ?? p.presetId}`}
              >
                <div className="truncate">{p.name}</div>
                <div className="text-[8px] text-white/30 uppercase tracking-wider">
                  {PRESET_BY_ID[p.presetId]?.label ?? p.presetId} · {p.bpm} bpm
                </div>
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
