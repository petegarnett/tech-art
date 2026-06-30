/**
 * storage.ts — localStorage patch system for Image Synth.
 *
 * A patch is the user-controllable state of the modulation matrix:
 *   - matrix        (per-destination depth values, 0..1)
 *   - lfos          (4 LFO configs)
 *   - modMatrix     (sparse routing LFO → dest)
 *   - bpm           (tempo, used by sync-rate LFOs)
 *
 * The rest of the state (camera / scan / synth / scale / viz) is intentionally
 * NOT persisted here — it's session-bound. This keeps "loading a patch"
 * focused on what feels like a mod-matrix preset.
 *
 * Schema is versioned under `tech-art:image-synth:patch:v1` so future changes
 * can migrate cleanly.
 */

import type { LFOConfig } from "./lfo";
import type { MatrixConfig, ModMatrix } from "./types";

const STORAGE_KEY = "tech-art:image-synth:patch:v1";

export interface ImageSynthPatch {
  id: string;
  name: string;
  createdAt: number;
  matrix: MatrixConfig;
  lfos: LFOConfig[];
  modMatrix: ModMatrix;
  bpm: number;
}

interface StorageShape {
  [id: string]: ImageSynthPatch;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Read raw patch dict. */
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

/** Persist patch dict. */
function persist(all: StorageShape): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* quota etc. — swallow */
  }
}

/** Load all patches, newest first. */
export function loadPatches(): ImageSynthPatch[] {
  return Object.values(readAll()).sort((a, b) => b.createdAt - a.createdAt);
}

/** Save a new patch with the given name and contents. Returns it (or null on SSR). */
export function savePatch(
  name: string,
  matrix: MatrixConfig,
  lfos: LFOConfig[],
  modMatrix: ModMatrix,
  bpm: number,
): ImageSynthPatch | null {
  if (!isBrowser()) return null;
  const trimmed = name.trim().substring(0, 64) || "Untitled";
  const all = readAll();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const patch: ImageSynthPatch = {
    id,
    name: trimmed,
    createdAt: Date.now(),
    // Deep-clone to defend against later in-place mutation.
    matrix: { ...matrix },
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
