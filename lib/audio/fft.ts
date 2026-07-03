/**
 * FFTAnalyser — wraps Tone.Analyser ("fft") and splits the spectrum into
 * three MilkDrop-style bands (bass / mid / treble), with attack/release
 * smoothing per band and a beat flag derived from bass against a 1-second
 * rolling average.
 *
 * Use:
 *   const a = new FFTAnalyser();
 *   a.connectFrom(synthEngine.analyserSource);
 *   // each frame:
 *   const { bass, mid, treble, energy, beat } = a.read();
 */
import * as Tone from "tone";

const BANDS = {
  bass:   { lo: 0,    hi: 400 },
  mid:    { lo: 400,  hi: 4000 },
  treble: { lo: 4000, hi: 22050 },
} as const;

// Smoothing time constants (seconds).
const ATTACK_SEC = 0.010;
const RELEASE_SEC = 0.200;

// Beat detection (MilkDrop heuristic).
const BEAT_HISTORY_SEC = 1.0;
const BEAT_THRESHOLD_MULT = 1.5;
const BEAT_REFRACTORY_SEC = 0.12; // ignore retriggers within this window

export interface FFTReading {
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beat: boolean;
}

export class FFTAnalyser {
  private analyser: Tone.Analyser;
  private fftSize = 512;
  private sampleRate: number;
  // Smoothed band levels
  private bassSm = 0;
  private midSm = 0;
  private trebleSm = 0;
  // Beat detection state
  private beatHistory: number[] = [];
  private lastBeatTime = -Infinity;
  // Last read result, reused so callers don't have to allocate.
  private result: FFTReading = { bass: 0, mid: 0, treble: 0, energy: 0, beat: false };
  private prevTime = -1;

  constructor() {
    this.analyser = new Tone.Analyser("fft", this.fftSize);
    this.sampleRate = Tone.getContext().sampleRate;
  }

  /** Tap an audio node into the analyser (typically the master bus). */
  connectFrom(node: Tone.ToneAudioNode | null): void {
    if (!node) return;
    node.connect(this.analyser);
  }

  /** Disconnect — call before disposing the source. */
  disconnect(): void {
    try { this.analyser.disconnect(); } catch { /* not connected */ }
  }

  /** Read current bands. Call once per frame. */
  read(): FFTReading {
    const fft = this.analyser.getValue() as Float32Array; // dB values, length = fftSize/2
    const binCount = fft.length;
    const binHz = this.sampleRate / 2 / binCount;

    const now = Tone.now();
    const dt = this.prevTime < 0 ? 1 / 60 : Math.max(0.001, now - this.prevTime);
    this.prevTime = now;

    // Raw 0-1 magnitudes for each band (linear mapping from -100..0 dB).
    const rawBass = this.bandAverage(fft, binHz, BANDS.bass.lo, BANDS.bass.hi);
    const rawMid = this.bandAverage(fft, binHz, BANDS.mid.lo, BANDS.mid.hi);
    const rawTreble = this.bandAverage(fft, binHz, BANDS.treble.lo, BANDS.treble.hi);

    this.bassSm = smooth(this.bassSm, rawBass, dt);
    this.midSm = smooth(this.midSm, rawMid, dt);
    this.trebleSm = smooth(this.trebleSm, rawTreble, dt);

    // Beat detection — push raw bass into the history, average over ~1s,
    // fire on threshold cross.
    const historyMax = Math.max(2, Math.round(BEAT_HISTORY_SEC / dt));
    this.beatHistory.push(rawBass);
    while (this.beatHistory.length > historyMax) this.beatHistory.shift();
    let beat = false;
    if (this.beatHistory.length > 4) {
      let avg = 0;
      for (const x of this.beatHistory) avg += x;
      avg /= this.beatHistory.length;
      if (
        rawBass > avg * BEAT_THRESHOLD_MULT
        && rawBass > 0.1
        && now - this.lastBeatTime > BEAT_REFRACTORY_SEC
      ) {
        beat = true;
        this.lastBeatTime = now;
      }
    }

    this.result.bass = this.bassSm;
    this.result.mid = this.midSm;
    this.result.treble = this.trebleSm;
    this.result.energy = (this.bassSm + this.midSm + this.trebleSm) / 3;
    this.result.beat = beat;
    return this.result;
  }

  dispose(): void {
    this.disconnect();
    this.analyser.dispose();
  }

  /**
   * Average magnitude (0-1 linear) of the FFT bins falling between loHz..hiHz.
   * dB values are mapped via (dB + 100) / 100 clamped to 0-1.
   */
  private bandAverage(fft: Float32Array, binHz: number, loHz: number, hiHz: number): number {
    const lo = Math.max(0, Math.floor(loHz / binHz));
    const hi = Math.min(fft.length - 1, Math.ceil(hiHz / binHz));
    let sum = 0;
    let count = 0;
    for (let i = lo; i <= hi; i++) {
      const db = fft[i];
      // dB is in (-Infinity, 0]. Map -100..0 → 0..1.
      const lin = Math.max(0, Math.min(1, (db + 100) / 100));
      sum += lin;
      count++;
    }
    return count > 0 ? sum / count : 0;
  }
}

/**
 * Asymmetric smoothing — fast attack, slow release. Returns the next smoothed
 * value given the previous, the current raw, and the time delta.
 */
function smooth(prev: number, raw: number, dt: number): number {
  const tau = raw > prev ? ATTACK_SEC : RELEASE_SEC;
  // 1 - exp(-dt/tau) → fraction of the way from prev to raw this step.
  const k = 1 - Math.exp(-dt / Math.max(1e-4, tau));
  return prev + (raw - prev) * k;
}
