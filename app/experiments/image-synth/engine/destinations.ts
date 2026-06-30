/**
 * destinations.ts — data-driven config for the routing matrix.
 *
 * Each destination describes:
 *   - id, label, description (UI)
 *   - default depth
 *   - scale + base (how to convert depth*grey → physical target)
 *   - ramp time constant (Tone.js rampTo)
 *   - formatter for the live "modulated value" readout
 *   - mapGrey(depth, grey) → target value
 *
 * Adding a new destination = adding one entry here + a handler in SynthEngine.
 */
import type { DestinationId } from "./types";

export interface DestinationDef {
  id: DestinationId;
  label: string;
  description: string;
  defaultDepth: number;
  rampSec: number;
  /** Pure mapping from depth (0-1 user) + grey (0-1 frame) → target value. */
  mapGrey: (depth: number, grey: number) => number;
  /** Format the target for display. */
  format: (value: number) => string;
}

export const DESTINATIONS: DestinationDef[] = [
  {
    id: "volume",
    label: "Volume",
    description: "Per-voice gain (the classic behaviour).",
    defaultDepth: 1.0,
    rampSec: 0.0, // uses synth attack/release instead — handled specially
    mapGrey: (d, g) => d * g,
    format: (v) => v.toFixed(3),
  },
  {
    id: "filterCutoff",
    label: "Filter Cutoff",
    description: "Lowpass cutoff. At depth 0 the filter is fully open (transparent); raising depth lets dark pixels close it down to ~200Hz.",
    defaultDepth: 0.0,
    rampSec: 0.02,
    // Filter stays fully open (16kHz) when depth = 0, regardless of grey
    // value — keeps v1 parity. Depth > 0 lets the grey value close it down:
    // dark pixel (g=0) at full depth → 200Hz, bright pixel (g=1) → always 16kHz.
    mapGrey: (d, g) => 16000 - d * (1 - g) * 15800,
    format: (v) => `${Math.round(v)} Hz`,
  },
  {
    id: "resonance",
    label: "Resonance",
    description: "Filter Q. Bright pixels open up the resonance peak.",
    defaultDepth: 0.0,
    rampSec: 0.05,
    mapGrey: (d, g) => 1 + d * g * 10,
    format: (v) => v.toFixed(2),
  },
  {
    id: "reverbSend",
    label: "Reverb Send",
    description: "Per-voice send to the shared reverb bus.",
    defaultDepth: 0.0,
    rampSec: 0.05,
    mapGrey: (d, g) => d * g,
    format: (v) => v.toFixed(3),
  },
  {
    id: "delaySend",
    label: "Delay Send",
    description: "Per-voice send to the shared delay bus.",
    defaultDepth: 0.0,
    rampSec: 0.05,
    mapGrey: (d, g) => d * g,
    format: (v) => v.toFixed(3),
  },
  {
    id: "pan",
    label: "Pan",
    description: "Bright = right (+1), dark = left (-1). Depth scales magnitude.",
    defaultDepth: 0.0,
    rampSec: 0.05,
    mapGrey: (d, g) => d * (g * 2 - 1),
    format: (v) => v.toFixed(2),
  },
  {
    id: "detune",
    label: "Detune",
    description: "Pitch wobble in cents. Bright = sharp, dark = flat.",
    defaultDepth: 0.0,
    rampSec: 0.03,
    mapGrey: (d, g) => d * (g * 2 - 1) * 50,
    format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}¢`,
  },
  {
    id: "waveformMorph",
    label: "Wave Morph",
    description: "Crossfade between primary and secondary oscillator waveforms.",
    defaultDepth: 0.0,
    rampSec: 0.03,
    mapGrey: (d, g) => d * g,
    format: (v) => v.toFixed(3),
  },
  {
    id: "octaveShift",
    label: "Octave Shift",
    description: "Bright pixels above 0.5 → voice plays +1 octave (digital).",
    defaultDepth: 0.0,
    rampSec: 0.0, // instant via setValueAtTime
    mapGrey: (d, g) => d * (g > 0.5 ? 1 : 0),
    format: (v) => (v >= 0.5 ? "+1 oct" : "0"),
  },
];

/** Look up by id — used in the UI loop. */
export const DESTINATION_BY_ID: Record<DestinationId, DestinationDef> = Object.fromEntries(
  DESTINATIONS.map((d) => [d.id, d]),
) as Record<DestinationId, DestinationDef>;
