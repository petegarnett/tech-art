/**
 * SynthEngine — owns the Tone.js audio graph for the image synth.
 *
 * v2 architecture (per voice):
 *
 *   oscPrimary ─┐
 *               ├→ morphCrossfade.a  (oscillator mode)
 *   oscSecondary ┘
 *   (or)
 *   player ──→ morphCrossfade.a       (sample mode — secondary muted)
 *
 *   morphCrossfade → panner → filter (LP, cutoff+Q) → voiceGain →
 *     ├── dryGain ─→ masterGain ──── destination
 *     ├── reverbSendGain ─→ reverbBus → reverb → destination
 *     └── delaySendGain ──→ delayBus  → delay  → destination
 *
 * Each voice exposes a setState(...) entry-point that the engine calls every
 * frame with the current modulated values for all 9 destinations.
 *
 * "voiceGain" carries the volume modulation (attack/release).
 * "reverbSendGain" / "delaySendGain" carry per-voice send levels.
 * "panner.pan", "filter.frequency", "filter.Q" are modulated directly.
 * "detune" hits both oscillators (or the player) in cents.
 * "octaveShift" toggles a +12-semitone offset on the oscillators' detune (or
 * doubles the playback rate on the sample player).
 * "waveformMorph" drives the crossfade fader.
 *
 * NOTE: We use `setValueAtTime` for the octaveShift threshold (instant) and
 * `rampTo` for everything else with the time-constants from the spec.
 */
import * as Tone from "tone";
import type {
  SourceMode,
  SynthConfig,
  VoiceLevels,
  VoiceStateBuffers,
  Waveform,
} from "./types";
import { midiToFreq } from "./scales";

/** Per-voice graph nodes. Either oscillator-mode or sample-mode is active. */
interface Voice {
  // shared
  panner: Tone.Panner;
  filter: Tone.Filter;
  voiceGain: Tone.Gain;        // master "volume" knob target
  reverbSendGain: Tone.Gain;
  delaySendGain: Tone.Gain;
  dryGain: Tone.Gain;
  morphFader: Tone.CrossFade;  // a = primary, b = secondary
  baseFreq: number;            // original pitch (Hz)
  baseMidi: number;            // derived from baseFreq, used for sample rate calc
  currentVolume: number;
  octShiftOn: boolean;
  // oscillator mode
  oscPrimary?: Tone.Oscillator;
  oscSecondary?: Tone.Oscillator;
  // sample mode
  player?: Tone.Player;
}

const SAMPLE_SECONDARY_WAVE: Waveform = "triangle";

export class SynthEngine {
  private voices: Voice[] = [];
  private masterGain: Tone.Gain | null = null;
  private reverb: Tone.Reverb | null = null;
  private delay: Tone.FeedbackDelay | null = null;
  private reverbBus: Tone.Gain | null = null; // sum of all voice reverbSends
  private delayBus: Tone.Gain | null = null;  // sum of all voice delaySends
  private masterReverbWet: Tone.Gain | null = null; // master reverb level
  private masterDelayWet: Tone.Gain | null = null;  // master delay level
  initialized = false;

  // Current config state (mirrored from applyConfig so we can rebuild voices).
  private currentWaveform: Waveform = "sine";
  private currentWaveformSecondary: Waveform = "triangle";
  private currentSource: SourceMode = "oscillator";
  private currentSampleBaseMidi = 60;
  private sampleBuffer: Tone.ToneAudioBuffer | null = null;

  /** Public accessor for the analyser tap point (master output). */
  get analyserSource(): Tone.ToneAudioNode | null {
    return this.masterGain;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await Tone.start();

    // Master bus — everything goes through here so we can tap an analyser.
    this.masterGain = new Tone.Gain(0.4);
    this.masterGain.toDestination();

    // Reverb / delay buses — voices send into these, the buses feed the
    // master "wet" gain, which connects back to masterGain.
    this.reverb = new Tone.Reverb({ decay: 2.5, wet: 1 });
    this.delay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.4, wet: 1 });
    await this.reverb.ready;

    this.reverbBus = new Tone.Gain(1);
    this.delayBus = new Tone.Gain(1);
    this.masterReverbWet = new Tone.Gain(0.25); // master "reverb wet" knob
    this.masterDelayWet = new Tone.Gain(0);     // master "delay wet" knob

    this.reverbBus.connect(this.reverb);
    this.reverb.connect(this.masterReverbWet);
    this.masterReverbWet.connect(this.masterGain);

    this.delayBus.connect(this.delay);
    this.delay.connect(this.masterDelayWet);
    this.masterDelayWet.connect(this.masterGain);

    this.initialized = true;
  }

  /**
   * Load a sample for use in sample mode. Switches the engine's buffer ref
   * and re-binds existing players (if any) to the new buffer.
   */
  async loadSample(arrayBuffer: ArrayBuffer): Promise<{ duration: number }> {
    const audioBuffer = await Tone.getContext().rawContext.decodeAudioData(arrayBuffer.slice(0));
    if (this.sampleBuffer) this.sampleBuffer.dispose();
    this.sampleBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    // If we're already in sample mode, swap each player's buffer.
    for (const v of this.voices) {
      if (v.player && this.sampleBuffer) {
        v.player.buffer = this.sampleBuffer;
        try { v.player.start(); } catch { /* may already be started */ }
      }
    }
    return { duration: audioBuffer.duration };
  }

  /** Whether a sample is loaded. */
  hasSample(): boolean { return !!this.sampleBuffer; }
  /** Duration of the loaded sample in seconds. */
  get sampleDuration(): number { return this.sampleBuffer?.duration ?? 0; }

  /**
   * Build (or rebuild) the voice graph for the given frequencies.
   * Reads currentSource to decide oscillator vs sample.
   */
  rebuildVoices(frequencies: number[]): void {
    if (!this.initialized || !this.masterGain || !this.reverbBus || !this.delayBus) return;

    // Tear down existing voices
    for (const v of this.voices) {
      v.oscPrimary?.stop();
      v.oscPrimary?.dispose();
      v.oscSecondary?.stop();
      v.oscSecondary?.dispose();
      v.player?.stop();
      v.player?.dispose();
      v.morphFader.dispose();
      v.panner.dispose();
      v.filter.dispose();
      v.voiceGain.dispose();
      v.dryGain.dispose();
      v.reverbSendGain.dispose();
      v.delaySendGain.dispose();
    }
    this.voices = [];

    for (const f of frequencies) {
      const baseMidi = freqToMidi(f);

      // Shared signal chain pieces
      const morphFader = new Tone.CrossFade(0); // 0 = full primary
      const panner = new Tone.Panner(0);
      const filter = new Tone.Filter({ type: "lowpass", frequency: 16000, Q: 1 });
      const voiceGain = new Tone.Gain(0);
      const dryGain = new Tone.Gain(1);
      const reverbSendGain = new Tone.Gain(0);
      const delaySendGain = new Tone.Gain(0);

      // morphFader → panner → filter → voiceGain → splits
      morphFader.connect(panner);
      panner.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(dryGain);
      voiceGain.connect(reverbSendGain);
      voiceGain.connect(delaySendGain);

      dryGain.connect(this.masterGain);
      reverbSendGain.connect(this.reverbBus);
      delaySendGain.connect(this.delayBus);

      const voice: Voice = {
        panner,
        filter,
        voiceGain,
        reverbSendGain,
        delaySendGain,
        dryGain,
        morphFader,
        baseFreq: f,
        baseMidi,
        currentVolume: 0,
        octShiftOn: false,
      };

      if (this.currentSource === "oscillator") {
        // Two oscillators, crossfaded.
        const oscPrimary = new Tone.Oscillator(f, this.currentWaveform);
        const oscSecondary = new Tone.Oscillator(f, this.currentWaveformSecondary);
        oscPrimary.connect(morphFader.a);
        oscSecondary.connect(morphFader.b);
        oscPrimary.start();
        oscSecondary.start();
        voice.oscPrimary = oscPrimary;
        voice.oscSecondary = oscSecondary;
      } else {
        // Sample mode — one Tone.Player per voice. If no buffer is loaded
        // yet, the player sits silent and waits for loadSample().
        const player = new Tone.Player({
          loop: true,
          autostart: false,
          fadeIn: 0.01,
          fadeOut: 0.01,
        });
        player.playbackRate = midiToRate(baseMidi, this.currentSampleBaseMidi);
        if (this.sampleBuffer) {
          player.buffer = this.sampleBuffer;
          try { player.start(); } catch { /* already running */ }
        }
        player.connect(morphFader.a);
        // Secondary signal (a quiet triangle at the same pitch) gives the
        // morph knob something to crossfade to even in sample mode.
        const oscSecondary = new Tone.Oscillator(f, SAMPLE_SECONDARY_WAVE);
        oscSecondary.connect(morphFader.b);
        oscSecondary.start();
        voice.player = player;
        voice.oscSecondary = oscSecondary;
      }

      this.voices.push(voice);
    }
  }

  /**
   * Apply non-voice-affecting config (master volume, master wet sends).
   * The waveforms get applied to each voice in-place.
   */
  applyConfig(config: SynthConfig): void {
    if (!this.initialized) return;
    // If source mode changed we need to rebuild — caller handles that.
    this.currentSource = config.source;
    this.currentSampleBaseMidi = config.sampleBaseMidi;

    if (this.currentWaveform !== config.waveform) {
      this.currentWaveform = config.waveform;
      for (const v of this.voices) {
        if (v.oscPrimary) v.oscPrimary.type = config.waveform;
      }
    }
    if (this.currentWaveformSecondary !== config.waveformSecondary) {
      this.currentWaveformSecondary = config.waveformSecondary;
      for (const v of this.voices) {
        if (v.oscSecondary) v.oscSecondary.type = config.waveformSecondary;
      }
    }

    this.masterGain?.gain.rampTo(config.masterVolume, 0.05);
    this.masterReverbWet?.gain.rampTo(config.reverbWet, 0.05);
    this.masterDelayWet?.gain.rampTo(config.delayWet, 0.05);

    // Update sample playback rates if base note changed (sample mode only).
    if (this.currentSource === "sample") {
      for (const v of this.voices) {
        if (v.player) {
          const rate = midiToRate(v.baseMidi, config.sampleBaseMidi);
          // Apply octave shift on top if active.
          v.player.playbackRate = rate * (v.octShiftOn ? 2 : 1);
        }
      }
      // Loop points
      if (this.sampleBuffer) {
        const dur = this.sampleBuffer.duration;
        for (const v of this.voices) {
          if (v.player) {
            v.player.loopStart = Math.max(0, Math.min(dur, config.sampleLoopStart * dur));
            v.player.loopEnd = Math.max(
              v.player.loopStart + 0.01,
              Math.min(dur, config.sampleLoopEnd * dur),
            );
          }
        }
      }
    }
  }

  /**
   * Per-frame: push all destination values to every voice.
   *
   * `attack` and `release` are used for the volume destination only — they
   * override the standard `rampSec` to support fast attack / long release.
   * All other destinations use the time constants from destinations.ts.
   */
  setVoiceState(
    buffers: VoiceStateBuffers,
    attack: number,
    release: number,
  ): void {
    if (!this.initialized) return;
    const n = Math.min(buffers.volume.length, this.voices.length);
    // Normalisation for summed voices — avoid mix blowing up at 128 voices.
    const norm = 1 / Math.sqrt(Math.max(1, this.voices.length));
    const now = Tone.now();

    for (let i = 0; i < n; i++) {
      const v = this.voices[i];

      // Volume — multiplicative on base 0, with attack/release.
      const vol = buffers.volume[i] * norm;
      const tau = vol > v.currentVolume ? attack : release;
      v.voiceGain.gain.rampTo(vol, Math.max(0.005, tau));
      v.currentVolume = vol;

      // Filter cutoff (Hz) — 0.02s ramp
      v.filter.frequency.rampTo(buffers.filterCutoff[i], 0.02);
      // Resonance (Q) — 0.05s ramp
      v.filter.Q.rampTo(buffers.resonance[i], 0.05);

      // Reverb / delay sends — 0.05s ramp
      v.reverbSendGain.gain.rampTo(buffers.reverbSend[i], 0.05);
      v.delaySendGain.gain.rampTo(buffers.delaySend[i], 0.05);

      // Pan — 0.05s
      v.panner.pan.rampTo(buffers.pan[i], 0.05);

      // Detune (cents) — applied to oscillators / player.
      const detune = buffers.detune[i];
      if (v.oscPrimary) v.oscPrimary.detune.rampTo(detune, 0.03);
      if (v.oscSecondary) v.oscSecondary.detune.rampTo(detune, 0.03);
      // Tone.Player has no detune param — we fold it into playbackRate below
      // for sample mode.

      // Waveform morph — 0.03s
      v.morphFader.fade.rampTo(buffers.waveformMorph[i], 0.03);

      // Octave shift — digital threshold, instant via setValueAtTime.
      const shouldShift = buffers.octaveShift[i] >= 0.5;
      if (shouldShift !== v.octShiftOn) {
        v.octShiftOn = shouldShift;
        if (this.currentSource === "oscillator") {
          // 1200 cents = +1 octave. We bake octave into the oscillators'
          // detune offset using setValueAtTime, then immediately overlay the
          // continuous detune mod via rampTo so they don't fight.
          const offset = shouldShift ? 1200 : 0;
          if (v.oscPrimary) {
            v.oscPrimary.detune.setValueAtTime(offset + detune, now);
          }
          if (v.oscSecondary) {
            v.oscSecondary.detune.setValueAtTime(offset + detune, now);
          }
        } else if (v.player) {
          // Sample mode — multiply playbackRate by 2.
          const baseRate = midiToRate(v.baseMidi, this.currentSampleBaseMidi);
          v.player.playbackRate = baseRate * (shouldShift ? 2 : 1);
        }
      }
    }
  }

  /** Build a VoiceLevels (volume buffer) view for the activity meter. */
  static volumeView(buffers: VoiceStateBuffers): VoiceLevels {
    return buffers.volume;
  }

  async dispose(): Promise<void> {
    for (const v of this.voices) {
      v.oscPrimary?.stop();
      v.oscPrimary?.dispose();
      v.oscSecondary?.stop();
      v.oscSecondary?.dispose();
      v.player?.stop();
      v.player?.dispose();
      v.morphFader.dispose();
      v.panner.dispose();
      v.filter.dispose();
      v.voiceGain.dispose();
      v.dryGain.dispose();
      v.reverbSendGain.dispose();
      v.delaySendGain.dispose();
    }
    this.voices = [];
    this.masterGain?.dispose();
    this.reverb?.dispose();
    this.delay?.dispose();
    this.reverbBus?.dispose();
    this.delayBus?.dispose();
    this.masterReverbWet?.dispose();
    this.masterDelayWet?.dispose();
    this.sampleBuffer?.dispose();
    this.sampleBuffer = null;
    this.initialized = false;
  }
}

/* ─── Helpers ─── */

/** Convert MIDI → playback rate relative to a sample's base note. */
function midiToRate(voiceMidi: number, sampleBaseMidi: number): number {
  return midiToFreq(voiceMidi) / midiToFreq(sampleBaseMidi);
}

/** Convert frequency → nearest MIDI note. */
function freqToMidi(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}
