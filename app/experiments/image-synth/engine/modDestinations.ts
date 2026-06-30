/**
 * modDestinations.ts — data-driven config for the LFO modulation matrix.
 *
 * Each entry describes a target the LFO bank can modulate. The entries are
 * grouped by logical UI section (camera / scan / synth / matrix / viz). The
 * MOD tab filters by group to keep the routing grid usable on mobile.
 *
 * Adding a destination = one entry here + a base-value accessor in
 * `readModBase` and a writer in the loop hook's apply step.
 *
 * Math: per frame, for each destination we compute
 *     value = base + sum(lfo[i] * route[i, dest]) * scale
 * then clamp. `scale` controls how much one LFO unit moves the param.
 */

import type { ModDestId, ModDestGroup } from "./types";

export interface ModDestinationDef {
  id: ModDestId;
  label: string;
  /** Short label used in the grid header. */
  short: string;
  group: ModDestGroup;
  /** Final value range applied per LFO unit. */
  scale: number;
  /** Optional clamps applied to the modulated value. */
  clamp?: [number, number];
  /** Hint: param is naturally bipolar (pan / detune). */
  bipolar?: boolean;
  /** Short tooltip. */
  hint?: string;
}

export const MOD_DESTINATIONS: ModDestinationDef[] = [
  /* ─── camera ─── */
  {
    id: "cameraThreshold",
    label: "Cam Threshold",
    short: "Thresh",
    group: "camera",
    scale: 1.0,
    clamp: [0, 1],
    hint: "Brightness gate on the camera frame.",
  },

  /* ─── scan ─── */
  {
    id: "scanSpeed",
    label: "Scan Speed",
    short: "Speed",
    group: "scan",
    scale: 5,
    clamp: [0, 10],
    hint: "Sweep rate (sweep mode only).",
  },
  {
    id: "scanX",
    label: "Scan X",
    short: "Scan X",
    group: "scan",
    scale: 0.5,
    clamp: [0, 1],
    hint: "Scan position (freeze mode only).",
  },

  /* ─── synth ─── */
  {
    id: "masterVolume",
    label: "Master Vol",
    short: "Vol",
    group: "synth",
    scale: 0.5,
    clamp: [0, 1],
    hint: "Master output gain.",
  },
  {
    id: "reverbWet",
    label: "Reverb Wet",
    short: "Verb",
    group: "synth",
    scale: 0.5,
    clamp: [0, 1],
    hint: "Master reverb send.",
  },
  {
    id: "delayWet",
    label: "Delay Wet",
    short: "Dly",
    group: "synth",
    scale: 0.5,
    clamp: [0, 1],
    hint: "Master delay send.",
  },
  {
    id: "sampleLoopStart",
    label: "Loop Start",
    short: "LStart",
    group: "synth",
    scale: 0.5,
    clamp: [0, 1],
    hint: "Sample loop start (sample mode only).",
  },
  {
    id: "sampleLoopEnd",
    label: "Loop End",
    short: "LEnd",
    group: "synth",
    scale: 0.5,
    clamp: [0, 1],
    hint: "Sample loop end (sample mode only).",
  },

  /* ─── matrix (the routing depths themselves) ─── */
  {
    id: "matrixFilterCutoffDepth",
    label: "Cutoff Depth",
    short: "Cut",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    hint: "Matrix filter-cutoff depth.",
  },
  {
    id: "matrixResonanceDepth",
    label: "Res Depth",
    short: "Res",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    hint: "Matrix resonance depth.",
  },
  {
    id: "matrixReverbSendDepth",
    label: "Verb Depth",
    short: "Verb",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    hint: "Matrix per-voice reverb send depth.",
  },
  {
    id: "matrixDelaySendDepth",
    label: "Dly Depth",
    short: "Dly",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    hint: "Matrix per-voice delay send depth.",
  },
  {
    id: "matrixPanDepth",
    label: "Pan Depth",
    short: "Pan",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    bipolar: true,
    hint: "Matrix pan depth.",
  },
  {
    id: "matrixDetuneDepth",
    label: "Det Depth",
    short: "Det",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    bipolar: true,
    hint: "Matrix detune depth.",
  },
  {
    id: "matrixWaveformMorphDepth",
    label: "Morph Depth",
    short: "Mph",
    group: "matrix",
    scale: 1,
    clamp: [0, 1],
    hint: "Matrix waveform-morph depth.",
  },

  /* ─── viz (GLITCH preset uniforms) ─── */
  {
    id: "vizChromaticAberration",
    label: "Viz Chroma",
    short: "Chr",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — chromatic aberration.",
  },
  {
    id: "vizScanlineTear",
    label: "Viz Tear",
    short: "Tear",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — scanline tear.",
  },
  {
    id: "vizBitCrush",
    label: "Viz Crush",
    short: "Crsh",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — bit crush.",
  },
  {
    id: "vizEdgeBoost",
    label: "Viz Edges",
    short: "Edge",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — edge boost.",
  },
  {
    id: "vizHueRotate",
    label: "Viz Hue",
    short: "Hue",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — hue rotate.",
  },
  {
    id: "vizZoom",
    label: "Viz Zoom",
    short: "Zoom",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — bass zoom.",
  },
  {
    id: "vizBlockShift",
    label: "Viz Block",
    short: "Blk",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — datamosh / block shift.",
  },
  {
    id: "vizCameraMix",
    label: "Viz Cam Mix",
    short: "CMix",
    group: "viz",
    scale: 1,
    clamp: [0, 1],
    hint: "Glitch — camera mix.",
  },
];

/** Lookup by id. */
export const MOD_DESTINATION_BY_ID: Record<ModDestId, ModDestinationDef> = Object.fromEntries(
  MOD_DESTINATIONS.map((d) => [d.id, d]),
) as Record<ModDestId, ModDestinationDef>;

/** Group → ordered list of destinations. */
export const MOD_DESTINATIONS_BY_GROUP: Record<ModDestGroup, ModDestinationDef[]> = {
  camera: [],
  scan:   [],
  synth:  [],
  matrix: [],
  viz:    [],
};
for (const d of MOD_DESTINATIONS) MOD_DESTINATIONS_BY_GROUP[d.group].push(d);

/** All mod destination ids in display order. */
export const MOD_DEST_IDS: ModDestId[] = MOD_DESTINATIONS.map((d) => d.id);

/** Group labels (UI). */
export const MOD_GROUP_LABELS: Record<ModDestGroup | "all", string> = {
  all:    "All",
  camera: "Cam",
  scan:   "Scan",
  synth:  "Synth",
  matrix: "Mtx",
  viz:    "Viz",
};

/** Group ordering for the sub-tab picker. */
export const MOD_GROUPS: (ModDestGroup | "all")[] = ["all", "camera", "scan", "synth", "matrix", "viz"];
