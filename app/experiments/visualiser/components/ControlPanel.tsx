"use client";

/**
 * ControlPanel — the tabbed drawer overlaid on the fullscreen shader.
 *
 * 6 tabs: SOURCE / PRESET / PARAMS / LFO / MATRIX / PATCHES.
 * Follows Image Synth's module-button-tab-row pattern.
 *
 * Layout:
 *   - Desktop (lg+): right-side vertical panel, w-96, full-height, scrollable.
 *   - Mobile: bottom drawer, max-h-70dvh, slide-up.
 *
 * Rendered at z-index 10 on top of the fullscreen canvas at z-index 0.
 * A semi-transparent dark background keeps the shader visible behind.
 */

import { useState } from "react";
import Knob from "@/components/Knob";
import AudioSourcePicker from "./AudioSourcePicker";
import LFOSection from "./LFOSection";
import RoutingMatrix from "./RoutingMatrix";
import PatchList from "./PatchList";
import { PRESETS, PRESET_BY_ID } from "../engine/presets";
import type { PresetDef } from "@/lib/gfx/types";
import type { LFOConfig } from "@/lib/audio/lfo";
import type { AudioSourceEngine, AudioSourceState } from "../engine/audioSource";
import type { AudioSourceMode, ModMatrix, PresetId } from "../engine/types";
import type { VisualiserPatch } from "../engine/storage";

type Tab = "source" | "preset" | "params" | "lfo" | "matrix" | "patches";

const TABS: { id: Tab; icon: string; label: string; short: string }[] = [
  { id: "source",  icon: "🎧", label: "Source",  short: "SRC" },
  { id: "preset",  icon: "✨", label: "Preset",  short: "PST" },
  { id: "params",  icon: "🎚️", label: "Params",  short: "PRM" },
  { id: "lfo",     icon: "🌊", label: "LFO",     short: "LFO" },
  { id: "matrix",  icon: "🔀", label: "Matrix",  short: "MTX" },
  { id: "patches", icon: "💾", label: "Patches", short: "PCH" },
];

interface Props {
  /* Audio */
  audioEngine: AudioSourceEngine;
  audioState: AudioSourceState;
  onStartAudio: (mode: AudioSourceMode, opts?: { deviceId?: string; file?: File; loop?: boolean }) => Promise<void>;
  onStopAudio: () => void;

  /* Preset */
  presetId: PresetId;
  onPresetChange: (id: PresetId) => void;

  /* Params */
  presetParams: Record<string, number>;
  onParamChange: (uniform: string, value: number) => void;
  onResetParams: () => void;

  /* LFO */
  lfos: LFOConfig[];
  setLfos: (lfos: LFOConfig[]) => void;
  bpm: number;
  setBpm: (n: number) => void;
  modBypass: boolean;
  setModBypass: (b: boolean) => void;
  lfoLiveValues: Float32Array;

  /* Matrix */
  modMatrix: ModMatrix;
  setModMatrix: (m: ModMatrix) => void;
  liveSourceValues: Float32Array; // length 9

  /* Patches */
  onLoadPatch: (patch: VisualiserPatch) => void;

  /* Mobile drawer state */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

export default function ControlPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("source");
  const preset = PRESET_BY_ID[props.presetId];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 lg:top-0 lg:bottom-0 lg:right-0 lg:left-auto lg:h-full lg:w-96 lg:max-h-none lg:border-l border-t lg:border-t-0 border-white/10 bg-black/75 backdrop-blur-md overflow-y-auto touch-manipulation transition-transform ${
        props.drawerOpen ? "translate-y-0" : "translate-y-full lg:translate-y-0 lg:translate-x-0"
      }`}
      style={{ zIndex: 10, maxHeight: "70dvh" }}
    >
      {/* Mobile drawer handle — pull-tab visible only on mobile */}
      <div className="lg:hidden flex justify-center py-1.5 border-b border-white/10">
        <button
          onClick={() => props.setDrawerOpen(false)}
          className="w-10 h-1 rounded-full bg-white/30 hover:bg-white/50 transition-colors"
          aria-label="Close controls"
        />
      </div>

      <div className="p-3 space-y-3">
        {/* ─── Tab row ─── */}
        <div className="grid grid-cols-6 gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-1.5 rounded text-[9px] uppercase tracking-wider transition-colors flex flex-col items-center gap-0.5 ${
                tab === t.id
                  ? "bg-white/15 text-white/80"
                  : "bg-white/5 text-white/40 hover:bg-white/10"
              }`}
              title={t.label}
            >
              <span className="text-sm leading-none">{t.icon}</span>
              <span className="leading-none">{t.short}</span>
            </button>
          ))}
        </div>

        {/* ─── Tab content ─── */}
        <div>
          {tab === "source" && (
            <AudioSourcePicker
              engine={props.audioEngine}
              state={props.audioState}
              onStart={props.onStartAudio}
              onStop={props.onStopAudio}
            />
          )}

          {tab === "preset" && (
            <PresetTab
              presetId={props.presetId}
              onChange={props.onPresetChange}
            />
          )}

          {tab === "params" && (
            <ParamsTab
              preset={preset}
              params={props.presetParams}
              onParamChange={props.onParamChange}
              onReset={props.onResetParams}
            />
          )}

          {tab === "lfo" && (
            <LFOSection
              lfos={props.lfos}
              setLfos={props.setLfos}
              bpm={props.bpm}
              setBpm={props.setBpm}
              modBypass={props.modBypass}
              setModBypass={props.setModBypass}
              lfoLiveValues={props.lfoLiveValues}
            />
          )}

          {tab === "matrix" && (
            <RoutingMatrix
              preset={preset}
              modMatrix={props.modMatrix}
              setModMatrix={props.setModMatrix}
              liveSourceValues={props.liveSourceValues}
            />
          )}

          {tab === "patches" && (
            <PatchList
              presetId={props.presetId}
              presetParams={props.presetParams}
              lfos={props.lfos}
              modMatrix={props.modMatrix}
              bpm={props.bpm}
              onLoad={props.onLoadPatch}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ Preset picker ═══════════════════════════════════════════════════ */

function PresetTab({ presetId, onChange }: { presetId: PresetId; onChange: (id: PresetId) => void }) {
  return (
    <div className="space-y-2">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`w-full text-left p-2 rounded border transition-colors ${
            presetId === p.id
              ? "border-emerald-400/50 bg-emerald-400/5"
              : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-white/80 font-medium">{p.label}</span>
            {presetId === p.id && (
              <span className="text-[8px] text-emerald-300/70">ACTIVE</span>
            )}
          </div>
          <p className="text-[9px] text-white/40 leading-relaxed">{p.description}</p>
        </button>
      ))}
      <p className="text-[9px] text-white/30 leading-relaxed pt-1">
        Switching preset resets params to defaults — LFOs and matrix routes are kept (routes referring to uniforms that don&apos;t exist on the new preset are dropped).
      </p>
    </div>
  );
}

/* ═══ Params tab ══════════════════════════════════════════════════════ */

function ParamsTab({
  preset, params, onParamChange, onReset,
}: {
  preset: PresetDef<PresetId>;
  params: Record<string, number>;
  onParamChange: (uniform: string, value: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider bg-white/[0.03] border border-white/10 rounded px-2 py-1.5">
        <span className="text-white/50">{preset.label} — {preset.params.length} knobs</span>
        <button
          onClick={onReset}
          className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 text-white/60 transition-colors"
          title="Reset all knobs to their default"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {preset.params.map((p) => {
          const value = params[p.name] ?? p.default;
          return (
            <div key={p.name} className="flex flex-col items-center gap-0.5 p-1 rounded bg-white/[0.02]">
              <Knob
                value={value}
                onChange={(v) => onParamChange(p.name, v)}
                size={36}
                label={p.label}
              />
              <span className="text-[8px] uppercase tracking-wider text-white/50 text-center leading-tight">
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
