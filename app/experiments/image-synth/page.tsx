"use client";

/**
 * Image Synth — webcam → polyphonic synth + audio-reactive WebGL visualiser.
 *
 * Page is thin wiring: owns React state, the engine instances
 * (camera + synth + FFT + visualiser), and dispatches the main loop via the
 * useImageSynthLoop hook.
 *
 * Heavy lifting lives in engine/*. UI lives in components/*.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import CameraView from "./components/CameraView";
import ActivityMeter from "./components/ActivityMeter";
import ControlPanel from "./components/ControlPanel";
import VisualiserView from "./components/VisualiserView";
import { CameraEngine, listVideoInputs } from "./engine/camera";
import { SynthEngine } from "./engine/synth";
import { FFTAnalyser } from "./engine/fft";
import { VisualiserGL } from "./engine/visualiserGL";
import { buildNotes, midiToFreq } from "./engine/scales";
import { defaultAllPresetParams } from "./engine/presets";
import { useImageSynthLoop } from "./engine/useImageSynthLoop";
import {
  DEFAULT_MATRIX,
  DESTINATION_IDS,
  makeVoiceStateBuffers,
} from "./engine/types";
import type {
  CameraConfig,
  DestinationId,
  MatrixConfig,
  ScaleConfig,
  ScanConfig,
  SynthConfig,
  VizConfig,
  VoiceLevels,
  VoiceStateBuffers,
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
  source: "oscillator",
  waveform: "sine",
  waveformSecondary: "triangle",
  attack: 0.05,
  release: 0.3,
  reverbWet: 0.25,
  delayWet: 0,
  masterVolume: 0.4,
  voices: 32,
  sampleBaseMidi: 60,
  sampleLoopStart: 0,
  sampleLoopEnd: 1,
};
const SCALE_DEFAULTS: ScaleConfig = {
  scale: "pentatonic",
  rootMidi: 36,
  octaves: 5,
};

export default function ImageSynthPage() {
  /* ─── State ─── */
  const [camera, setCamera] = useState<CameraConfig>(CAMERA_DEFAULTS);
  const [scan, setScan] = useState<ScanConfig>(SCAN_DEFAULTS);
  const [synth, setSynth] = useState<SynthConfig>(SYNTH_DEFAULTS);
  const [scale, setScale] = useState<ScaleConfig>(SCALE_DEFAULTS);
  const [matrix, setMatrix] = useState<MatrixConfig>({ ...DEFAULT_MATRIX });
  const [viz, setViz] = useState<VizConfig>({
    preset: "glitch",
    composition: "camera-only", // default: identical to v1
    params: defaultAllPresetParams(),
  });
  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showScanline, setShowScanline] = useState(true);
  const [sampleName, setSampleName] = useState<string | null>(null);
  const [sampleDuration, setSampleDuration] = useState(0);

  /* ─── Engine refs ─── */
  const cameraRef = useRef<CameraEngine | null>(null);
  const synthRef = useRef<SynthEngine | null>(null);
  const fftRef = useRef<FFTAnalyser | null>(null);
  const vizRef = useRef<VisualiserGL | null>(null);

  /* ─── Per-frame config refs (read inside the rAF loop) ─── */
  const cameraConfigRef = useRef(camera);
  const scanConfigRef = useRef(scan);
  const synthConfigRef = useRef(synth);
  const matrixConfigRef = useRef(matrix);
  const vizConfigRef = useRef(viz);
  const greyRef = useRef<VoiceLevels>(new Float32Array(SYNTH_DEFAULTS.voices));
  const buffersRef = useRef<VoiceStateBuffers>(makeVoiceStateBuffers(SYNTH_DEFAULTS.voices));
  // Stable ref to the active volume Float32Array — passed to CameraView /
  // ActivityMeter. Hydrated by an effect from buffersRef.current.volume; do
  // not initialise from buffersRef.current here (refs are off-limits during render).
  const volumeRef = useRef<VoiceLevels>(new Float32Array(SYNTH_DEFAULTS.voices));
  const matrixReadoutRef = useRef<Record<DestinationId, number>>(
    Object.fromEntries(DESTINATION_IDS.map((id) => [id, 0])) as Record<DestinationId, number>,
  );
  const scanXRef = useRef(0);
  const sweepDirRef = useRef(1);
  const sweepTimeRef = useRef(0);

  // Mirror state to refs each render so the loop reads latest.
  useEffect(() => { cameraConfigRef.current = camera; }, [camera]);
  useEffect(() => { scanConfigRef.current = scan; }, [scan]);
  useEffect(() => { synthConfigRef.current = synth; }, [synth]);
  useEffect(() => { matrixConfigRef.current = matrix; }, [matrix]);
  useEffect(() => { vizConfigRef.current = viz; }, [viz]);

  /* ─── Engine lifecycle ─── */
  useEffect(() => {
    cameraRef.current = new CameraEngine();
    synthRef.current = new SynthEngine();
    fftRef.current = new FFTAnalyser();
    // Wire volumeRef to the live volume Float32Array.
    volumeRef.current = buffersRef.current.volume;
    return () => {
      cameraRef.current?.stop();
      synthRef.current?.dispose();
      fftRef.current?.dispose();
    };
  }, []);

  /* ─── Devices list ─── */
  const refreshDevices = useCallback(async () => {
    setDevices(await listVideoInputs());
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      const list = await listVideoInputs();
      if (!cancelled) setDevices(list);
    });
    return () => { cancelled = true; };
  }, []);

  /* ─── Voice rebuild on scale/voices/source change ─── */
  useEffect(() => {
    if (!synthRef.current?.initialized) return;
    const notes = buildNotes(scale.scale, scale.rootMidi, scale.octaves, synth.voices);
    const freqs = notes.map(midiToFreq);
    // applyConfig is handled by the dedicated effect below; here we only
    // rebuild voices when the count or source mode changes.
    synthRef.current.rebuildVoices(freqs);
    // Resize per-frame buffers if voice count changed.
    if (greyRef.current.length !== synth.voices) {
      greyRef.current = new Float32Array(synth.voices);
      buffersRef.current = makeVoiceStateBuffers(synth.voices);
      volumeRef.current = buffersRef.current.volume;
    }
  }, [scale.scale, scale.rootMidi, scale.octaves, synth.voices, synth.source]);

  /* ─── Apply config (waveforms, master sends, loop range, base note) ─── */
  useEffect(() => {
    synthRef.current?.applyConfig(synth);
  }, [synth]);

  /* ─── Camera resolution mid-stream ─── */
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
      refreshDevices();
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
      setCameraActive(false);
    }
  }, [camera, refreshDevices]);

  const stopCamera = useCallback(async () => {
    await cameraRef.current?.stop();
    setCameraActive(false);
    greyRef.current.fill(0);
    buffersRef.current.volume.fill(0);
  }, []);

  const startAudio = useCallback(async () => {
    const eng = synthRef.current;
    const fft = fftRef.current;
    if (!eng) return;
    try {
      await eng.init();
      const notes = buildNotes(scale.scale, scale.rootMidi, scale.octaves, synth.voices);
      eng.applyConfig(synth);
      eng.rebuildVoices(notes.map(midiToFreq));
      // Hook the FFT analyser to the master bus.
      fft?.connectFrom(eng.analyserSource);
      setAudioActive(true);
    } catch (err) {
      console.error("Audio init failed:", err);
      setAudioActive(false);
    }
  }, [scale, synth]);

  const stopAudio = useCallback(async () => {
    fftRef.current?.disconnect();
    await synthRef.current?.dispose();
    synthRef.current = new SynthEngine();
    setAudioActive(false);
  }, []);

  const onLoadSample = useCallback(async (file: File) => {
    const eng = synthRef.current;
    if (!eng) return;
    if (!eng.initialized) await eng.init();
    const buf = await file.arrayBuffer();
    const { duration } = await eng.loadSample(buf);
    setSampleName(file.name);
    setSampleDuration(duration);
    // If we're in sample mode but voices haven't been built yet (e.g. user
    // toggled SAMPLE before pressing Start Audio), build them now.
    if (synth.source === "sample") {
      const notes = buildNotes(scale.scale, scale.rootMidi, scale.octaves, synth.voices);
      eng.rebuildVoices(notes.map(midiToFreq));
    }
  }, [synth.source, synth.voices, scale.scale, scale.rootMidi, scale.octaves]);

  /* ─── Main animation loop ─── */
  useImageSynthLoop({
    cameraRef, synthRef, fftRef, vizRef,
    cameraConfigRef, scanConfigRef, synthConfigRef, matrixConfigRef, vizConfigRef,
    greyRef, buffersRef, matrixReadoutRef,
    scanXRef, sweepDirRef, sweepTimeRef,
  });

  /* ─── Visualiser engine factory (stable identity) ─── */
  const makeVizEngine = useMemo(() => () => new VisualiserGL(), []);

  /* ─── Render ─── */
  const cameraOpacity = viz.composition === "viz-underlay" ? 0.5
    : viz.composition === "viz-only" ? 0
    : 1;
  const cameraVisible = viz.composition !== "viz-only";

  return (
    <ExperimentLayout title="Image Synth">
      <div className="w-full h-auto lg:h-full flex flex-col lg:flex-row pt-12">
        {/* Left: stacked canvases (camera + viz) + activity meter */}
        <div className="h-[55vh] lg:h-auto lg:flex-1 relative min-h-0 flex">
          <div className="flex-1 relative">
            {/* Camera layer */}
            <div
              className="absolute inset-0"
              style={{
                opacity: cameraOpacity,
                display: cameraVisible ? "block" : "none",
                zIndex: viz.composition === "viz-underlay" ? 2 : 1,
              }}
            >
              <CameraView
                cameraRef={cameraRef}
                configRef={cameraConfigRef}
                scanXRef={scanXRef}
                showScanline={showScanline && scan.mode === "sweep"}
                levelsRef={volumeRef}
              />
            </div>
            {/* Visualiser layer */}
            <div
              className="absolute inset-0"
              style={{ zIndex: viz.composition === "viz-underlay" ? 1 : 2 }}
            >
              <VisualiserView
                engineRef={vizRef}
                makeEngine={makeVizEngine}
                composition={viz.composition}
              />
            </div>
          </div>
          {/* Activity meter */}
          <div className="w-10 lg:w-12 border-l border-white/10 bg-black/40 relative z-10">
            <ActivityMeter levelsRef={volumeRef} />
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
          matrix={matrix}
          setMatrix={setMatrix}
          viz={viz}
          setViz={setViz}
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
          matrixReadoutRef={matrixReadoutRef}
          sampleName={sampleName}
          sampleDuration={sampleDuration}
          onLoadSample={onLoadSample}
        />
      </div>
    </ExperimentLayout>
  );
}
