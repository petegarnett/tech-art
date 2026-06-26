/**
 * Map row index → MIDI note for a chosen scale.
 *
 * Each scale defines its semitone intervals within an octave. The mapping
 * spreads `voices` notes across `octaves` octaves starting from `rootMidi`.
 *
 * Example pentatonic in 1 octave: intervals [0, 2, 4, 7, 9] = C D E G A.
 */
import type { ScaleId } from "./types";

const INTERVALS: Record<ScaleId, number[]> = {
  pentatonic: [0, 2, 4, 7, 9],
  major:      [0, 2, 4, 5, 7, 9, 11],
  minor:      [0, 2, 3, 5, 7, 8, 10],
  chromatic:  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  harmonic:   [0, 12, 19, 24, 28, 31, 34, 36], // ratios 1:2:3:4:5:6:7:8 in semitones
  wholeTone:  [0, 2, 4, 6, 8, 10],
};

/**
 * Build an array of MIDI notes for the configured scale.
 * Length = voices. Lowest first.
 */
export function buildNotes(
  scale: ScaleId,
  rootMidi: number,
  octaves: number,
  voices: number,
): number[] {
  const ivs = INTERVALS[scale];
  // Total positions available = ivs.length * octaves.
  // We spread `voices` evenly across that — sample with stride.
  const total = ivs.length * octaves;
  const out: number[] = [];
  for (let i = 0; i < voices; i++) {
    const t = i / Math.max(1, voices - 1);
    const idx = Math.min(total - 1, Math.floor(t * total));
    const oct = Math.floor(idx / ivs.length);
    const step = idx % ivs.length;
    out.push(rootMidi + oct * 12 + ivs[step]);
  }
  return out;
}

/** Convert a MIDI note to frequency in Hz. */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export const SCALE_LABELS: Record<ScaleId, string> = {
  pentatonic: "Pentatonic",
  major: "Major",
  minor: "Minor",
  chromatic: "Chromatic",
  harmonic: "Harmonic Series",
  wholeTone: "Whole Tone",
};
