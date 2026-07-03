"use client";

/**
 * Visualiser — audio-reactive shader instrument.
 *
 * The page is thin wiring:
 *   - State: presetId, presetParams, lfos, modMatrix, bpm, modBypass,
 *     audioState (from AudioSourceEngine subscription), vjMode.
 *   - Engines (via refs): AudioSourceEngine, FFTAnalyser, VisualiserGL, LFOBank.
 *   - Loop: useVisualiserLoop hook reads refs, drives the shader.
 *
 * All UI heavy lifting is in components/. All logic that isn't lifecycle
 * management is in engine/.
 *
 * Layout: fullscreen `<canvas>` at z-index 0, header bar + drawer overlaid
 * at z-index 10-20. VJ mode hides the chrome and (optionally) enters
 * browser fullscreen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import ShaderCanvas from "./components/ShaderCanvas";
import ControlPanel from "./components/ControlPanel";
import { AudioSourceEngine } from "./engine/audioSource";
import type { AudioSourceState } from "./engine/audioSource";
import { FFTAnalyser } from "@/lib/audio/fft";
import { VisualiserGL } from "@/lib/gfx/visualiserGL";
import * as Tone from "tone";
import { LFOBank, DEFAULT_LFO_CONFIG } from "@/lib/audio/lfo";
import type { LFOConfig } from "@/lib/audio/lfo";
import { PRESETS, PRESET_BY_ID, defaultPresetParams } from "./engine/presets";
import { useVisualiserLoop } from "./engine/useVisualiserLoop";
import { pruneMatrixForPreset } from "./engine/modDestinations";
import type { AudioSourceMode, ModMatrix, PresetId } from "./engine/types";
import type { VisualiserPatch } from "./engine/storage";

/** Sensible default 4-LFO patch: slow sine, medium tri, fast S&H, very slow saw. */
const DEFAULT_LFOS: LFOConfig[] = [
  { ...DEFAULT_LFO_CONFIG, shape: "sine",       rateHz: 0.5,  unipolar: false },
  { ...DEFAULT_LFO_CONFIG, shape: "triangle",   rateHz: 0.13, unipolar: false },
  { ...DEFAULT_LFO_CONFIG, shape: "sampleHold", rateHz: 2,    unipolar: true, smooth: 0.6 },
  { ...DEFAULT_LFO_CONFIG, shape: "saw",        rateHz: 0.07, unipolar: false },
];
const DEFAULT_BPM = 120;
const DEFAULT_PRESET: PresetId = "plasma";

export default function VisualiserPage() {
  /* ─── State ─── */
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET);
  const [presetParams, setPresetParams] = useState<Record<string, number>>(() =>
    defaultPresetParams(DEFAULT_PRESET),
  );
  const [lfos, setLfos] = useState<LFOConfig[]>(() => DEFAULT_LFOS.map((l) => ({ ...l })));
  const [modMatrix, setModMatrix] = useState<ModMatrix>({});
  const [bpm, setBpm] = useState<number>(DEFAULT_BPM);
  const [modBypass, setModBypass] = useState<boolean>(false);

  const [audioState, setAudioState] = useState<AudioSourceState>({
    mode: "silent", active: false, error: null, streamInfo: {},
  });
  const [webglFailed, setWebglFailed] = useState(false);
  const [vjMode, setVjMode] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile drawer state

  // Live band + LFO values for the header meter + routing-matrix meters.
  // Updated at ~30Hz from the loop via onLiveTick.
  const [liveBands, setLiveBands] = useState({ bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 });
  // Fixed-size Float32Array for the 4 LFOs (mirrors the loop's copy).
  const [lfoLiveValues, setLfoLiveValues] = useState<Float32Array>(() => new Float32Array(4));

  /* ─── Engine refs ─── */
  const audioEngineRef = useRef<AudioSourceEngine | null>(null);
  const fftRef = useRef<FFTAnalyser | null>(null);
  const vizRef = useRef<VisualiserGL<PresetId> | null>(null);
  const lfoBankRef = useRef<LFOBank | null>(null);
  /* ─── Per-frame config refs (mirror state so the loop sees latest) ─── */
  const presetDefRef = useRef(PRESET_BY_ID[DEFAULT_PRESET]);
  const presetParamsRef = useRef(presetParams);
  const modMatrixRef = useRef<ModMatrix>(modMatrix);
  const bpmRef = useRef<number>(bpm);
  const modBypassRef = useRef<boolean>(modBypass);
  const audioActiveRef = useRef<boolean>(false);

  useEffect(() => { presetDefRef.current = PRESET_BY_ID[presetId]; }, [presetId]);
  useEffect(() => { presetParamsRef.current = presetParams; }, [presetParams]);
  useEffect(() => { modMatrixRef.current = modMatrix; }, [modMatrix]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { modBypassRef.current = modBypass; }, [modBypass]);
  useEffect(() => { audioActiveRef.current = audioState.active && audioState.mode !== "silent"; }, [audioState]);

  // Sync LFOs -> LFOBank.
  useEffect(() => {
    if (!lfoBankRef.current) lfoBankRef.current = new LFOBank();
    lfoBankRef.current.setConfigs(lfos);
  }, [lfos]);

  /* ─── One-time engine + subscription setup ─── */
  useEffect(() => {
    // AudioSourceEngine — created eagerly so subscribe() works before start.
    const audioEngine = new AudioSourceEngine();
    audioEngineRef.current = audioEngine;
    const unsub = audioEngine.subscribe((state) => setAudioState(state));

    // FFTAnalyser — created but not connected. We wire it to the master gain
    // the first time the user starts a non-silent source.
    fftRef.current = new FFTAnalyser();

    // LFO bank.
    lfoBankRef.current = new LFOBank();
    lfoBankRef.current.setConfigs(DEFAULT_LFOS.map((l) => ({ ...l })));

    return () => {
      unsub();
      audioEngine.dispose();
      fftRef.current?.dispose();
      fftRef.current = null;
      vizRef.current?.dispose();
      vizRef.current = null;
    };
  }, []);

  /* ─── Canvas init ─── */
  const onCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    if (vizRef.current) return; // already inited
    const viz = new VisualiserGL<PresetId>(PRESETS);
    const ok = viz.init(canvas);
    if (!ok) {
      setWebglFailed(true);
      return;
    }
    viz.setPreset(presetId);
    vizRef.current = viz;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── Audio start/stop ─── */
  const onStartAudio = useCallback(async (mode: AudioSourceMode, opts?: { deviceId?: string; file?: File; loop?: boolean }) => {
    const engine = audioEngineRef.current;
    if (!engine) return;
    // Tone.start() must be called from a user gesture — the ⚙️ picker is
    // triggered by a click, so this is safe.
    await Tone.start();
    await engine.start(mode, opts);
    // Wire the FFT to the master gain. FFTAnalyser.connectFrom() accepts
    // a raw WebAudio AudioNode directly (see lib/audio/fft.ts) — no bridge
    // needed. This matches wireframe-terrain's proven pattern of
    // source.connect(analyser).
    const node = engine.getAudioNode();
    const fft = fftRef.current;
    if (fft && node) {
      fft.disconnect();
      fft.connectFrom(node);
    }
  }, []);

  const onStopAudio = useCallback(() => {
    audioEngineRef.current?.stop();
  }, []);

  /* ─── Preset switching ─── */
  const onPresetChange = useCallback((next: PresetId) => {
    if (next === presetId) return;
    setPresetId(next);
    // Reset params to the new preset's defaults.
    setPresetParams(defaultPresetParams(next));
    // Prune matrix entries pointing to uniforms that don't exist on the new
    // preset — but keep the ones that do (e.g. iVignette is common).
    setModMatrix((prev) => pruneMatrixForPreset(prev, PRESET_BY_ID[next]));
  }, [presetId]);

  const onParamChange = useCallback((uniform: string, value: number) => {
    setPresetParams((prev) => ({ ...prev, [uniform]: value }));
  }, []);

  const onResetParams = useCallback(() => {
    setPresetParams(defaultPresetParams(presetId));
  }, [presetId]);

  /* ─── Patch load ─── */
  const onLoadPatch = useCallback((patch: VisualiserPatch) => {
    setPresetId(patch.presetId);
    // The patch's params are only valid for the patch's preset — trust them.
    setPresetParams({ ...defaultPresetParams(patch.presetId), ...patch.presetParams });
    setLfos(patch.lfos.map((l) => ({ ...l })));
    setModMatrix(pruneMatrixForPreset(patch.modMatrix, PRESET_BY_ID[patch.presetId]));
    setBpm(patch.bpm);
  }, []);

  /* ─── VJ mode ─── */
  const toggleVjMode = useCallback(async () => {
    const next = !vjMode;
    setVjMode(next);
    setDrawerOpen(false);
    // Try to enter/exit real browser fullscreen. Ignore rejection (some
    // browsers reject if the user just clicked a "fake" fullscreen button).
    if (next) {
      try { await document.documentElement.requestFullscreen(); }
      catch { /* not fatal */ }
    } else {
      try { if (document.fullscreenElement) await document.exitFullscreen(); }
      catch { /* not fatal */ }
    }
  }, [vjMode]);

  // Sync VJ mode with browser fullscreen — if the user presses Esc, drop out.
  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement && vjMode) setVjMode(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [vjMode]);

  /* ─── Loop ─── */
  const liveSourceValuesRef = useRef<Float32Array>(new Float32Array(9));

  useVisualiserLoop({
    fftRef,
    vizRef,
    lfoBankRef,
    presetDefRef,
    presetParamsRef,
    modMatrixRef,
    bpmRef,
    modBypassRef,
    audioActiveRef,
    onLiveTick: useCallback((data: { bass: number; mid: number; treble: number; energy: number; beat: number; lfoValues: Float32Array }) => {
      const { bass, mid, treble, energy, beat, lfoValues } = data;
      // Publish band + LFO values to state (throttled to 30Hz by the loop).
      setLiveBands({ bass, mid, treble, energy, beat });
      // Copy LFO values into a stable Float32Array — React's === bail-out on
      // typed arrays would suppress re-renders if we mutated in place.
      const next = new Float32Array(4);
      next.set(lfoValues);
      setLfoLiveValues(next);
      // Update the flat 9-source array consumed by the RoutingMatrix meters.
      const arr = liveSourceValuesRef.current;
      arr[0] = bass; arr[1] = mid; arr[2] = treble; arr[3] = energy; arr[4] = beat;
      arr[5] = lfoValues[0]; arr[6] = lfoValues[1]; arr[7] = lfoValues[2]; arr[8] = lfoValues[3];
    }, []),
  });

  /* ─── Derived UI ─── */
  const currentPresetLabel = useMemo(() => PRESET_BY_ID[presetId].label, [presetId]);
  const audioLabel = useMemo(() => {
    if (!audioState.active) return "OFFLINE";
    switch (audioState.mode) {
      case "silent": return "SILENT";
      case "system": return "SYSTEM";
      case "tab":    return "TAB";
      case "mic":    return "MIC";
      case "file":   return "FILE";
    }
  }, [audioState.mode, audioState.active]);

  return (
    <ExperimentLayout title="Visualiser">
      {/* Fullscreen canvas at z-index 0 */}
      <ShaderCanvas onCanvasReady={onCanvasReady} fallbackVisible={webglFailed} />

      {/* Header bar — hidden in VJ mode */}
      {!vjMode && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-between gap-2 px-3 py-2 lg:pr-[26rem]"
          style={{ zIndex: 20 }}
        >
          {/* Left: title + audio pill (spaced from ExperimentLayout's back-link) */}
          <div className="flex items-center gap-2 pl-24">
            <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-wider transition-colors ${
              audioState.active
                ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/30"
                : "bg-white/5 text-white/40 border border-white/10"
            }`}>
              {audioLabel}
            </span>
            <span className="hidden sm:inline text-[9px] uppercase tracking-wider text-white/40">
              · {currentPresetLabel}
            </span>
          </div>

          {/* Right: VU meter + VJ toggle */}
          <div className="flex items-center gap-2">
            <VuMeter bands={liveBands} />
            <button
              onClick={toggleVjMode}
              className="px-2 py-1 rounded text-[9px] uppercase tracking-wider bg-white/10 hover:bg-white/20 text-white/70 transition-colors"
              title="Hide UI + go fullscreen"
            >
              VJ
            </button>
          </div>
        </div>
      )}

      {/* VJ-mode reveal corner — invisible hit target top-right to bring UI back */}
      {vjMode && (
        <button
          onClick={toggleVjMode}
          className="fixed top-0 right-0 w-16 h-16 opacity-0 hover:opacity-30 bg-white/50 transition-opacity"
          style={{ zIndex: 30 }}
          title="Exit VJ mode"
        />
      )}

      {/* Mobile drawer toggle FAB — visible only on mobile when drawer closed */}
      {!vjMode && !drawerOpen && (
        <button
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden fixed bottom-3 right-3 w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-sm border border-white/20 text-white/80 text-lg transition-colors"
          style={{ zIndex: 15 }}
          title="Open controls"
        >
          ⚙
        </button>
      )}

      {/* Drawer — hidden in VJ mode */}
      {!vjMode && (
        <ControlPanel
          audioEngine={audioEngineRef.current!}
          audioState={audioState}
          onStartAudio={onStartAudio}
          onStopAudio={onStopAudio}
          presetId={presetId}
          onPresetChange={onPresetChange}
          presetParams={presetParams}
          onParamChange={onParamChange}
          onResetParams={onResetParams}
          lfos={lfos}
          setLfos={setLfos}
          bpm={bpm}
          setBpm={setBpm}
          modBypass={modBypass}
          setModBypass={setModBypass}
          lfoLiveValues={lfoLiveValues}
          modMatrix={modMatrix}
          setModMatrix={setModMatrix}
          liveSourceValues={liveSourceValuesRef.current}
          onLoadPatch={onLoadPatch}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
        />
      )}
    </ExperimentLayout>
  );
}

/* ═══ Tiny VU meter for the header ════════════════════════════════════ */

function VuMeter({ bands }: { bands: { bass: number; mid: number; treble: number; beat: number } }) {
  return (
    <div className="hidden sm:flex items-end gap-0.5 h-4">
      <Bar value={bands.bass}   colour="rgba(255,90,90,0.85)" />
      <Bar value={bands.mid}    colour="rgba(90,220,120,0.85)" />
      <Bar value={bands.treble} colour="rgba(90,180,255,0.85)" />
      <div
        className="w-1 rounded-sm transition-colors"
        style={{
          height: "100%",
          background: bands.beat > 0.5 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.1)",
        }}
      />
    </div>
  );
}

function Bar({ value, colour }: { value: number; colour: string }) {
  return (
    <div className="w-1 rounded-sm bg-white/10 overflow-hidden" style={{ height: "100%" }}>
      <div style={{ height: `${Math.min(100, value * 100)}%`, background: colour, marginTop: `${100 - Math.min(100, value * 100)}%` }} />
    </div>
  );
}
