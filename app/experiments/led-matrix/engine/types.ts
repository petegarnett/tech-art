export type PixelFunction = (
  x: number,
  y: number,
  t: number,
  cols: number,
  rows: number,
  frameCount: number,
) => [number, number, number]; // [R, G, B] each 0-255

export type GridMapping = 'ltr' | 'serpentine';

export type PixelShape = 'circle' | 'square';

export interface GridConfig {
  cols: number;
  rows: number;
  mapping: GridMapping;
}

export interface AppearanceConfig {
  pixelShape: PixelShape;
  gap: number;
  bloom: boolean;
  bgColor: string;
  brightness: number;
}

export interface AnimationPreset {
  name: string;
  id: string;
  fn: PixelFunction;
  description: string;
}

export interface LEDMatrixState {
  grid: GridConfig;
  appearance: AppearanceConfig;
  activePreset: string | null;
  customCode: string;
  speed: number;
  paused: boolean;
}
