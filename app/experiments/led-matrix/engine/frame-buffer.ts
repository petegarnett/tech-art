import type { GridMapping } from './types';

/**
 * Frame buffer for LED matrix — flat Uint8Array of [R,G,B,...].
 * Same format as NeoPixel/WS2812B strips.
 * This is the single source of truth for pixel data.
 */
export class FrameBuffer {
  readonly cols: number;
  readonly rows: number;
  readonly data: Uint8Array;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.data = new Uint8Array(cols * rows * 3);
  }

  /** Set pixel at grid position */
  setPixel(x: number, y: number, r: number, g: number, b: number): void {
    const i = (y * this.cols + x) * 3;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
  }

  /** Get pixel at grid position — returns [r, g, b] */
  getPixel(x: number, y: number): [number, number, number] {
    const i = (y * this.cols + x) * 3;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /** Get the strip index for a grid position (respects mapping) */
  getIndex(x: number, y: number, mapping: GridMapping): number {
    if (mapping === 'serpentine' && y % 2 === 1) {
      // Odd rows are right-to-left
      return y * this.cols + (this.cols - 1 - x);
    }
    return y * this.cols + x;
  }

  /** Clear all pixels to black */
  clear(): void {
    this.data.fill(0);
  }

  /** Fill all pixels with a colour */
  fill(r: number, g: number, b: number): void {
    for (let i = 0; i < this.data.length; i += 3) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
    }
  }

  /** Get total pixel count */
  get pixelCount(): number {
    return this.cols * this.rows;
  }

  /** Get buffer as hex string for protocol inspector */
  toHex(): string {
    const parts: string[] = [];
    for (let i = 0; i < this.data.length; i += 3) {
      const r = this.data[i].toString(16).padStart(2, '0');
      const g = this.data[i + 1].toString(16).padStart(2, '0');
      const b = this.data[i + 2].toString(16).padStart(2, '0');
      parts.push(r + g + b);
    }
    return parts.join(' ');
  }

  /** Resize — creates new buffer */
  static resize(cols: number, rows: number): FrameBuffer {
    return new FrameBuffer(cols, rows);
  }
}
