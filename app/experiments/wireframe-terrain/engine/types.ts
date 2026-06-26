/**
 * Shared types + constants for the wireframe terrain audio routing system.
 *
 * Two key vocabularies live here:
 *   - Bands: log-spaced frequency bands the audio engine splits the FFT into.
 *   - Destinations: visual parameters that audio bands can modulate.
 *
 * A RoutingMatrix is just a 6×8 grid of depth values (0-1) connecting them.
 */

/** Six log-spaced frequency bands matching how the ear perceives sound. */
export type BandId = "sub" | "bass" | "lowMid" | "highMid" | "high" | "air";

export const BAND_IDS: BandId[] = [
  "sub",
  "bass",
  "lowMid",
  "highMid",
  "high",
  "air",
];

export const BAND_LABELS: Record<BandId, string> = {
  sub: "SUB",
  bass: "BASS",
  lowMid: "LOW-MID",
  highMid: "HIGH-MID",
  high: "HIGH",
  air: "AIR",
};

/** Frequency range in Hz, used to compute FFT bin slices at the analyser's sample rate. */
export const BAND_RANGES: Record<BandId, [number, number]> = {
  sub: [20, 60],
  bass: [60, 250],
  lowMid: [250, 500],
  highMid: [500, 2000],
  high: [2000, 6000],
  air: [6000, 20000],
};

/** Visual parameter targets that audio bands can modulate. */
export type DestinationId =
  | "amplitude"
  | "frequency"
  | "speed"
  | "detail"
  | "lineWidth"
  | "hueShift"
  | "brightness"
  | "tilt";

export const DESTINATION_IDS: DestinationId[] = [
  "amplitude",
  "frequency",
  "speed",
  "detail",
  "lineWidth",
  "hueShift",
  "brightness",
  "tilt",
];

export const DESTINATION_LABELS: Record<DestinationId, string> = {
  amplitude: "AMP",
  frequency: "FREQ",
  speed: "SPEED",
  detail: "DETAIL",
  lineWidth: "LINE",
  hueShift: "HUE",
  brightness: "BRIGHT",
  tilt: "TILT",
};

/** Live level for each band, 0-1, post-envelope. */
export type BandLevels = Record<BandId, number>;

/** depth[band][destination] = 0-1 modulation amount. */
export type RoutingMatrix = Record<BandId, Record<DestinationId, number>>;

export type AudioSource = "none" | "mic" | "tab";

export interface AudioConfig {
  source: AudioSource;
  /** deviceId when source === 'mic'. '' = system default. */
  deviceId: string;
  sensitivity: number; // global multiplier 0-3
}

export interface AudioStatus {
  active: boolean;
  source: AudioSource;
  deviceLabel: string | null;
  sampleRate: number;
  error: string | null;
}
