/**
 * Local storage for user-defined matrix + zones patches.
 *
 * Keyed under a versioned namespace so future schema migrations can
 * be handled cleanly. SSR-safe — returns empty/no-ops on the server.
 *
 * Schema:
 *   v1: { [id]: { id, name, matrix, createdAt } }                — legacy
 *   v2: { [id]: { id, name, matrix, zones, createdAt } }         — current
 *
 * On load, v2 is read first. If absent, v1 is migrated forward (each entry
 * gets `zones: []`) and persisted under the v2 key. v1 is never written again.
 */

import { cloneMatrix } from "./routing";
import type { RoutingMatrix } from "./types";
import type { Zone } from "./zones";

const STORAGE_KEY_V2 = "tech-art:wireframe-terrain:patches:v2";
const STORAGE_KEY_V1 = "tech-art:wireframe-terrain:patches:v1";

export interface SavedPatch {
  id: string;
  name: string;
  matrix: RoutingMatrix;
  /** Spatial audio zones — empty array for patches migrated from v1. */
  zones: Zone[];
  createdAt: number;
}

interface StorageShapeV2 {
  [id: string]: SavedPatch;
}

interface SavedPatchV1 {
  id: string;
  name: string;
  matrix: RoutingMatrix;
  createdAt: number;
}

interface StorageShapeV1 {
  [id: string]: SavedPatchV1;
}

/** True when window/localStorage is available (false during SSR). */
function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Read all saved patches, sorted newest-first.
 * Migrates v1 → v2 transparently on first read. Returns [] on SSR or parse error.
 */
export function loadPatches(): SavedPatch[] {
  if (!isBrowser()) return [];

  // 1) v2 — current shape.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as StorageShapeV2;
      return Object.values(parsed).sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch {
    /* fall through to v1 path */
  }

  // 2) v1 — migrate forward.
  try {
    const rawV1 = window.localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const parsedV1 = JSON.parse(rawV1) as StorageShapeV1;
      const migrated: StorageShapeV2 = {};
      for (const [id, p] of Object.entries(parsedV1)) {
        migrated[id] = {
          id: p.id,
          name: p.name,
          matrix: p.matrix,
          zones: [],
          createdAt: p.createdAt,
        };
      }
      persist(migrated);
      return Object.values(migrated).sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch {
    /* fall through */
  }

  return [];
}

/** Persist the full v2 patch dictionary. */
function persist(patches: StorageShapeV2): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(patches));
  } catch {
    /* quota errors etc. — silently ignore */
  }
}

/**
 * Save a patch with the given name. Includes the live zones array.
 * Returns the new SavedPatch or null on SSR.
 */
export function savePatch(
  name: string,
  matrix: RoutingMatrix,
  zones: Zone[],
): SavedPatch | null {
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
    // Deep clone zones so editing the live array doesn't mutate the stored copy.
    zones: zones.map((z) => ({ ...z, destinations: { ...z.destinations } })),
    createdAt: Date.now(),
  };
  all[id] = patch;
  persist(all);
  return patch;
}

/** Delete a patch by id from the v2 store. */
export function deletePatch(id: string): void {
  if (!isBrowser()) return;
  const all = readAll();
  delete all[id];
  persist(all);
}

/** Internal — raw read of the v2 dictionary. */
function readAll(): StorageShapeV2 {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) return {};
    return JSON.parse(raw) as StorageShapeV2;
  } catch {
    return {};
  }
}
