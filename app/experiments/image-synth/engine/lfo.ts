/**
 * lfo.ts — the LFO bank that drives the modulation matrix.
 *
 * Owns four independent LFOs. Each has:
 *   - shape (sine / triangle / saw / square / sampleHold / noise)
 *   - rate (free Hz, or tempo-synced ratio of BPM)
 *   - phase (0..1 starting offset)
 *   - amp (0..1 master depth)
 *   - polarity (bipolar -1..+1 or unipolar 0..1)
 *   - smooth (only meaningful for sampleHold / noise — glide between steps)
 *
 * `update(timeSec, bpm)` is called once per animation frame. It advances each
 * LFO's internal phase by `dt * rateHz`, evaluates the shape, applies
 * polarity and amp, and stores the result in a Float32Array readable via
 * `getValue(i)`.
 *
 * The phase accumulator is continuous — changing shape mid-flight is
 * seamless. The phase wraps in [0, 1).
 *
 * Performance: 4 LFOs × ~10 ops each = trivial. No allocations per frame.
 */

export type LFOShape =
  | "sine"
  | "triangle"
  | "saw"
  | "square"
  | "sampleHold"
  | "noise";

export type SyncRate =
  | "32n"
  | "16n"
  | "8n"
  | "4n"
  | "2n"
  | "1n"
  | "2m"
  | "4m"
  | "8m";

export interface LFOConfig {
  shape: LFOShape;
  rateHz: number;             // 0.01 - 30 Hz (used when rateSync is null)
  rateSync: SyncRate | null;  // when set, overrides rateHz with tempo-synced rate
  phase: number;              // 0-1 starting phase offset
  amp: number;                // 0-1, master depth
  unipolar: boolean;          // true → output in [0,1], false → [-1,+1]
  smooth: number;             // 0-1, only affects sampleHold/noise
}

/** Number of beats per LFO cycle for each sync rate. */
const BEATS_PER_CYCLE: Record<SyncRate, number> = {
  "32n": 1 / 8,   // 1/32 note — 8 cycles per beat
  "16n": 1 / 4,
  "8n":  1 / 2,
  "4n":  1,        // one cycle per beat
  "2n":  2,
  "1n":  4,        // one cycle per bar (4 beats)
  "2m":  8,
  "4m":  16,
  "8m":  32,
};

export const SYNC_RATES: SyncRate[] = [
  "32n", "16n", "8n", "4n", "2n", "1n", "2m", "4m", "8m",
];

export const SYNC_LABELS: Record<SyncRate, string> = {
  "32n": "1/32",
  "16n": "1/16",
  "8n":  "1/8",
  "4n":  "1/4",
  "2n":  "1/2",
  "1n":  "1 bar",
  "2m":  "2 bars",
  "4m":  "4 bars",
  "8m":  "8 bars",
};

/** Default LFO config — neutral, bipolar, free-running at 1 Hz. */
export const DEFAULT_LFO_CONFIG: LFOConfig = {
  shape: "sine",
  rateHz: 1.0,
  rateSync: null,
  phase: 0,
  amp: 1.0,
  unipolar: false,
  smooth: 0.5,
};

/**
 * Convert a (bpm, syncRate) pair to Hz.
 * Sanity: 120 BPM + 4n = 120/60 = 2 Hz. ✓
 *         120 BPM + 1n = 120/(60*4) = 0.5 Hz. ✓
 */
export function syncToHz(bpm: number, sync: SyncRate): number {
  return bpm / (60 * BEATS_PER_CYCLE[sync]);
}

/**
 * Tiny deterministic PRNG — used for sampleHold so the value is stable for
 * the lifetime of a cycle. Hashing the cycle index gives a per-cycle random
 * value that doesn't drift frame-to-frame.
 */
function hashRandom(seed: number): number {
  let x = (seed | 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return ((x >>> 0) / 0xffffffff) * 2 - 1; // -1..+1
}

interface LFOInternalState {
  /** Continuously-accumulating phase, modulo 1. */
  phaseAccum: number;
  /** Last frame's rate Hz — used so we can detect a shape change cleanly. */
  lastRateHz: number;
  /** Internal smoothed value (for sampleHold glide + noise random walk). */
  smoothedValue: number;
  /** Last cycle index seen (for sampleHold step detection). */
  lastCycleIdx: number;
  /** Random walk current value (noise). */
  noiseValue: number;
  /** Target noise sample (random walk target). */
  noiseTarget: number;
}

export class LFOBank {
  /** Number of LFOs in the bank. */
  static readonly COUNT = 4;

  /** Live values, one per LFO, in the final output range (post amp). */
  private values = new Float32Array(LFOBank.COUNT);

  /** Per-LFO internal state — phase accumulator etc. */
  private states: LFOInternalState[] = [];

  /** Per-LFO config (mirrored from outside). */
  private configs: LFOConfig[] = [];

  /** Global bypass — when true, all values return 0. */
  bypass = false;

  /** Wall-clock time of the last update (s). `-1` = never updated. */
  private lastTime = -1;

  constructor() {
    for (let i = 0; i < LFOBank.COUNT; i++) {
      this.configs.push({ ...DEFAULT_LFO_CONFIG });
      this.states.push({
        phaseAccum: 0,
        lastRateHz: 1,
        smoothedValue: 0,
        lastCycleIdx: -1,
        noiseValue: 0,
        noiseTarget: 0,
      });
    }
  }

  /** Replace all configs (e.g. on patch load). */
  setConfigs(configs: LFOConfig[]): void {
    for (let i = 0; i < LFOBank.COUNT; i++) {
      this.configs[i] = { ...DEFAULT_LFO_CONFIG, ...configs[i] };
    }
  }

  /** Replace one config. */
  setConfig(i: number, config: LFOConfig): void {
    if (i < 0 || i >= LFOBank.COUNT) return;
    this.configs[i] = { ...config };
  }

  /** Read the current output value of LFO i. */
  getValue(i: number): number {
    if (this.bypass) return 0;
    return this.values[i] ?? 0;
  }

  /** All live values (Float32Array, length 4) — read-only by convention. */
  getValues(): Float32Array {
    return this.values;
  }

  /** Read a config (returns the internal object — don't mutate). */
  getConfig(i: number): LFOConfig {
    return this.configs[i];
  }

  /**
   * Advance every LFO. `timeSec` is monotonically increasing seconds (e.g.
   * `performance.now() / 1000`). `bpm` is used by sync-rate LFOs.
   */
  update(timeSec: number, bpm: number): void {
    if (this.lastTime < 0) this.lastTime = timeSec;
    const dt = Math.max(0, Math.min(1, timeSec - this.lastTime));
    this.lastTime = timeSec;

    for (let i = 0; i < LFOBank.COUNT; i++) {
      const cfg = this.configs[i];
      const st = this.states[i];

      // Resolve rate in Hz — sync overrides free Hz.
      const rateHz = cfg.rateSync != null
        ? syncToHz(bpm, cfg.rateSync)
        : Math.max(0.001, cfg.rateHz);
      st.lastRateHz = rateHz;

      // Advance phase. Phase is in [0, 1).
      st.phaseAccum += dt * rateHz;
      if (st.phaseAccum >= 1) st.phaseAccum -= Math.floor(st.phaseAccum);
      // Effective phase including starting offset.
      let phase = st.phaseAccum + cfg.phase;
      phase -= Math.floor(phase);

      // Evaluate shape → raw in -1..+1.
      let raw = evaluateShape(cfg.shape, phase, st, rateHz, dt, timeSec, cfg.smooth);

      // Polarity.
      if (cfg.unipolar) raw = (raw + 1) * 0.5; // 0..1

      // Amp.
      this.values[i] = raw * cfg.amp;
    }
  }
}

/** Pure shape evaluation. `state` is mutated for stateful shapes. */
function evaluateShape(
  shape: LFOShape,
  phase: number,
  state: LFOInternalState,
  rateHz: number,
  dt: number,
  timeSec: number,
  smooth: number,
): number {
  switch (shape) {
    case "sine":
      return Math.sin(phase * Math.PI * 2);
    case "triangle":
      // Peak +1 at phase 0.5, troughs at 0 / 1.
      return Math.abs((phase * 2) % 2 - 1) * 2 - 1;
    case "saw":
      // Ramps up from -1 to +1 over one cycle, then drops.
      return phase * 2 - 1;
    case "square":
      return phase < 0.5 ? 1 : -1;
    case "sampleHold": {
      // One stable random per cycle. Use cycle index as PRNG seed.
      const cycleIdx = Math.floor(timeSec * rateHz);
      if (cycleIdx !== state.lastCycleIdx) {
        state.lastCycleIdx = cycleIdx;
        state.noiseTarget = hashRandom(cycleIdx * 2654435761);
      }
      // Smooth glides smoothedValue toward target. smooth = 0 → snap;
      // smooth = 1 → very slow glide (~rateHz-bound time constant).
      const glide = 1 - smooth;
      const stepAlpha = Math.min(1, glide * 30 * dt + (smooth < 0.001 ? 1 : 0));
      state.smoothedValue += (state.noiseTarget - state.smoothedValue) * stepAlpha;
      return state.smoothedValue;
    }
    case "noise": {
      // Smoothed random walk — picks new random target each cycle, glides.
      const cycleIdx = Math.floor(timeSec * rateHz * 4);
      if (cycleIdx !== state.lastCycleIdx) {
        state.lastCycleIdx = cycleIdx;
        state.noiseTarget = Math.random() * 2 - 1;
      }
      // Smoother glide than S&H — smooth = 1 → very slow.
      const glide = Math.max(0.001, 1 - smooth);
      const stepAlpha = Math.min(1, glide * 8 * dt);
      state.noiseValue += (state.noiseTarget - state.noiseValue) * stepAlpha;
      return Math.max(-1, Math.min(1, state.noiseValue));
    }
    default:
      return 0;
  }
}

/**
 * Helper used by UI mini-waveform previews. Evaluates the shape at a series
 * of phase positions in [0, 1] — no state dependency, returns a fresh array.
 *
 * `width` samples across one full cycle. For sampleHold / noise the preview
 * uses a deterministic seed so it's stable across renders.
 */
export function previewWaveform(
  shape: LFOShape,
  width: number,
  seed = 1,
): Float32Array {
  const out = new Float32Array(width);
  switch (shape) {
    case "sine":
      for (let i = 0; i < width; i++) out[i] = Math.sin((i / width) * Math.PI * 2);
      break;
    case "triangle":
      for (let i = 0; i < width; i++) {
        const p = i / width;
        out[i] = Math.abs((p * 2) % 2 - 1) * 2 - 1;
      }
      break;
    case "saw":
      for (let i = 0; i < width; i++) out[i] = (i / width) * 2 - 1;
      break;
    case "square":
      for (let i = 0; i < width; i++) out[i] = i / width < 0.5 ? 1 : -1;
      break;
    case "sampleHold": {
      // 8 steps across the cycle, each a fresh random.
      const steps = 8;
      for (let i = 0; i < width; i++) {
        const step = Math.floor((i / width) * steps);
        out[i] = hashRandom(seed * 1000 + step);
      }
      break;
    }
    case "noise": {
      // A small random walk.
      let v = 0;
      for (let i = 0; i < width; i++) {
        const target = hashRandom(seed * 7919 + i);
        v += (target - v) * 0.15;
        out[i] = Math.max(-1, Math.min(1, v));
      }
      break;
    }
  }
  return out;
}
