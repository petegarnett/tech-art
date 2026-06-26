"use client";

/**
 * Image Synth — webcam → polyphonic additive synth.
 *
 * Page is thin wiring: owns React state, the engine instances (camera + synth),
 * and the main animation loop. All heavy lifting lives in engine/ modules.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import CameraView from "./components/CameraView";
import ActivityMeter from "./components/ActivityMeter";
import ControlPanel from "./components/ControlPanel";
import { CameraEngine, listVideoInputs } from "./engine/camera";
import { SynthEngine } from "./engine/synth";
import { sonifyFrame } from "./engine/sonify";
import { buildNotes, midiToFreq } from "./engine/scales";
import type {
  CameraConfig,
  ScaleConfig,
  ScanConfig,
  SynthConfig,
  VoiceLevels,
} from "./engine/types";

const CAMERA_DEFAULTS: CameraConfig = {
  deviceId: "",
  threshold: 0.15,
  bw: false,
  invert: false,
  resolution: 256,
};
const SCAN_DEFAULTS: ScanConfig = {
  mode: "sweep",
  speed: 1,
  direction: "right",
  loop: true,
};
const SYNTH_DEFAULTS: SynthConfig = {
  waveform: "sine",
  attack: 0.05,
  release: 0.3,
  reverbWet: 0.25,
  delayWet: 0,
  masterVolume: 0.4,
  voices: 32,
};
const SCALE_DEFAULTS: ScaleConfig = {
  scale: "pentatonic",
  rootMidi: 36,
  octaves: 5,
};

export default function ImageSynthPage() {
  const [camera, setCamera] = useState<CameraConfig>(CAMERA_DEFAULTS);
  const [scan, setScan] = useState<ScanConfig>(SCAN_DEFAULTS);
  const [synth, setSynth] = useState<SynthConfig>(SYNTH_DEFAULTS);
  const [scale, setScale] = useState<ScaleConfig>(SCALE_DEFAULTS);
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showScanline, setShowScanline] = useState(true);

  // Refs for the draw loop — these mutate without re-rendering React.
  const cameraRef = useRef<CameraEngine | null>(null);
  const synthRef = useRef<SynthEngine | null>(null);
  const cameraConfigRef = useRef(camera);
  const scanConfigRef = useRef(scan);
  const synthConfigRef = useRef(synth);
  const levelsRef = useRef<VoiceLevels>(new Float32Array(SYNTH_DEFAULTS.voices));
  const scanXRef = useRef(0);
  const sweepDirRef = useRef(1); // for bounce mode
  const sweepTimeRef = useRef(0);

  // Sync state to refs so the rAF loop reads latest config.
  useEffect(() => { cameraConfigRef.current = camera; }, [camera]);
  useEffect(() => { scanConfigRef.current = scan; }, [scan]);
  useEffect(() => { synthConfigRef.current = synth; }, [synth]);

  // Init engines on mount, dispose on unmount.
  useEffect(() => {
    cameraRef.current = new CameraEngine();
    synthRef.current = new SynthEngine();
    return () => {
      cameraRef.current?.stop();
      synthRef.current?.dispose();
    };
  }, []);

  // Refresh device list on mount and expose a refresh action for the UI.
  const refreshDevices = useCallback(async () => {
    setDevices(await listVideoInputs());
  }, []);
  useEffect(() => {
    // Initial fetch of available cameras. setState here is the standard
    // "load from an external system" pattern, but the lint rule trips on the
    // synchronous wrapper call — schedule it as a microtask so the effect
    // body itself does not call setState synchronously.
    let cancelled = false;
    queueMicrotask(async () => {
      const list = await listVideoInputs();
      if (!cancelled) setDevices(list);
    });
    return () => { cancelled = true; };
  }, []);

  // When voices/scale/root/octaves change → rebuild oscillator bank.
  useEffect(() => {
    if (!synthRef.current?.initialized) return;
    const notes = buildNotes(scale.scale, scale.rootMidi, scale.octaves, synth.voices);
    const freqs = notes.map(midiToFreq);
    synthRef.current.rebuildVoices(freqs);
    levelsRef.current = new Float32Array(synth.voices);
  }, [scale.scale, scale.rootMidi, scale.octaves, synth.voices]);

  // Apply synth config (waveform/effects/volume) without rebuilding voices.
  useEffect(() => {
    synthRef.current?.applyConfig(synth);
  }, [synth]);

  // Apply resolution changes without restarting the camera.
  useEffect(() => {
    if (cameraRef.current?.active) {
      cameraRef.current.setResolution(camera.resolution);
    }
  }, [camera.resolution]);

  /* ─── Actions ─── */

  const startCamera = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;
    try {
      setCameraError(null);
      await cam.start(camera);
      setCameraActive(true);
      refreshDevices(); // labels populate after permission
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
      setCameraActive(false);
    }
  }, [camera, refreshDevices]);

  const stopCamera = useCallback(async () => {
    await cameraRef.current?.stop();
    setCameraActive(false);
    levelsRef.current.fill(0);
  }, []);

  const startAudio = useCallback(async () => {
    const eng = synthRef.current;
    if (!eng) return;
    try {
      await eng.init();
      const notes = buildNotes(scale.scale, scale.rootMidi, scale.octaves, synth.voices);
      eng.rebuildVoices(notes.map(midiToFreq));
      eng.applyConfig(synth);
      setAudioActive(true);
    } catch (err) {
      console.error("Audio init failed:", err);
      setAudioActive(false);
    }
  }, [scale, synth]);

  const stopAudio = useCallback(async () => {
    await synthRef.current?.dispose();
    synthRef.current = new SynthEngine();
    setAudioActive(false);
  }, []);

  /* ─── Main animation loop ─── */

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      const cam = cameraRef.current;
      const eng = synthRef.current;
      const camCfg = cameraConfigRef.current;
      const scanCfg = scanConfigRef.current;
      const synCfg = synthConfigRef.current;

      if (cam?.active && eng?.initialized) {
        // Advance scan position
        if (scanCfg.mode === "sweep") {
          let dir = 1;
          if (scanCfg.direction === "left") dir = -1;
          else if (scanCfg.direction === "bounce") dir = sweepDirRef.current;
          sweepTimeRef.current += dir * dt * scanCfg.speed;
          let x = sweepTimeRef.current;
          if (scanCfg.direction === "bounce") {
            if (x >= 1) { x = 1 - (x - 1); sweepDirRef.current = -1; sweepTimeRef.current = x; }
            else if (x <= 0) { x = -x; sweepDirRef.current = 1; sweepTimeRef.current = x; }
          } else if (scanCfg.loop) {
            x = ((x % 1) + 1) % 1;
            sweepTimeRef.current = x;
          } else {
            x = Math.max(0, Math.min(1, x));
          }
          scanXRef.current = x;
        } else {
          // freeze — scanline irrelevant
          scanXRef.current = 0.5;
        }

        // Pull current frame
        const frame = cam.getFrame();
        if (frame) {
          const gray = CameraEngine.toGrayscale(frame, camCfg);
          sonifyFrame(
            gray,
            frame.width,
            frame.height,
            synCfg.voices,
            scanCfg.mode,
            scanXRef.current,
            levelsRef.current,
          );
          eng.setLevels(levelsRef.current, synCfg.attack, synCfg.release);
        }
      } else if (!cam?.active) {
        // Camera off → drop all levels
        levelsRef.current.fill(0);
        if (eng?.initialized) eng.setLevels(levelsRef.current, 0.05, 0.5);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ─── Render ─── */

  return (
    <ExperimentLayout title="Image Synth">
      <div className="w-full h-auto lg:h-full flex flex-col lg:flex-row pt-12">
        {/* Camera + scanline + activity meter on left */}
        <div className="h-[55vh] lg:h-auto lg:flex-1 relative min-h-0 flex">
          <div className="flex-1 relative">
            <CameraView
              cameraRef={cameraRef}
              configRef={cameraConfigRef}
              scanXRef={scanXRef}
              showScanline={showScanline && scan.mode === "sweep"}
              levelsRef={levelsRef}
            />
          </div>
          {/* Activity meter strip on right of camera */}
          <div className="w-10 lg:w-12 border-l border-white/10 bg-black/40">
            <ActivityMeter levelsRef={levelsRef} />
          </div>
        </div>

        <ControlPanel
          camera={camera}
          setCamera={setCamera}
          scan={scan}
          setScan={setScan}
          synth={synth}
          setSynth={setSynth}
          scale={scale}
          setScale={setScale}
          devices={devices}
          onRefreshDevices={refreshDevices}
          cameraActive={cameraActive}
          onStartCamera={startCamera}
          onStopCamera={stopCamera}
          audioActive={audioActive}
          onStartAudio={startAudio}
          onStopAudio={stopAudio}
          cameraError={cameraError}
          showScanline={showScanline}
          setShowScanline={setShowScanline}
        />
      </div>
    </ExperimentLayout>
  );
}
