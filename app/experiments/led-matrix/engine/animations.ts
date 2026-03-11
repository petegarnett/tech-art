import { noise2D } from '@/lib/math/noise';
import type { AnimationPreset, PixelFunction } from './types';

/* ─── HSL → RGB helper (inline for performance) ─── */

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h2 = h / 60;
  const x = c * (1 - Math.abs(h2 % 2 - 1));
  const m = l - c / 2;
  let r1: number, g1: number, b1: number;
  if (h2 < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (h2 < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (h2 < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (h2 < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (h2 < 5) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/* ─── Deterministic hash for pseudo-random per-pixel values ─── */

function hash(a: number, b: number): number {
  let h = (a * 2654435761) ^ (b * 2246822519);
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = ((h >>> 16) ^ h) * 0x45d9f3b;
  h = (h >>> 16) ^ h;
  return (h & 0x7fffffff) / 0x7fffffff; // 0-1
}

/* ─── 1. Rainbow Wave ─── */

const rainbowWave: PixelFunction = (x, y, t) => {
  const hue = (x + y + t * 2) * 10 % 360;
  return hslToRgb(hue, 1, 0.5);
};

/* ─── 2. Plasma ─── */

const plasma: PixelFunction = (x, y, t) => {
  const v =
    Math.sin(x * 0.3 + t) +
    Math.sin(y * 0.3 + t * 1.3) +
    Math.sin((x + y) * 0.2 + t * 0.7) +
    Math.sin(Math.sqrt(x * x + y * y) * 0.3 - t);
  const hue = v * 60 + t * 30;
  return hslToRgb(hue, 0.8, 0.5);
};

/* ─── 3. Game of Life ─── */

let golGrid: Uint8Array | null = null;
let golCols = 0;
let golRows = 0;
let golLastStep = -1;

function golSeed(cols: number, rows: number): void {
  golCols = cols;
  golRows = rows;
  golGrid = new Uint8Array(cols * rows);
  for (let i = 0; i < golGrid.length; i++) {
    golGrid[i] = Math.random() < 0.3 ? 1 : 0;
  }
  golLastStep = -1;
}

function golStep(): void {
  if (!golGrid) return;
  const next = new Uint8Array(golCols * golRows);
  for (let y = 0; y < golRows; y++) {
    for (let x = 0; x < golCols; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + golCols) % golCols;
          const ny = (y + dy + golRows) % golRows;
          neighbors += golGrid[ny * golCols + nx];
        }
      }
      const alive = golGrid[y * golCols + x];
      if (alive) {
        next[y * golCols + x] = neighbors === 2 || neighbors === 3 ? 1 : 0;
      } else {
        next[y * golCols + x] = neighbors === 3 ? 1 : 0;
      }
    }
  }
  golGrid = next;
}

const gameOfLife: PixelFunction = (x, y, t, cols, rows) => {
  // Re-seed if grid size changed
  if (cols !== golCols || rows !== golRows || !golGrid) {
    golSeed(cols, rows);
  }

  // Advance generation on integer steps of t
  const step = Math.floor(t);
  if (step > golLastStep) {
    const stepsToAdvance = Math.min(step - golLastStep, 5); // cap catch-up
    for (let i = 0; i < stepsToAdvance; i++) {
      golStep();
    }
    golLastStep = step;
  }

  if (!golGrid) return [0, 0, 0];
  const alive = golGrid[y * cols + x];
  return alive ? [0, 255, 0] : [0, 0, 0];
};

/* ─── 4. Matrix Rain ─── */

const matrixRain: PixelFunction = (x, y, t, cols, rows) => {
  // Each column has a deterministic "drop" speed and offset
  const colSeed = hash(x, 0);
  const speed = 0.5 + colSeed * 1.5;
  const offset = hash(x, 1) * rows;

  const dropY = (t * speed * 4 + offset) % (rows + 8);
  const dist = dropY - y;

  if (dist < 0 || dist > 8) return [0, 0, 0];

  // Head of the drop is bright, trail fades
  if (dist < 1) {
    return [180, 255, 180]; // bright white-green head
  }
  const fade = 1 - dist / 8;
  const g = Math.round(255 * fade * fade);
  return [0, g, 0];
};

/* ─── 5. Pulse ─── */

const pulse: PixelFunction = (_x, _y, t) => {
  const b = Math.sin(t * 2) * 0.5 + 0.5;
  // Warm white
  return [
    Math.round(255 * b),
    Math.round(200 * b),
    Math.round(140 * b),
  ];
};

/* ─── 6. Perlin Flow ─── */

const perlinFlow: PixelFunction = (x, y, t) => {
  const scale = 0.08;
  const n = noise2D(x * scale + t * 0.3, y * scale + t * 0.2);
  const hue = (n + 1) * 180 + t * 20; // map [-1,1] to hue range
  const lightness = 0.3 + (n + 1) * 0.2;
  return hslToRgb(hue, 0.85, lightness);
};

/* ─── 7. Starfield ─── */

const starfield: PixelFunction = (x, y, t) => {
  const starSeed = hash(x, y);
  // Only ~20% of pixels are stars
  if (starSeed > 0.2) return [0, 0, 0];

  const freq = 0.5 + hash(x + 100, y + 100) * 3;
  const phase = hash(x + 200, y + 200) * Math.PI * 2;
  const brightness = Math.sin(t * freq + phase) * 0.5 + 0.5;
  const warmth = hash(x + 300, y + 300);

  // Slight colour variation — warm to cool white
  const r = Math.round(255 * brightness);
  const g = Math.round((230 + warmth * 25) * brightness);
  const b = Math.round((200 + warmth * 55) * brightness);
  return [r, g, b];
};

/* ─── 8. Color Wipe ─── */

const colorWipe: PixelFunction = (x, _y, t, cols) => {
  // Cycle through colours
  const colors: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [0, 255, 255],
    [255, 0, 255],
  ];

  const cycleDuration = 2; // seconds per wipe
  const totalCycles = colors.length * 2; // forward + backward for each
  const cycleTime = t % (cycleDuration * totalCycles);
  const cycleIndex = Math.floor(cycleTime / cycleDuration);
  const progress = (cycleTime % cycleDuration) / cycleDuration;

  const colorIdx = Math.floor(cycleIndex / 2) % colors.length;
  const isReverse = cycleIndex % 2 === 1;

  const wipePos = isReverse ? (1 - progress) * cols : progress * cols;
  const isLit = isReverse ? x >= wipePos : x < wipePos;

  if (isLit) {
    return colors[colorIdx];
  }
  return [0, 0, 0];
};

/* ─── Export all presets ─── */

export const ANIMATION_PRESETS: AnimationPreset[] = [
  {
    name: 'Rainbow Wave',
    id: 'rainbow-wave',
    fn: rainbowWave,
    description: 'HSL rainbow sweeping diagonally across the grid',
  },
  {
    name: 'Plasma',
    id: 'plasma',
    fn: plasma,
    description: 'Classic demoscene plasma effect using layered sine waves',
  },
  {
    name: 'Game of Life',
    id: 'game-of-life',
    fn: gameOfLife,
    description: "Conway's Game of Life — cellular automaton with wrap-around edges",
  },
  {
    name: 'Matrix Rain',
    id: 'matrix-rain',
    fn: matrixRain,
    description: 'Falling green drops with fading trails',
  },
  {
    name: 'Pulse',
    id: 'pulse',
    fn: pulse,
    description: 'All LEDs breathe in warm white',
  },
  {
    name: 'Perlin Flow',
    id: 'perlin-flow',
    fn: perlinFlow,
    description: 'Flowing colour field driven by simplex noise',
  },
  {
    name: 'Starfield',
    id: 'starfield',
    fn: starfield,
    description: 'Twinkling stars with subtle colour variation',
  },
  {
    name: 'Color Wipe',
    id: 'color-wipe',
    fn: colorWipe,
    description: 'Solid colours sweep across the grid — classic LED test pattern',
  },
];
