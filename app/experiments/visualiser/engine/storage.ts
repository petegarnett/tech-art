/**
 * storage.ts — Visualiser patch persistence.
 *
 * A patch captures the user's musical/visual instrument state:
 *   - presetId
 *   - presetParams — the knob values for THAT preset only
 *   - lfos (LFOConfig[4])
 *   - modMatrix
 *   - bpm
 *
 * Design note: patches are per-preset. Save a patch on PLASMA, switch to
 * TUNNEL, then load the PLASMA patch → we switch back to PLASMA and restore
 * everything. Loading a patch always restores its `presetId`.
 *
 * Storage key: `tech-art:visualiser:patch:v1`. Bumping to v2 in the future
 * = add a new key + migrator, don't clobber v1 users.
 *
 * SSR-safe: all reads/writes gated by `isBrowser()`.
 */

import type { LFOConfig } from "@/lib/audio/lfo";
import type { ModMatrix, PresetId } from "./types";

const STORAGE_KEY = "tech-art:visualiser:patch:v1";

export interface VisualiserPatch {
  id: string;
  name: string;
  createdAt: number;
  presetId: PresetId;
  /** Uniform name → 0-1 value. Only meaningful for the patch's presetId. */
  presetParams: Record<string, number>;
  lfos: LFOConfig[];
  modMatrix: ModMatrix;
  bpm: number;
}

interface StorageShape {
  [id: string]: VisualiserPatch;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Raw dict read — returns {} on SSR or parse error. */
function readAll(): StorageShape {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StorageShape;
  } catch {
    return {};
  }
}

/** Persist the full dict. Silently swallows quota errors. */
function persist(all: StorageShape): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota etc. — swallow */
  }
}

/** Load all patches, newest first. */
export function loadPatches(): VisualiserPatch[] {
  return Object.values(readAll()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Save a new patch with the given name + contents. Returns it (or null on SSR). */
export function savePatch(
  name: string,
  presetId: PresetId,
  presetParams: Record<string, number>,
  lfos: LFOConfig[],
  modMatrix: ModMatrix,
  bpm: number,
): VisualiserPatch | null {
  if (!isBrowser()) return null;
  const trimmed = name.trim().substring(0, 64) || "Untitled";
  const all = readAll();
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const patch: VisualiserPatch = {
    id,
    name: trimmed,
    createdAt: Date.now(),
    presetId,
    // Deep-clone to defend against later in-place mutation.
    presetParams: { ...presetParams },
    lfos: lfos.map((l) => ({ ...l })),
    modMatrix: { ...modMatrix },
    bpm,
  };
  all[id] = patch;
  persist(all);
  return patch;
}

/** Delete a patch by id. */
export function deletePatch(id: string): void {
  if (!isBrowser()) return;
  const all = readAll();
  delete all[id];
  persist(all);
}
