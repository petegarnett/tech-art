/**
 * presets.ts — data-driven config for visualiser presets.
 *
 * Each preset describes:
 *   - id, label, description (UI)
 *   - fragment shader source
 *   - param list (uniform name, label, default 0-1)
 *
 * Adding a new preset = one entry here + one .frag (and matching string in
 * shaders.ts). The UI iterates this list to render the knob grid.
 */
import type { PresetId } from "./types";
import { GLITCH_FRAG, FLOW_FRAG, MUTATE_FRAG } from "./shaders";

export interface PresetParam {
  name: string;        // uniform name, e.g. iChromaticAberration
  label: string;       // UI label, e.g. "Chroma"
  default: number;     // 0-1
}

export interface PresetDef {
  id: PresetId;
  label: string;
  description: string;
  fragSource: string;
  params: PresetParam[];
}

export const PRESETS: PresetDef[] = [
  {
    id: "glitch",
    label: "Glitch",
    description: "Gaijin / HomeSick / Strangeloop — chromatic aberration, datamoshing, scanline tear.",
    fragSource: GLITCH_FRAG,
    params: [
      { name: "iChromaticAberration", label: "Chroma",     default: 0.30 },
      { name: "iScanlineTear",        label: "Tear",       default: 0.50 },
      { name: "iBitCrush",            label: "Bit Crush",  default: 0.20 },
      { name: "iNoiseDust",           label: "Dust",       default: 0.30 },
      { name: "iEdgeBoost",           label: "Edges",      default: 0.40 },
      { name: "iHueRotate",           label: "Hue Shift",  default: 0.00 },
      { name: "iInvert",              label: "Invert",     default: 0.00 },
      { name: "iFreezeFrame",         label: "Freeze",     default: 0.50 },
      { name: "iZoom",                label: "Bass Zoom",  default: 0.00 },
      { name: "iBlockShift",          label: "Datamosh",   default: 0.40 },
      { name: "iVignette",            label: "Vignette",   default: 0.30 },
      { name: "iCameraMix",           label: "Cam Mix",    default: 1.00 },
    ],
  },
  {
    id: "flow",
    label: "Flow",
    description: "[Stub] Jin Lee inspired — fog particles, laminar flows. TODO.",
    fragSource: FLOW_FRAG,
    params: Array.from({ length: 12 }, (_, i) => ({
      name: `iFlowParam${i}`,
      label: `Param ${i + 1}`,
      default: 0.5,
    })),
  },
  {
    id: "mutate",
    label: "Mutate",
    description: "[Stub] Lisa Meinesz inspired — metallic SDF blob. TODO.",
    fragSource: MUTATE_FRAG,
    params: Array.from({ length: 12 }, (_, i) => ({
      name: `iMutateParam${i}`,
      label: `Param ${i + 1}`,
      default: 0.5,
    })),
  },
];

export const PRESET_BY_ID: Record<PresetId, PresetDef> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
) as Record<PresetId, PresetDef>;

/** Build a default param value map for a preset. */
export function defaultPresetParams(id: PresetId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PRESET_BY_ID[id].params) out[p.name] = p.default;
  return out;
}

/** Build defaults for ALL presets — used to initialise VizConfig.params. */
export function defaultAllPresetParams(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const p of PRESETS) {
    out[p.id] = defaultPresetParams(p.id);
  }
  return out;
}
