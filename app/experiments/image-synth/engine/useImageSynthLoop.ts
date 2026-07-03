"use client";

/**
 * useImageSynthLoop — the main rAF loop, factored out of page.tsx.
 *
 * Reads refs (engines + per-frame configs), advances the LFO bank, computes
 * the modulated value of every mod destination, derives a per-frame "live"
 * config (without mutating React state), and pushes the result to the
 * camera / synth / visualiser engines.
 *
 * Modulation flow per frame:
 *   1. LFO bank ticks (with current BPM).
 *   2. For each mod destination, sum the routed LFO values × their sends.
 *   3. base + sum * scale, then clamp → live override value.
 *   4. Build live configs (camera/scan/synth/matrix/viz) that overlay the
 *      modulated values on top of the user's state.
 *   5. Run the existing sonify / synth / visualise pipeline with the live
 *      configs in place of the originals.
 *
 * No React state mutations from inside the loop.
 */
import { useEffect, useRef } from "react";
import { CameraEngine } from "./camera";
import type { SynthEngine } from "./synth";
import type { FFTAnalyser } from "@/lib/audio/fft";
import type { VisualiserGL } from "@/lib/gfx/visualiserGL";
import { computeGrey, routeToDestinations } from "./sonify";
import { DESTINATIONS } from "./destinations";
import { MOD_DESTINATIONS } from "./modDestinations";
import type { LFOBank } from "@/lib/audio/lfo";
import type {
  CameraConfig,
  DestinationId,
  MatrixConfig,
  ModDestId,
  ModMatrix,
  ScanConfig,
  SynthConfig,
  VizConfig,
  VoiceLevels,
  VoiceStateBuffers,
} from "./types";

interface LoopRefs {
  cameraRef: React.MutableRefObject<CameraEngine | null>;
  synthRef: React.MutableRefObject<SynthEngine | null>;
  fftRef: React.MutableRefObject<FFTAnalyser | null>;
  vizRef: React.MutableRefObject<VisualiserGL | null>;
  lfoBankRef: React.MutableRefObject<LFOBank | null>;

  cameraConfigRef: React.MutableRefObject<CameraConfig>;
  scanConfigRef: React.MutableRefObject<ScanConfig>;
  synthConfigRef: React.MutableRefObject<SynthConfig>;
  matrixConfigRef: React.MutableRefObject<MatrixConfig>;
  vizConfigRef: React.MutableRefObject<VizConfig>;

  /** LFO routing — sparse dict of "lfo{1-4}.{destId}" → -1..+1 send. */
  modMatrixRef: React.MutableRefObject<ModMatrix>;
  /** Tempo for sync-rate LFOs (40..300). */
  bpmRef: React.MutableRefObject<number>;

  greyRef: React.MutableRefObject<VoiceLevels>;
  buffersRef: React.MutableRefObject<VoiceStateBuffers>;
  /** Mean modulated value per destination across all voices — UI readout. */
  matrixReadoutRef: React.MutableRefObject<Record<DestinationId, number>>;

  scanXRef: React.MutableRefObject<number>;
  sweepDirRef: React.MutableRefObject<number>;
  sweepTimeRef: React.MutableRefObject<number>;
}

/** Map every viz mod destination id → the GLITCH uniform name it writes to. */
const VIZ_DEST_TO_UNIFORM: Partial<Record<ModDestId, string>> = {
  vizChromaticAberration: "iChromaticAberration",
  vizScanlineTear: "iScanlineTear",
  vizBitCrush: "iBitCrush",
  vizEdgeBoost: "iEdgeBoost",
  vizHueRotate: "iHueRotate",
  vizZoom: "iZoom",
  vizBlockShift: "iBlockShift",
  vizCameraMix: "iCameraMix",
};

/**
 * Resolve the user's "base" value for a mod destination from the current
 * configs. This is what the LFO output is summed on top of.
 */
function readModBase(
  id: ModDestId,
  camera: CameraConfig,
  scan: ScanConfig,
  synth: SynthConfig,
  matrix: MatrixConfig,
  viz: VizConfig,
  scanX: number,
): number {
  switch (id) {
    case "cameraThreshold": return camera.threshold;
    case "scanSpeed":       return scan.speed;
    case "scanX":           return scanX;
    case "masterVolume":    return synth.masterVolume;
    case "reverbWet":       return synth.reverbWet;
    case "delayWet":        return synth.delayWet;
    case "sampleLoopStart": return synth.sampleLoopStart;
    case "sampleLoopEnd":   return synth.sampleLoopEnd;
    case "matrixFilterCutoffDepth":  return matrix.filterCutoff;
    case "matrixResonanceDepth":     return matrix.resonance;
    case "matrixReverbSendDepth":    return matrix.reverbSend;
    case "matrixDelaySendDepth":     return matrix.delaySend;
    case "matrixPanDepth":           return matrix.pan;
    case "matrixDetuneDepth":        return matrix.detune;
    case "matrixWaveformMorphDepth": return matrix.waveformMorph;
    case "vizChromaticAberration":
    case "vizScanlineTear":
    case "vizBitCrush":
    case "vizEdgeBoost":
    case "vizHueRotate":
    case "vizZoom":
    case "vizBlockShift":
    case "vizCameraMix": {
      const uniform = VIZ_DEST_TO_UNIFORM[id];
      if (!uniform) return 0;
      const presetParams = viz.params[viz.preset];
      return presetParams?.[uniform] ?? 0;
    }
    default:
      return 0;
  }
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

export function useImageSynthLoop(refs: LoopRefs) {
  // Wall-clock start time for the visualiser's iTime uniform.
  const startTimeRef = useRef(performance.now() / 1000);

  // Per-frame scratch for modulated values. Allocated once — keyed by id but
  // we just overwrite each frame. Created lazily in the effect to avoid SSR
  // issues with Object.fromEntries on a typed enum.
  const modulatedRef = useRef<Record<ModDestId, number> | null>(null);

  useEffect(() => {
    // Lazy init scratch.
    if (!modulatedRef.current) {
      const init: Partial<Record<ModDestId, number>> = {};
      for (const d of MOD_DESTINATIONS) init[d.id] = 0;
      modulatedRef.current = init as Record<ModDestId, number>;
    }

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const timeSec = now / 1000;

      const cam = refs.cameraRef.current;
      const eng = refs.synthRef.current;
      const fft = refs.fftRef.current;
      const viz = refs.vizRef.current;
      const lfoBank = refs.lfoBankRef.current;
      const camCfg = refs.cameraConfigRef.current;
      const scanCfg = refs.scanConfigRef.current;
      const synCfg = refs.synthConfigRef.current;
      const matrix = refs.matrixConfigRef.current;
      const vizCfg = refs.vizConfigRef.current;
      const modMatrix = refs.modMatrixRef.current;
      const bpm = refs.bpmRef.current;
      const modulated = modulatedRef.current!;

      // ── 0. Advance LFOs ──
      lfoBank?.update(timeSec, bpm);

      // ── 1. Resolve every mod destination's modulated value ──
      // base + Σ(lfo_i * send_i) * scale, clamped.
      // We need scanX in here too — at this point we haven't advanced this
      // frame's scan yet (sweep mode uses scanSpeed which can itself be
      // modulated). Use the previous frame's scan position as the base.
      const scanXBase = refs.scanXRef.current;
      for (const def of MOD_DESTINATIONS) {
        let sum = 0;
        // Inline 4 sends — the bank is fixed at 4 LFOs.
        for (let lfoIdx = 0; lfoIdx < 4; lfoIdx++) {
          const key = `lfo${lfoIdx + 1}.${def.id}` as keyof ModMatrix;
          const send = modMatrix[key] ?? 0;
          if (send !== 0 && lfoBank) {
            sum += lfoBank.getValue(lfoIdx) * send;
          }
        }
        const base = readModBase(def.id, camCfg, scanCfg, synCfg, matrix, vizCfg, scanXBase);
        let value = base + sum * def.scale;
        if (def.clamp) value = clamp(value, def.clamp[0], def.clamp[1]);
        modulated[def.id] = value;
      }

      // ── 2. Build live configs that overlay modulated values on user state ──
      const liveCamera: CameraConfig = {
        ...camCfg,
        threshold: modulated.cameraThreshold,
      };
      const liveScan: ScanConfig = {
        ...scanCfg,
        speed: modulated.scanSpeed,
      };
      // Matrix overlay — depth keys feed routeToDestinations.
      const liveMatrix: MatrixConfig = {
        ...matrix,
        filterCutoff: modulated.matrixFilterCutoffDepth,
        resonance:    modulated.matrixResonanceDepth,
        reverbSend:   modulated.matrixReverbSendDepth,
        delaySend:    modulated.matrixDelaySendDepth,
        pan:          modulated.matrixPanDepth,
        detune:       modulated.matrixDetuneDepth,
        waveformMorph: modulated.matrixWaveformMorphDepth,
      };
      // Synth overlay — master sends + sample loop range.
      // We only apply this each frame when something has actually changed
      // vs. the user's static base. Cheap to call applyConfig every frame
      // (it rampsTo), but slightly wasteful — gate by "any synth mod active".
      const synthModActive =
        modulated.masterVolume   !== synCfg.masterVolume   ||
        modulated.reverbWet      !== synCfg.reverbWet      ||
        modulated.delayWet       !== synCfg.delayWet       ||
        modulated.sampleLoopStart !== synCfg.sampleLoopStart ||
        modulated.sampleLoopEnd   !== synCfg.sampleLoopEnd;

      // ── 3. Camera frame → grey buffer → destination buffers ──
      if (cam?.active && eng?.initialized) {
        // Advance scan position using liveScan.speed (so modulated speed
        // takes effect this frame).
        if (liveScan.mode === "sweep") {
          let dir = 1;
          if (liveScan.direction === "left") dir = -1;
          else if (liveScan.direction === "bounce") dir = refs.sweepDirRef.current;
          refs.sweepTimeRef.current += dir * dt * liveScan.speed;
          let x = refs.sweepTimeRef.current;
          if (liveScan.direction === "bounce") {
            if (x >= 1) { x = 1 - (x - 1); refs.sweepDirRef.current = -1; refs.sweepTimeRef.current = x; }
            else if (x <= 0) { x = -x; refs.sweepDirRef.current = 1; refs.sweepTimeRef.current = x; }
          } else if (liveScan.loop) {
            x = ((x % 1) + 1) % 1;
            refs.sweepTimeRef.current = x;
          } else {
            x = Math.max(0, Math.min(1, x));
          }
          refs.scanXRef.current = x;
        } else {
          // Freeze mode — scanX is itself the modulated value.
          refs.scanXRef.current = modulated.scanX;
        }

        const frame = cam.getFrame();
        if (frame) {
          const CameraEngineCtor = cam.constructor as typeof CameraEngine;
          const gray = CameraEngineCtor.toGrayscale(frame, liveCamera);
          computeGrey(
            gray, frame.width, frame.height,
            synCfg.voices, liveScan.mode, refs.scanXRef.current,
            refs.greyRef.current,
          );
          routeToDestinations(refs.greyRef.current, liveMatrix, refs.buffersRef.current);
          eng.setVoiceState(refs.buffersRef.current, synCfg.attack, synCfg.release);
        }
      } else if (!cam?.active) {
        refs.greyRef.current.fill(0);
        const buf = refs.buffersRef.current;
        buf.volume.fill(0);
        for (const id of Object.keys(refs.matrixReadoutRef.current) as DestinationId[]) {
          refs.matrixReadoutRef.current[id] = 0;
        }
        if (eng?.initialized) {
          eng.setVoiceState(buf, 0.05, 0.5);
        }
      }

      // ── 4. Push modulated synth params (master vol + sends + loop) ──
      // applyConfig already rampsTo, so calling once per frame is fine when
      // modulation is active. Skip otherwise to avoid bus chatter.
      if (eng?.initialized && synthModActive) {
        eng.applyConfig({
          ...synCfg,
          masterVolume:    modulated.masterVolume,
          reverbWet:       modulated.reverbWet,
          delayWet:        modulated.delayWet,
          sampleLoopStart: modulated.sampleLoopStart,
          sampleLoopEnd:   modulated.sampleLoopEnd,
        });
      }

      // ── 5. Update matrix readout (mean across voices) ──
      const buf = refs.buffersRef.current;
      const voices = refs.greyRef.current.length;
      for (const def of DESTINATIONS) {
        const arr = buf[def.id];
        let sum = 0;
        for (let i = 0; i < voices; i++) sum += arr[i];
        refs.matrixReadoutRef.current[def.id] = voices > 0 ? sum / voices : 0;
      }

      // ── 6. Read FFT, drive visualiser with modulated viz params ──
      const reading = fft?.read();
      if (viz?.ready) {
        const time = now / 1000 - startTimeRef.current;
        viz.setPreset(vizCfg.preset);
        // Build the per-frame uniform map. Start with the user's params, then
        // overlay modulated viz destinations (GLITCH preset uniforms).
        const presetParams = vizCfg.params[vizCfg.preset] ?? {};
        const liveParams: Record<string, number> = { ...presetParams };
        if (vizCfg.preset === "glitch") {
          for (const id of Object.keys(VIZ_DEST_TO_UNIFORM) as ModDestId[]) {
            const uniform = VIZ_DEST_TO_UNIFORM[id];
            if (!uniform) continue;
            liveParams[uniform] = modulated[id];
          }
        }
        viz.update({
          time,
          bass: reading?.bass ?? 0,
          mid: reading?.mid ?? 0,
          treble: reading?.treble ?? 0,
          energy: reading?.energy ?? 0,
          beat: reading?.beat ?? false,
          voiceLevels: refs.buffersRef.current.volume,
          params: liveParams,
          cameraVideo: cam?.videoElement ?? null,
          cameraWidth: cam?.videoElement?.videoWidth ?? 1,
          cameraHeight: cam?.videoElement?.videoHeight ?? 1,
        });
        viz.draw();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // The hook intentionally captures only refs (which are stable). The
    // effect should run once and live forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
