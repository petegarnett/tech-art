/**
 * Colour helpers for the wireframe terrain renderer.
 *
 * - hexToRgb / rgbToHex: hex string ↔ [r,g,b] tuples
 * - lerpColor: linear interpolation between two RGB colours
 * - shiftHue: rotate an RGB colour around the hue wheel (RGB→HSL→shift→RGB)
 * - GRADIENT_PRESETS: the named palettes used in the COLOUR tab
 */

import { clamp, lerp } from "@/lib/math/utils";

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/* ─── HSL conversion ─── */

/** RGB (0-255) → HSL (h: 0-360, s/l: 0-1). Standard algorithm. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return [h, s, l];
}

/** HSL (h: 0-360, s/l: 0-1) → RGB (0-255). */
function hslToRgb(h: number, s: number, l: number): RGB {
  // Normalise hue to [0, 360)
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

/** Shift hue of an RGB colour by `degrees`. Goes RGB→HSL→shift→RGB. */
export function shiftHue(rgb: RGB, degrees: number): RGB {
  // Degree shift of 0 is a no-op — short-circuit so the static look is bit-identical.
  if (degrees === 0) return rgb;
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  return hslToRgb(h + degrees, s, l);
}

/* ─── Gradient presets ─── */

export interface GradientPreset {
  name: string;
  colorA: string;
  colorB: string;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  { name: "Classic Green", colorA: "#003300", colorB: "#00ff00" },
  { name: "Synthwave", colorA: "#ff00ff", colorB: "#00ffff" },
  { name: "Fire", colorA: "#ff0000", colorB: "#ffff00" },
  { name: "Ocean", colorA: "#000066", colorB: "#00ffff" },
  { name: "Amber", colorA: "#331a00", colorB: "#ffaa00" },
  { name: "Monochrome", colorA: "#333333", colorB: "#ffffff" },
];
