/** Clamp a value between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Remap a value from one range to another. */
export function map(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Linear interpolation between two scalar values. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth ease-in-out (sine-based). */
export function easeInOut(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

/** Quadratic ease-in. */
export function easeInQuad(t: number): number {
  return t * t;
}

/** Quadratic ease-out. */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Cubic ease-in-out. */
export function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
