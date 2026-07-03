"use client";

/**
 * useVisualiserLoop — the main rAF loop.
 *
 * Reads refs (engines + configs), produces a per-frame modulated uniform
 * map, and pushes it to the VisualiserGL. Same architectural spirit as
 * useImageSynthLoop, but much slimmer — no camera / synth / voice paths.
 *
 * Flow per frame:
 *   1. Read FFT bands (or zeros if no audio active).
 *   2. Advance the LFO bank with current BPM.
 *   3. For each uniform in the active preset, sum the routed source values
 *      multiplied by their sends × per-source scale. Add to the base knob
 *      value. Clamp 0..1.
 *   4. Push the modulated uniform map + audio bands to VisualiserGL.
 *
 * No React state mutations from inside the loop — everything reads refs.
 * The one exception is via `onLiveTick`: the caller supplies a throttled
 * callback that the loop invokes at ~30Hz to publish LFO / band values
 * back to React state for meter UIs. This keeps per-frame overhead low.
 */

import { useEffect, useRef } from "react";
import type { LFOBank } from "@/lib/audio/lfo";
import type { FFTAnalyser } from "@/lib/audio/fft";
import type { VisualiserGL } from "@/lib/gfx/visualiserGL";
import type { PresetDef } from "@/lib/gfx/types";
import type { ModMatrix, ModSourceId, PresetId } from "./types";
import { MOD_SOURCE_SCALE } from "./types";

/**
 * All refs the loop needs. React state is mirrored into these each render
 * so the loop always reads the freshest value without re-subscribing.
 */
export interface VisualiserLoopRefs {
  fftRef: React.MutableRefObject<FFTAnalyser | null>;
  vizRef: React.MutableRefObject<VisualiserGL<PresetId> | null>;
  lfoBankRef: React.MutableRefObject<LFOBank | null>;

  /** The currently-active preset def (used to enumerate destination uniforms). */
  presetDefRef: React.MutableRefObject<PresetDef<PresetId>>;
  /** Uniform name → 0..1 base value from the UI knobs. */
  presetParamsRef: React.MutableRefObject<Record<string, number>>;
  /** Routing matrix — sparse. */
  modMatrixRef: React.MutableRefObject<ModMatrix>;
  /** BPM for sync-mode LFOs. */
  bpmRef: React.MutableRefObject<number>;
  /** Master bypass — when true, LFO output is zeroed. */
  modBypassRef: React.MutableRefObject<boolean>;
  /** True when the audio source is delivering signal (else audio bands = 0). */
  audioActiveRef: React.MutableRefObject<boolean>;

  /**
   * Called by the loop with the latest live values for meter UIs. Throttled
   * internally to ~30Hz. Caller uses setState here — that's fine because
   * setState from a rAF is coalesced by React.
   */
  onLiveTick?: (data: {
    bass: number;
    mid: number;
    treble: number;
    energy: number;
    beat: number;
    lfoValues: Float32Array;
  }) => void;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Live-tick publish rate — 30Hz for UI meters is smooth enough and saves
// React reconciliation from running on every rAF (60Hz+).
const LIVE_TICK_INTERVAL_MS = 33;

export function useVisualiserLoop(refs: VisualiserLoopRefs) {
  // Wall-clock start time so iTime is monotonic within this session.
  const startTimeRef = useRef(performance.now() / 1000);

  // Scratch buffer — one entry per source, reused each frame.
  const sourceValuesRef = useRef<Record<ModSourceId, number>>({
    bass: 0, mid: 0, treble: 0, energy: 0, beat: 0,
    lfo1: 0, lfo2: 0, lfo3: 0, lfo4: 0,
  });
  const liveTickLastRef = useRef(0);
  const lfoLiveValuesRef = useRef(new Float32Array(4));

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const timeSec = now / 1000;
      const relTime = timeSec - startTimeRef.current;

      const fft = refs.fftRef.current;
      const viz = refs.vizRef.current;
      const lfoBank = refs.lfoBankRef.current;
      const preset = refs.presetDefRef.current;
      const baseParams = refs.presetParamsRef.current;
      const modMatrix = refs.modMatrixRef.current;
      const bpm = refs.bpmRef.current;
      const bypass = refs.modBypassRef.current;
      const audioActive = refs.audioActiveRef.current;
      const src = sourceValuesRef.current;

      // ── 1. Read audio bands (or zeros when idle) ──────────────
      // FFTAnalyser.read() is safe to call always — it just returns zeros
      // if the analyser hasn't been fed. But when audio is inactive we also
      // want to skip the beat flag which would fire spuriously on ambient
      // noise floors as bass drifts.
      if (fft && audioActive) {
        const reading = fft.read();
        src.bass = reading.bass;
        src.mid = reading.mid;
        src.treble = reading.treble;
        src.energy = reading.energy;
        src.beat = reading.beat ? 1 : 0;
      } else {
        src.bass = 0; src.mid = 0; src.treble = 0; src.energy = 0; src.beat = 0;
      }

      // ── 2. Advance LFOs ─────────────────────────────────────
      if (lfoBank) {
        lfoBank.bypass = bypass;
        lfoBank.update(timeSec, bpm);
        // Pull the 4 values (each in the LFO's polarity range).
        src.lfo1 = lfoBank.getValue(0);
        src.lfo2 = lfoBank.getValue(1);
        src.lfo3 = lfoBank.getValue(2);
        src.lfo4 = lfoBank.getValue(3);
        lfoLiveValuesRef.current[0] = src.lfo1;
        lfoLiveValuesRef.current[1] = src.lfo2;
        lfoLiveValuesRef.current[2] = src.lfo3;
        lfoLiveValuesRef.current[3] = src.lfo4;
      }

      // ── 3. Compute modulated uniform values for every preset param ──
      // Reuse the baseParams shape — we build a fresh object each frame
      // (small: 10-12 keys) so the VisualiserGL sees a stable snapshot.
      const liveParams: Record<string, number> = {};
      for (const param of preset.params) {
        const base = baseParams[param.name] ?? param.default;
        let sum = 0;
        // Iterate all 9 sources — fast (9 iterations, mostly no-ops when
        // routes are unset). Beat gets its own scale (0.35) so a pulse
        // doesn't slam the destination.
        for (const source of MOD_SOURCE_IDS_INTERNAL) {
          const send = modMatrix[`${source}.${param.name}`];
          if (!send) continue;
          sum += src[source] * send * MOD_SOURCE_SCALE[source];
        }
        liveParams[param.name] = clamp01(base + sum);
      }

      // ── 4. Push everything to VisualiserGL ─────────────────
      if (viz?.ready) {
        viz.setPreset(preset.id);
        viz.update({
          time: relTime,
          bass: src.bass,
          mid: src.mid,
          treble: src.treble,
          energy: src.energy,
          beat: src.beat > 0,
          // No voices in the Visualiser — pass an empty array so the engine
          // just zeroes the iVoiceLevels uniform. GLITCH still works fine.
          voiceLevels: EMPTY_VOICE_LEVELS,
          params: liveParams,
          // No camera → engine falls back to the 1×1 grey pixel it creates
          // during init. iCameraMix=0.0 by default on our GLITCH preset so
          // the visual comes from energy tint.
          cameraVideo: null,
          cameraWidth: 1,
          cameraHeight: 1,
        });
        viz.draw();
      }

      // ── 5. Publish live values back to React (throttled) ───
      if (refs.onLiveTick && now - liveTickLastRef.current > LIVE_TICK_INTERVAL_MS) {
        liveTickLastRef.current = now;
        refs.onLiveTick({
          bass: src.bass,
          mid: src.mid,
          treble: src.treble,
          energy: src.energy,
          beat: src.beat,
          lfoValues: lfoLiveValuesRef.current,
        });
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intentionally captures refs only — they're stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Zero-length voice buffer reused across frames — no allocations per rAF. */
const EMPTY_VOICE_LEVELS = new Float32Array(0);

/**
 * Local copy of the 9 source ids in a fixed order — dodges an object-lookup
 * cost per frame vs importing MOD_SOURCE_IDS (same content, just typed
 * narrower so `src[source]` is a direct property access).
 */
const MOD_SOURCE_IDS_INTERNAL: ModSourceId[] = [
  "bass", "mid", "treble", "energy", "beat",
  "lfo1", "lfo2", "lfo3", "lfo4",
];
