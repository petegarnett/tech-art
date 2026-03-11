import type { PixelFunction } from './types';

/**
 * Compile a user-provided code string into a PixelFunction.
 * The code should be the body of a function that receives (x, y, t, cols, rows, frame)
 * and returns [r, g, b].
 *
 * Returns { fn, error } — if error is set, fn is null.
 */
export function compilePixelFunction(code: string): {
  fn: PixelFunction | null;
  error: string | null;
} {
  try {
    // eslint-disable-next-line no-new-func
    const rawFn = new Function('x', 'y', 't', 'cols', 'rows', 'frame', code) as PixelFunction;

    // Wrap in a safe executor that catches runtime errors per-pixel
    const safeFn: PixelFunction = (x, y, t, cols, rows, frame) => {
      try {
        const result = rawFn(x, y, t, cols, rows, frame);
        if (
          Array.isArray(result) &&
          result.length >= 3 &&
          typeof result[0] === 'number' &&
          typeof result[1] === 'number' &&
          typeof result[2] === 'number'
        ) {
          return result as [number, number, number];
        }
        return [0, 0, 0];
      } catch {
        return [0, 0, 0];
      }
    };

    // Test compilation with a quick call
    safeFn(0, 0, 0, 16, 16, 0);

    return { fn: safeFn, error: null };
  } catch (e) {
    return {
      fn: null,
      error: e instanceof Error ? e.message : 'Unknown compilation error',
    };
  }
}
