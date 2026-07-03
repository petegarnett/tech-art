/**
 * lib/gfx/types.ts — types shared between shader-based visualiser experiments.
 */

/** One tuneable knob for a shader preset. Uniform name + display metadata. */
export interface PresetParam {
  /** Uniform name in the fragment shader (e.g. "iChromaticAberration"). */
  name: string;
  /** Human-readable label for the UI. */
  label: string;
  /** Default value in 0-1 range. */
  default: number;
}

/** A single shader preset — id + shader source + tuneable knobs. */
export interface PresetDef<Id extends string = string> {
  id: Id;
  label: string;
  description: string;
  /** Fragment shader source (WebGL2 / GLSL ES 3.00). */
  fragSource: string;
  /** Knobs exposed to the UI. */
  params: PresetParam[];
}
