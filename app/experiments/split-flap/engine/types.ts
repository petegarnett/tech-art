export interface BoardCell {
  char: string;
  flapBg?: string;    // override theme flapBg for this cell
  flapText?: string;  // override theme flapText for this cell
}

export type SceneId = 'message' | 'datetime' | 'weather' | 'news' | 'stocks';

export interface SceneConfig {
  enabled: SceneId[];        // which scenes are active
  rotationInterval: number;  // seconds between scene changes, default 15
  autoRotate: boolean;       // whether to auto-rotate
}

export type ColorTheme = 'classic' | 'vestaboard' | 'custom';

export interface ThemeConfig {
  theme: ColorTheme;
  flapBg: string;       // flap background colour
  flapText: string;     // text colour
  boardBg: string;      // board background
  flapBorder: string;   // gap/border between flap halves
}

export interface BoardConfig {
  rows: number;          // default 6
  cols: number;          // default 22
  flipDuration: number;  // ms per character flip, default 100
  cascadeDelay: number;  // ms between each character starting, default 30
  showClock: boolean;    // default true
  clockPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  sound: boolean;        // click sound on flip
}

export const THEMES: Record<ColorTheme, ThemeConfig> = {
  classic: {
    theme: 'classic',
    flapBg: '#1a1a1a',
    flapText: '#f5e6c8',    // warm cream/yellow
    boardBg: '#0a0a0a',
    flapBorder: '#111111',
  },
  vestaboard: {
    theme: 'vestaboard',
    flapBg: '#1c1c1e',
    flapText: '#ffffff',
    boardBg: '#000000',
    flapBorder: '#0c0c0c',
  },
  custom: {
    theme: 'custom',
    flapBg: '#1a1a1a',
    flapText: '#00ff00',
    boardBg: '#0a0a0a',
    flapBorder: '#111111',
  },
};
