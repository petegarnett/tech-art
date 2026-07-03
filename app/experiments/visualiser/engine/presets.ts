/**
 * presets.ts — the three shader presets shipped with the Visualiser.
 *
 * Each entry:
 *   - id — matches the PresetId union
 *   - label / description — UI text
 *   - fragSource — the actual GLSL string (from shaders.ts)
 *   - params — the tuneable knobs exposed to the UI + mod matrix
 *
 * The params array is the SINGLE source of truth for "what uniforms can be
 * modulated on this preset". The routing matrix builds its destination
 * columns from PRESET_BY_ID[current].params.
 *
 * Defaults are tuned so switching to a preset with silent audio still
 * produces something looking-at-able (not black).
 */
import type { PresetDef, PresetParam } from "@/lib/gfx/types";
import type { PresetId } from "./types";
import { GLITCH_FRAG, PLASMA_FRAG, TUNNEL_FRAG } from "./shaders";

// Re-export the shared types so components that only import from here work.
export type { PresetDef, PresetParam };

export const PRESETS: PresetDef<PresetId>[] = [
  {
    id: "glitch",
    label: "Glitch",
    description: "Gaijin / HomeSick / Strangeloop — chromatic aberration, datamoshing, scanline tear. Camera-less: pure energy tint.",
    fragSource: GLITCH_FRAG,
    // Ported verbatim from Image Synth's GLITCH — same uniforms + defaults.
    // Notable: iCameraMix defaults to 0.0 here (not 1.0 like image-synth) —
    // the Visualiser has no camera, so mixing toward "camera" would just
    // show the grey placeholder pixel. 0.0 gives pure energy-tint mode.
    params: [
      { name: "iChromaticAberration", label: "Chroma",    default: 0.35 },
      { name: "iScanlineTear",        label: "Tear",      default: 0.50 },
      { name: "iBitCrush",            label: "Bit Crush", default: 0.20 },
      { name: "iNoiseDust",           label: "Dust",      default: 0.30 },
      { name: "iEdgeBoost",           label: "Edges",     default: 0.00 },
      { name: "iHueRotate",           label: "Hue Shift", default: 0.00 },
      { name: "iInvert",              label: "Invert",    default: 0.00 },
      { name: "iFreezeFrame",         label: "Freeze",    default: 0.50 },
      { name: "iZoom",                label: "Bass Zoom", default: 0.30 },
      { name: "iBlockShift",          label: "Datamosh",  default: 0.40 },
      { name: "iVignette",            label: "Vignette",  default: 0.30 },
      { name: "iCameraMix",           label: "Cam Mix",   default: 0.00 },
    ],
  },
  {
    id: "plasma",
    label: "Plasma",
    description: "MilkDrop-style flowing plasma — layered sine fields, palette rotation, symmetry.",
    fragSource: PLASMA_FRAG,
    // Defaults tuned so silent startup already looks alive (not black).
    params: [
      { name: "iScale",         label: "Scale",       default: 0.40 },
      { name: "iSpeed",         label: "Speed",       default: 0.30 },
      { name: "iComplexity",    label: "Complexity",  default: 0.50 },
      { name: "iBassZoom",      label: "Bass Zoom",   default: 0.50 },
      { name: "iTrebleDetail",  label: "Detail",      default: 0.40 },
      { name: "iColourCycle",   label: "Colour Cyc",  default: 0.30 },
      { name: "iSaturation",    label: "Saturation",  default: 0.70 },
      { name: "iBrightness",    label: "Brightness",  default: 0.60 },
      { name: "iVignette",      label: "Vignette",    default: 0.30 },
      { name: "iBeatFlash",     label: "Beat Flash",  default: 0.50 },
      { name: "iSymmetry",      label: "Symmetry",    default: 0.00 },
    ],
  },
  {
    id: "tunnel",
    label: "Tunnel",
    description: "Perspective corridor — bass drives depth speed, treble jitters the walls, beat punches forward.",
    fragSource: TUNNEL_FRAG,
    // All 12 knobs default around 0.5 per the brief's guidance: "all knobs
    // at 0.5 gives a sensible baseline".
    params: [
      { name: "iZoomSpeed",      label: "Speed",       default: 0.35 },
      { name: "iRotation",       label: "Rotation",    default: 0.50 },
      { name: "iTexture",        label: "Texture",     default: 0.30 },
      { name: "iSurfaceDistort", label: "Distort",     default: 0.30 },
      { name: "iColourHue",      label: "Hue",         default: 0.30 },
      { name: "iBassSpeed",      label: "Bass Speed",  default: 0.50 },
      { name: "iTrebleDistort",  label: "Treb Jitter", default: 0.50 },
      { name: "iGlow",           label: "Glow",        default: 0.50 },
      { name: "iVignette",       label: "Vignette",    default: 0.30 },
      { name: "iBeatFlash",      label: "Beat Flash",  default: 0.50 },
      { name: "iBrightness",     label: "Brightness",  default: 0.55 },
    ],
  },
];

export const PRESET_BY_ID: Record<PresetId, PresetDef<PresetId>> = Object.fromEntries(
  PRESETS.map((p) => [p.id, p]),
) as Record<PresetId, PresetDef<PresetId>>;

/** Build a default param value map for a single preset. */
export function defaultPresetParams(id: PresetId): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of PRESET_BY_ID[id].params) out[p.name] = p.default;
  return out;
}

/** Build defaults for ALL presets — used to initialise VizConfig.params. */
export function defaultAllPresetParams(): Record<PresetId, Record<string, number>> {
  const out = {} as Record<PresetId, Record<string, number>>;
  for (const p of PRESETS) out[p.id] = defaultPresetParams(p.id);
  return out;
}
