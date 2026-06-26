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

export interface SynthConfig {
  waveform: Waveform;
  attack: number;          // seconds
  release: number;         // seconds
  reverbWet: number;       // 0-1
  delayWet: number;        // 0-1
  masterVolume: number;    // 0-1
  voices: 8 | 16 | 32 | 64 | 128;
}

export interface ScaleConfig {
  scale: ScaleId;
  rootMidi: number;        // 0-127, default 36 = C2
  octaves: number;         // 1-7, default 5
}

/** Live readout of which voices are sounding — fed to the activity meter. */
export type VoiceLevels = Float32Array; // length = voices count, values 0-1
