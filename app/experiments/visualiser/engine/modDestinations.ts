/**
 * modDestinations.ts — helper for deriving the routing matrix's destination
 * columns from the current preset.
 *
 * Unlike Image Synth (fixed 22-destination list across camera/scan/synth/etc.),
 * the Visualiser's destinations are DYNAMIC — they are the current preset's
 * uniform knobs. When the preset changes, the destination list changes.
 *
 * The routing matrix UI reads this to render its header columns.
 */

import type { PresetDef, PresetParam } from "@/lib/gfx/types";
import type { PresetId } from "./types";

/** Ordered list of `{ name, label }` destinations for a preset's params. */
export function destinationsForPreset(preset: PresetDef<PresetId>): PresetParam[] {
  return preset.params;
}

/**
 * When switching from preset A to preset B, we want to KEEP any routes whose
 * destination name still exists in B, and DROP the rest.
 *
 * This runs on preset change so the user's LFOs / matrix don't disappear
 * when they switch shaders — they just lose the routes that don't apply.
 */
import type { ModMatrix, ModRouteKey } from "./types";

export function pruneMatrixForPreset(
  matrix: ModMatrix,
  preset: PresetDef<PresetId>,
): ModMatrix {
  const validUniforms = new Set(preset.params.map((p) => p.name));
  const out: ModMatrix = {};
  for (const [key, value] of Object.entries(matrix)) {
    if (value === undefined || value === 0) continue;
    // Key format: `${source}.${uniform}` — split at first dot.
    const dot = key.indexOf(".");
    if (dot === -1) continue;
    const uniform = key.slice(dot + 1);
    if (validUniforms.has(uniform)) out[key as ModRouteKey] = value;
  }
  return out;
}
