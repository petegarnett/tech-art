"use client";

/**
 * useImageSynthLoop — the main rAF loop, factored out of page.tsx.
 *
 * Reads refs (engines + per-frame configs), computes the per-frame state,
 * pushes it to the audio engine, ticks the FFT analyser, and asks the
 * visualiser to draw. No React state mutations from inside the loop.
 *
 * The hook returns nothing; it's purely a side-effecting "engine driver".
 */
import { useEffect, useRef } from "react";
import { CameraEngine } from "./camera";
import type { SynthEngine } from "./synth";
import type { FFTAnalyser } from "./fft";
import type { VisualiserGL } from "./visualiserGL";
import { computeGrey, routeToDestinations } from "./sonify";
import { DESTINATIONS } from "./destinations";
import type {
  CameraConfig,
  DestinationId,
  MatrixConfig,
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
  cameraConfigRef: React.MutableRefObject<CameraConfig>;
  scanConfigRef: React.MutableRefObject<ScanConfig>;
  synthConfigRef: React.MutableRefObject<SynthConfig>;
  matrixConfigRef: React.MutableRefObject<MatrixConfig>;
  vizConfigRef: React.MutableRefObject<VizConfig>;
  greyRef: React.MutableRefObject<VoiceLevels>;
  buffersRef: React.MutableRefObject<VoiceStateBuffers>;
  /** Mean modulated value per destination across all voices — for live UI readout. */
  matrixReadoutRef: React.MutableRefObject<Record<DestinationId, number>>;
  scanXRef: React.MutableRefObject<number>;
  sweepDirRef: React.MutableRefObject<number>;
  sweepTimeRef: React.MutableRefObject<number>;
}

export function useImageSynthLoop(refs: LoopRefs) {
  // Wall-clock start time for the visualiser's iTime uniform.
  const startTimeRef = useRef(performance.now() / 1000);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      const cam = refs.cameraRef.current;
      const eng = refs.synthRef.current;
      const fft = refs.fftRef.current;
      const viz = refs.vizRef.current;
      const camCfg = refs.cameraConfigRef.current;
      const scanCfg = refs.scanConfigRef.current;
      const synCfg = refs.synthConfigRef.current;
      const matrix = refs.matrixConfigRef.current;
      const vizCfg = refs.vizConfigRef.current;

      // ── 1. Camera frame → grey buffer → destination buffers ──
      if (cam?.active && eng?.initialized) {
        // Advance scan position
        if (scanCfg.mode === "sweep") {
          let dir = 1;
          if (scanCfg.direction === "left") dir = -1;
          else if (scanCfg.direction === "bounce") dir = refs.sweepDirRef.current;
          refs.sweepTimeRef.current += dir * dt * scanCfg.speed;
          let x = refs.sweepTimeRef.current;
          if (scanCfg.direction === "bounce") {
            if (x >= 1) { x = 1 - (x - 1); refs.sweepDirRef.current = -1; refs.sweepTimeRef.current = x; }
            else if (x <= 0) { x = -x; refs.sweepDirRef.current = 1; refs.sweepTimeRef.current = x; }
          } else if (scanCfg.loop) {
            x = ((x % 1) + 1) % 1;
            refs.sweepTimeRef.current = x;
          } else {
            x = Math.max(0, Math.min(1, x));
          }
          refs.scanXRef.current = x;
        } else {
          refs.scanXRef.current = 0.5;
        }

        const frame = cam.getFrame();
        if (frame) {
          // We need a grayscale Float32Array — toGrayscale allocates. To
          // avoid GC pressure we accept that allocation per frame (it's
          // ~64-200KB, GC-friendly). Same shape as v1.
          const CameraEngineCtor = cam.constructor as typeof CameraEngine;
          const gray = CameraEngineCtor.toGrayscale(frame, camCfg);
          computeGrey(
            gray, frame.width, frame.height,
            synCfg.voices, scanCfg.mode, refs.scanXRef.current,
            refs.greyRef.current,
          );
          routeToDestinations(refs.greyRef.current, matrix, refs.buffersRef.current);
          eng.setVoiceState(refs.buffersRef.current, synCfg.attack, synCfg.release);
        }
      } else if (!cam?.active) {
        // No camera → silence: zero everything and let release ramp.
        refs.greyRef.current.fill(0);
        const buf = refs.buffersRef.current;
        buf.volume.fill(0);
        // Other destinations: leave alone; release on volume will silence the
        // bus. We zero the readout however so the UI doesn't show stale values.
        for (const id of Object.keys(refs.matrixReadoutRef.current) as DestinationId[]) {
          refs.matrixReadoutRef.current[id] = 0;
        }
        if (eng?.initialized) {
          eng.setVoiceState(buf, 0.05, 0.5);
        }
      }

      // ── 2. Update matrix readout (mean across voices) ──
      const buf = refs.buffersRef.current;
      const voices = refs.greyRef.current.length;
      for (const def of DESTINATIONS) {
        const arr = buf[def.id];
        let sum = 0;
        for (let i = 0; i < voices; i++) sum += arr[i];
        refs.matrixReadoutRef.current[def.id] = voices > 0 ? sum / voices : 0;
      }

      // ── 3. Read FFT analyser, drive visualiser ──
      const reading = fft?.read();
      if (viz?.ready) {
        const time = now / 1000 - startTimeRef.current;
        viz.setPreset(vizCfg.preset);
        viz.update({
          time,
          bass: reading?.bass ?? 0,
          mid: reading?.mid ?? 0,
          treble: reading?.treble ?? 0,
          energy: reading?.energy ?? 0,
          beat: reading?.beat ?? false,
          voiceLevels: refs.buffersRef.current.volume,
          params: vizCfg.params[vizCfg.preset] ?? {},
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

