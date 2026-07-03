/**
 * types.ts — shared types for the Visualiser experiment.
 *
 * Layer split:
 *   - PresetId — the three shader presets we ship (GLITCH / PLASMA / TUNNEL).
 *   - ModSourceId — the 9 sources that can drive the modulation matrix
 *     (5 audio bands + 4 LFOs).
 *   - ModRouteKey — sparse routing key `${source}.${uniformName}`.
 *   - ModMatrix — sparse dict of route → -1..+1 send.
 *   - AudioSourceMode — 5 input modes for the AudioSourceEngine.
 *   - VizConfig — patch-serialisable state for a single preset.
 *
 * Nothing engine-y here — no engines are constructed. Kept flat and cheap so
 * both React state and the loop's ref cache can read from it.
 */

/* ─── Preset ids ─── */

export type PresetId = "glitch" | "plasma" | "tunnel";

/* ─── Audio source mode ─── */

/**
 * Five input modes. `silent` is a first-class mode — the user can VJ with
 * LFOs alone, no audio required.
 *
 * `system` / `tab` both use getDisplayMedia under the hood; the distinction
 * is UX (what we tell the user to click) not API.
 */
export type AudioSourceMode = "silent" | "system" | "tab" | "mic" | "file";

/** Metadata about the current stream — surfaced in the header status pill. */
export interface AudioStreamInfo {
  deviceLabel?: string;
  fileName?: string;
  duration?: number;
}

/* ─── Modulation matrix ─── */

/**
 * The 9 mod sources — fixed across all presets.
 *
 * Audio sources (5) come from the FFT analyser:
 *   - `bass`, `mid`, `treble` — smoothed band levels 0..1
 *   - `energy` — mean of the three
 *   - `beat` — 0 or 1 pulse
 *
 * LFO sources (4) come from the LFOBank:
 *   - `lfo1`..`lfo4` — the LFO's current output in its polarity range
 *     (unipolar 0..1 or bipolar -1..+1).
 */
export type ModSourceId =
  | "bass"
  | "mid"
  | "treble"
  | "energy"
  | "beat"
  | "lfo1"
  | "lfo2"
  | "lfo3"
  | "lfo4";

export const MOD_SOURCE_IDS: ModSourceId[] = [
  "bass", "mid", "treble", "energy", "beat",
  "lfo1", "lfo2", "lfo3", "lfo4",
];

/**
 * Human labels + a short (~4 char) label for the routing matrix header column.
 */
export const MOD_SOURCE_LABELS: Record<ModSourceId, { label: string; short: string }> = {
  bass:   { label: "Bass",   short: "BASS" },
  mid:    { label: "Mid",    short: "MID"  },
  treble: { label: "Treble", short: "TREB" },
  energy: { label: "Energy", short: "ENGY" },
  beat:   { label: "Beat",   short: "BEAT" },
  lfo1:   { label: "LFO 1",  short: "LFO1" },
  lfo2:   { label: "LFO 2",  short: "LFO2" },
  lfo3:   { label: "LFO 3",  short: "LFO3" },
  lfo4:   { label: "LFO 4",  short: "LFO4" },
};

/**
 * Per-source scale factor applied to the routed value before clamping.
 *
 * A note on the 0.5 scale from the brief: I picked slightly lower on
 * `beat` because a 0-or-1 pulse routed at full send would slam the
 * destination to +/-0.5 for a frame — too much. 0.35 gives a tasteful punch.
 * LFOs and audio bands stay at 0.5 as designed.
 */
export const MOD_SOURCE_SCALE: Record<ModSourceId, number> = {
  bass:   0.5,
  mid:    0.5,
  treble: 0.5,
  energy: 0.5,
  beat:   0.35,
  lfo1:   0.5,
  lfo2:   0.5,
  lfo3:   0.5,
  lfo4:   0.5,
};

/**
 * Sparse routing key: source id + "." + uniform name (e.g. "bass.iScale").
 * Uniforms are dynamic per preset, so we can't fully-type the string.
 */
export type ModRouteKey = `${ModSourceId}.${string}`;

/** Sparse dict: absent key = 0 send. Non-zero values are -1..+1. */
export type ModMatrix = Partial<Record<ModRouteKey, number>>;

/** Build a routing key from a source id and uniform name. */
export function modRouteKey(source: ModSourceId, uniform: string): ModRouteKey {
  return `${source}.${uniform}` as ModRouteKey;
}

/* ─── VJ mode ─── */

/**
 * Composition state — currently just an on/off flag hiding chrome, but
 * factored as a config so future features (crossfade between two presets,
 * A/B decks, etc.) can slot in.
 */
export interface VizConfig {
  presetId: PresetId;
  /** Per-preset uniform values, keyed by preset id then uniform name. */
  params: Record<PresetId, Record<string, number>>;
}
