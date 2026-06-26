/**
 * SynthEngine — owns the Tone.js audio graph for the image synth.
 *
 * Architecture:
 *   For each voice: Oscillator → Gain (per-voice amplitude)
 *   All voices → masterGain → reverbSend, delaySend, dry → destination
 *
 * Voice amplitudes are driven by `setLevels(voiceLevels)` called each frame
 * from the main loop. Per-voice gain uses rampTo with attack/release time
 * constants so we don't get clicks.
 *
 * Voice count is set up-front in `init()`. Changing voices requires a
 * teardown/rebuild — handled by changing `config.voices` then calling
 * `rebuildVoices(notes)`.
 */
import * as Tone from "tone";
import type { SynthConfig, VoiceLevels, Waveform } from "./types";

interface Voice {
  osc: Tone.Oscillator;
  gain: Tone.Gain;
  currentLevel: number;
}

export class SynthEngine {
  private voices: Voice[] = [];
  private masterGain: Tone.Gain | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private dryGain: Tone.Gain | null = null;
  private reverbGain: Tone.Gain | null = null;
  private delayGain: Tone.Gain | null = null;
  initialized = false;
  private currentWaveform: Waveform = "sine";

  /** Must be called after a user gesture — Tone.start() is async. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    this.masterGain = new Tone.Gain(0.4);
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 1 });
    this.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.4, wet: 1 });
    this.dryGain = new Tone.Gain(1);
    this.reverbGain = new Tone.Gain(0);
    this.delayGain = new Tone.Gain(0);

    // Routing: masterGain splits into dry/reverb/delay sends, recombined at destination.
    this.masterGain.connect(this.dryGain);
    this.masterGain.connect(this.reverbGain);
    this.masterGain.connect(this.delayGain);

    this.dryGain.toDestination();
    this.reverbGain.connect(this.reverb);
    this.reverb.toDestination();
    this.delayGain.connect(this.delay);
    this.delay.toDestination();

    this.initialized = true;
  }

  /**
   * Build (or rebuild) the voice oscillators for the given frequencies.
   * Disposes existing voices first.
   */
  rebuildVoices(frequencies: number[]): void {
    if (!this.initialized || !this.masterGain) return;
    // Dispose old voices
    for (const v of this.voices) {
      v.osc.stop();
      v.osc.dispose();
      v.gain.dispose();
    }
    this.voices = [];
    for (const f of frequencies) {
      const gain = new Tone.Gain(0).connect(this.masterGain);
      const osc = new Tone.Oscillator(f, this.currentWaveform).connect(gain);
      osc.start();
      this.voices.push({ osc, gain, currentLevel: 0 });
    }
  }

  /**
   * Apply current SynthConfig to the audio graph (waveform, effects, volume).
   * Does NOT rebuild voices — call rebuildVoices() separately if voice count
   * or frequencies change.
   */
  applyConfig(config: SynthConfig): void {
    if (!this.initialized) return;
    if (this.currentWaveform !== config.waveform) {
      this.currentWaveform = config.waveform;
      for (const v of this.voices) v.osc.type = config.waveform;
    }
    this.masterGain?.gain.rampTo(config.masterVolume, 0.05);
    this.reverbGain?.gain.rampTo(config.reverbWet, 0.05);
    this.delayGain?.gain.rampTo(config.delayWet, 0.05);
    this.dryGain?.gain.rampTo(
      1 - config.reverbWet * 0.5 - config.delayWet * 0.3,
      0.05,
    );
  }

  /**
   * Push per-voice amplitudes to the gain nodes.
   * Uses attack on rising levels, release on falling — avoids clicks.
   *
   * Each level is divided by sqrt(voices) so total mix doesn't explode with
   * voice count.
   */
  setLevels(levels: VoiceLevels, attack: number, release: number): void {
    if (!this.initialized) return;
    const norm = 1 / Math.sqrt(Math.max(1, this.voices.length));
    const n = Math.min(levels.length, this.voices.length);
    for (let i = 0; i < n; i++) {
      const v = this.voices[i];
      const target = levels[i] * norm;
      const tau = target > v.currentLevel ? attack : release;
      v.gain.gain.rampTo(target, Math.max(0.005, tau));
      v.currentLevel = target;
    }
  }

  async dispose(): Promise<void> {
    for (const v of this.voices) {
      v.osc.stop();
      v.osc.dispose();
      v.gain.dispose();
    }
    this.voices = [];
    this.masterGain?.dispose();
    this.reverb?.dispose();
    this.delay?.dispose();
    this.dryGain?.dispose();
    this.reverbGain?.dispose();
    this.delayGain?.dispose();
    this.initialized = false;
  }
}
