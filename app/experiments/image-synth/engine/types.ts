/** Shared types for the image synth. */

export type ScanMode = "sweep" | "freeze";
export type SweepDirection = "right" | "left" | "bounce";
export type Waveform = "sine" | "triangle" | "sawtooth" | "square";

export type ScaleId =
  | "pentatonic"
  | "major"
  | "minor"
  | "chromatic"
  | "harmonic"
  | "wholeTone";

export interface CameraConfig {
  deviceId: string;        // '' = default
  threshold: number;       // 0-1, brightness below this is silence
  bw: boolean;             // hard B&W threshold (true) or grayscale (false)
  invert: boolean;
  resolution: 64 | 128 | 256 | 512; // capture width; height = width * 3/4
}

export interface ScanConfig {
  mode: ScanMode;
  speed: number;           // sweeps per second
  direction: SweepDirection;
  loop: boolean;
}

/** Source mode: oscillator bank (classic) or sample player (transposed). */
export type SourceMode = "oscillator" | "sample";

export interface SynthConfig {
  source: SourceMode;
  waveform: Waveform;       // primary osc (oscillator mode)
  waveformSecondary: Waveform; // secondary osc, crossfaded by waveformMorph destination
  attack: number;           // seconds
  release: number;          // seconds
  reverbWet: number;        // 0-1 (master reverb bus level)
  delayWet: number;         // 0-1 (master delay bus level)
  masterVolume: number;     // 0-1
  voices: 8 | 16 | 32 | 64 | 128;
  // Sample mode params (ignored in oscillator mode):
  sampleBaseMidi: number;   // MIDI note that the sample plays at its native rate
  sampleLoopStart: number;  // 0-1, fraction of buffer
  sampleLoopEnd: number;    // 0-1, fraction of buffer
}

export interface ScaleConfig {
  scale: ScaleId;
  rootMidi: number;        // 0-127, default 36 = C2
  octaves: number;         // 1-7, default 5
}

/** Live readout of which voices are sounding — fed to the activity meter. */
export type VoiceLevels = Float32Array; // length = voices count, values 0-1

/* ─── Routing Matrix ─── */

/**
 * Modulation destinations. Each is a target the per-voice grey value can drive.
 * Volume is special: base = 0, mod is multiplicative. All others are additive
 * over a base value (cf. wireframe-terrain — additive avoids the
 * "knob doesn't do anything when base is 0" trap).
 */
export type DestinationId =
  | "volume"
  | "filterCutoff"
  | "resonance"
  | "reverbSend"
  | "delaySend"
  | "pan"
  | "detune"
  | "waveformMorph"
  | "octaveShift";

/** User-controlled depth 0..1 per destination — drives how strongly grey modulates it. */
export type MatrixConfig = Record<DestinationId, number>;

export const DEFAULT_MATRIX: MatrixConfig = {
  volume: 1.0,
  filterCutoff: 0.0,
  resonance: 0.0,
  reverbSend: 0.0,
  delaySend: 0.0,
  pan: 0.0,
  detune: 0.0,
  waveformMorph: 0.0,
  octaveShift: 0.0,
};

/**
 * Per-frame destination values for every voice. SOA layout —
 * one Float32Array per destination, length = voices.
 *
 * Filled in by sonify.ts, consumed by SynthEngine.setVoiceState().
 */
export interface VoiceStateBuffers {
  volume: Float32Array;        // 0-1
  filterCutoff: Float32Array;  // Hz (200..16000)
  resonance: Float32Array;     // Q (1..11)
  reverbSend: Float32Array;    // 0-1
  delaySend: Float32Array;     // 0-1
  pan: Float32Array;           // -1..1
  detune: Float32Array;        // cents (-50..50)
  waveformMorph: Float32Array; // 0-1 (crossfade)
  octaveShift: Float32Array;   // 0 or 1 (digital)
}

export const DESTINATION_IDS: DestinationId[] = [
  "volume",
  "filterCutoff",
  "resonance",
  "reverbSend",
  "delaySend",
  "pan",
  "detune",
  "waveformMorph",
  "octaveShift",
];

export function makeVoiceStateBuffers(voices: number): VoiceStateBuffers {
  return {
    volume: new Float32Array(voices),
    filterCutoff: new Float32Array(voices),
    resonance: new Float32Array(voices),
    reverbSend: new Float32Array(voices),
    delaySend: new Float32Array(voices),
    pan: new Float32Array(voices),
    detune: new Float32Array(voices),
    waveformMorph: new Float32Array(voices),
    octaveShift: new Float32Array(voices),
  };
}

/* ─── Visualiser ─── */

export type PresetId = "glitch" | "flow" | "mutate";
export type CompositionMode = "viz-only" | "viz-overlay" | "viz-underlay" | "camera-only";

export interface VizConfig {
  preset: PresetId;
  composition: CompositionMode;
  /** Per-preset param values, 0-1. Keyed by uniform name (e.g. iChromaticAberration). */
  params: Record<string, Record<string, number>>;
}

/* ─── Modulation Matrix (LFO bank) ─── */

/** A specific LFO in the bank (4 total). */
export type LFOIndex = 0 | 1 | 2 | 3;

/** Group a destination belongs to — used by the MOD tab filter. */
export type ModDestGroup = "camera" | "scan" | "synth" | "matrix" | "viz";

/**
 * Every parameter the LFO bank can modulate. Spread across the 5 groups —
 * see modDestinations.ts for the full definitions + scaling.
 */
export type ModDestId =
  | "cameraThreshold"
  | "scanSpeed"
  | "scanX"
  | "masterVolume"
  | "reverbWet"
  | "delayWet"
  | "sampleLoopStart"
  | "sampleLoopEnd"
  | "matrixFilterCutoffDepth"
  | "matrixResonanceDepth"
  | "matrixReverbSendDepth"
  | "matrixDelaySendDepth"
  | "matrixPanDepth"
  | "matrixDetuneDepth"
  | "matrixWaveformMorphDepth"
  | "vizChromaticAberration"
  | "vizScanlineTear"
  | "vizBitCrush"
  | "vizEdgeBoost"
  | "vizHueRotate"
  | "vizZoom"
  | "vizBlockShift"
  | "vizCameraMix";

/** Sparse routing matrix: `lfo{1-4}.{destId}` → send amount in -1..+1. */
export type ModRouteKey = `lfo${1 | 2 | 3 | 4}.${ModDestId}`;

export type ModMatrix = Partial<Record<ModRouteKey, number>>;

/** Build a routing key from a 0-based LFO index + destination id. */
export function modRouteKey(lfoIdx: number, dest: ModDestId): ModRouteKey {
  return `lfo${(lfoIdx + 1) as 1 | 2 | 3 | 4}.${dest}` as ModRouteKey;
}
