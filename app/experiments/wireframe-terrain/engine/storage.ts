/**
 * Local storage for user-defined matrix patches.
 *
 * Keyed under a versioned namespace so future schema migrations can
 * be handled cleanly. SSR-safe — returns empty/no-ops on the server.
 *
 * Storage shape:
 *   {
 *     [id]: { id, name, matrix, createdAt }
 *   }
 *
 * Why ids separate from names: lets users rename in future without
 * orphaning storage; lets us regenerate ids on import without name collisions.
 */

import { cloneMatrix } from "./routing";
import type { RoutingMatrix } from "./types";

const STORAGE_KEY = "tech-art:wireframe-terrain:patches:v1";

export interface SavedPatch {
  id: string;
  name: string;
  matrix: RoutingMatrix;
  createdAt: number;
}

interface StorageShape {
  [id: string]: SavedPatch;
}

/** True when window/localStorage is available (false during SSR). */
function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Read all saved patches, sorted newest-first. Returns [] on SSR or parse error. */
export function loadPatches(): SavedPatch[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StorageShape;
    return Object.values(parsed).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

/** Persist the full patch dictionary. */
function persist(patches: StorageShape): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(patches));
  } catch {
    /* quota errors etc. — silently ignore */
  }
}

/** Save a patch with the given name. Returns the new SavedPatch or null on SSR. */
export function savePatch(name: string, matrix: RoutingMatrix): SavedPatch | null {
  if (!isBrowser()) return null;
  const trimmed = name.trim().substring(0, 64) || "Untitled";
  const all = readAll();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `patch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const patch: SavedPatch = {
    id,
    name: trimmed,
    matrix: cloneMatrix(matrix),
    createdAt: Date.now(),
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

/** Internal — raw read of the dictionary. */
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
