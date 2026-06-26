"use client";

/**
 * ControlPanel — tabbed UI for the wireframe terrain experiment.
 *
 * Tabs:
 *   - TERRAIN: visual parameter sliders (amp/speed/freq/grid/tilt/line) + reset
 *   - AUDIO:   source selector (none/mic/tab), device picker, start/stop,
 *              status + error, global sensitivity, spectrum analyser
 *   - MATRIX:  preset dropdown, clear, the 6×8 routing grid
 *   - ZONES:   top-down editor + per-zone params (band, hardness, destinations, tint)
 *   - COLOUR:  base colour, gradient toggle, gradient A/B, preset gradients
 */

import { useEffect, useRef, useState } from "react";
import {
  BAND_IDS,
  DESTINATION_IDS,
} from "../engine/types";
import type {
  AudioSource,
  AudioStatus,
  BandId,
  BandLevels,
  DestinationId,
  RoutingMatrix,
} from "../engine/types";
import { PRESETS, type PresetId, emptyMatrix } from "../engine/routing";
import {
  loadPatches,
  savePatch,
  deletePatch,
  type SavedPatch,
} from "../engine/storage";
import { GRADIENT_PRESETS, type GradientPreset } from "../engine/colour";
import { MAX_ZONES, newZone, type Zone } from "../engine/zones";
import SpectrumAnalyser from "./SpectrumAnalyser";
import RoutingMatrixView from "./RoutingMatrix";
import ZoneEditor from "./ZoneEditor";
import ZoneParams from "./ZoneParams";

type Tab = "terrain" | "audio" | "matrix" | "zones" | "colour";

const TABS: { id: Tab; label: string }[] = [
  { id: "terrain", label: "Terrain" },
  { id: "audio", label: "Audio" },
  { id: "matrix", label: "Matrix" },
  { id: "zones", label: "Zones" },
  { id: "colour", label: "Colour" },
];

export interface TerrainParams {
  amplitude: number;
  speed: number;
  frequency: number;
  gridDensity: number;
  tilt: number;
  lineWidth: number;
  brightness: number;
}

export const TERRAIN_DEFAULTS: TerrainParams = {
  amplitude: 80,
  speed: 1,
  frequency: 0.015,
  gridDensity: 40,
  tilt: 0.6,
  lineWidth: 1,
  brightness: 1.4,
};

export interface ColourState {
  baseColor: string;
  gradientMode: boolean;
  gradientA: string;
  gradientB: string;
}

interface Props {
  // Terrain
  terrain: TerrainParams;
  setTerrain: (next: TerrainParams) => void;

  // Audio
  source: AudioSource;
  setSource: (s: AudioSource) => void;
  deviceId: string;
  setDeviceId: (id: string) => void;
  devices: { deviceId: string; label: string }[];
  onRefreshDevices: () => void;
  onStart: () => void;
  onStop: () => void;
  audioStatus: AudioStatus;
  sensitivity: number;
  setSensitivity: (n: number) => void;
  levelsRef: React.MutableRefObject<BandLevels>;

  // Matrix
  matrix: RoutingMatrix;
  setMatrix: (m: RoutingMatrix) => void;

  // Zones
  zones: Zone[];
  setZones: (next: Zone[]) => void;

  // Colour
  colour: ColourState;
  setColour: (c: ColourState) => void;
}

export default function ControlPanel(props: Props) {
  const [tab, setTab] = useState<Tab>("terrain");
  const [preset, setPreset] = useState<PresetId>("off");

  // User-saved patches in localStorage. Hydrate on mount so SSR matches.
  const [savedPatches, setSavedPatches] = useState<SavedPatch[]>([]);
  const [newPatchName, setNewPatchName] = useState("");
  useEffect(() => {
    setSavedPatches(loadPatches());
  }, []);

  const {
    terrain,
    setTerrain,
    source,
    setSource,
    deviceId,
    setDeviceId,
    devices,
    onRefreshDevices,
    onStart,
    onStop,
    audioStatus,
    sensitivity,
    setSensitivity,
    levelsRef,
    matrix,
    setMatrix,
    zones,
    setZones,
    colour,
    setColour,
  } = props;

  /* ─── Zones ─── */

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  // Round-robin band for newly-added zones — cycles SUB → AIR.
  const addBandIndexRef = useRef(0);

  /** Add a new zone at the given normalised coords. Capped at MAX_ZONES. */
  const addZone = (x: number, z: number) => {
    if (zones.length >= MAX_ZONES) return;
    const band = BAND_IDS[addBandIndexRef.current % BAND_IDS.length];
    addBandIndexRef.current = (addBandIndexRef.current + 1) % BAND_IDS.length;
    const zone = newZone(x, z, band);
    setZones([...zones, zone]);
    setSelectedZoneId(zone.id);
  };

  /** Replace a single zone by id. */
  const updateZone = (id: string, next: Zone) => {
    setZones(zones.map((z) => (z.id === id ? next : z)));
  };

  /** Move a zone (drag) — patch coords only. */
  const moveZone = (id: string, x: number, z: number) => {
    setZones(zones.map((zz) => (zz.id === id ? { ...zz, x, z } : zz)));
  };

  /** Resize a zone (drag the radius handle). */
  const resizeZone = (id: string, radius: number) => {
    setZones(zones.map((zz) => (zz.id === id ? { ...zz, radius } : zz)));
  };

  /** Delete a zone by id; clears the selection if it was selected. */
  const deleteZone = (id: string) => {
    setZones(zones.filter((z) => z.id !== id));
    if (selectedZoneId === id) setSelectedZoneId(null);
  };

  /** Wipe all zones. */
  const clearAllZones = () => {
    if (
      zones.length > 0 &&
      typeof window !== "undefined" &&
      !window.confirm("Remove all zones?")
    )
      return;
    setZones([]);
    setSelectedZoneId(null);
  };

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  /* ─── handlers ─── */

  const updateTerrain = <K extends keyof TerrainParams>(
    key: K,
    value: TerrainParams[K],
  ) => setTerrain({ ...terrain, [key]: value });

  const updateColour = <K extends keyof ColourState>(
    key: K,
    value: ColourState[K],
  ) => setColour({ ...colour, [key]: value });

  const handleMatrixCell = (b: BandId, d: DestinationId, v: number) => {
    const next = {} as RoutingMatrix;
    for (const bb of BAND_IDS) {
      next[bb] = {} as Record<DestinationId, number>;
      for (const dd of DESTINATION_IDS) {
        next[bb][dd] = bb === b && dd === d ? v : matrix[bb][dd];
      }
    }
    setMatrix(next);
  };

  const applyPreset = (id: PresetId) => {
    setPreset(id);
    // Deep clone the preset so editing the live matrix doesn't mutate the preset.
    const src = PRESETS[id].matrix;
    const copy = {} as RoutingMatrix;
    for (const b of BAND_IDS) {
      copy[b] = {} as Record<DestinationId, number>;
      for (const d of DESTINATION_IDS) copy[b][d] = src[b][d];
    }
    setMatrix(copy);
  };

  /** Save the current matrix + zones to localStorage with the typed name. */
  const handleSavePatch = () => {
    const name = newPatchName.trim();
    if (!name) return;
    const saved = savePatch(name, matrix, zones);
    if (saved) {
      setSavedPatches(loadPatches());
      setNewPatchName("");
    }
  };

  /** Load a saved patch — replaces the live matrix AND zones. */
  const handleLoadSavedPatch = (p: SavedPatch) => {
    // Deep clone so editing doesn't mutate the stored copy in memory.
    const copy = {} as RoutingMatrix;
    for (const b of BAND_IDS) {
      copy[b] = {} as Record<DestinationId, number>;
      for (const d of DESTINATION_IDS) copy[b][d] = p.matrix[b][d];
    }
    setMatrix(copy);
    // Zones: deep clone (destinations is the only nested object).
    setZones(
      (p.zones ?? []).map((z) => ({
        ...z,
        destinations: { ...z.destinations },
      })),
    );
    setSelectedZoneId(null);
    // Clear the built-in preset selection since we've loaded a user patch.
    setPreset("off");
  };

  /** Delete a saved patch — confirms first. */
  const handleDeleteSavedPatch = (p: SavedPatch) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${p.name}"?`)) return;
    deletePatch(p.id);
    setSavedPatches(loadPatches());
  };

  const handleGradientPreset = (p: GradientPreset) => {
    setColour({
      ...colour,
      gradientA: p.colorA,
      gradientB: p.colorB,
      gradientMode: true,
    });
  };

  return (
    <div
      className={`${
        tab === "matrix" || tab === "zones"
          ? "lg:w-[28rem] xl:w-[34rem]"
          : "lg:w-80 xl:w-96"
      } shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/60 backdrop-blur-sm overflow-y-auto pb-8 lg:pb-0 touch-manipulation transition-[width] duration-200`}
    >
      <div className="p-4 space-y-4">
        {/* Persistent Spectrum — visible on every tab so you can always see
            if there's signal coming in. */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-wider text-white/40">
              Spectrum
            </label>
            <span className="text-[9px] text-white/30 tabular-nums">
              {audioStatus.active ? "LIVE" : "—"}
            </span>
          </div>
          <SpectrumAnalyser levelsRef={levelsRef} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                tab === t.id
                  ? "bg-white/15 text-white/80"
                  : "bg-white/5 text-white/30 hover:bg-white/10 hover:text-white/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── TERRAIN ─── */}
        {tab === "terrain" && (
          <div className="space-y-4">
            <Slider
              label="Amplitude"
              value={terrain.amplitude}
              min={0}
              max={200}
              step={1}
              display={`${terrain.amplitude}`}
              onChange={(v) => updateTerrain("amplitude", v)}
            />
            <Slider
              label="Speed"
              value={terrain.speed}
              min={0}
              max={5}
              step={0.1}
              display={terrain.speed.toFixed(1)}
              onChange={(v) => updateTerrain("speed", v)}
            />
            <Slider
              label="Frequency"
              value={terrain.frequency}
              min={0.005}
              max={0.2}
              step={0.001}
              display={terrain.frequency.toFixed(3)}
              onChange={(v) => updateTerrain("frequency", v)}
            />
            <Slider
              label="Grid Density"
              value={terrain.gridDensity}
              min={10}
              max={80}
              step={1}
              display={`${terrain.gridDensity}`}
              onChange={(v) => updateTerrain("gridDensity", v)}
            />
            <Slider
              label="Tilt"
              value={terrain.tilt}
              min={0}
              max={1}
              step={0.01}
              display={terrain.tilt.toFixed(2)}
              onChange={(v) => updateTerrain("tilt", v)}
            />
            <Slider
              label="Line Width"
              value={terrain.lineWidth}
              min={0.5}
              max={3}
              step={0.1}
              display={terrain.lineWidth.toFixed(1)}
              onChange={(v) => updateTerrain("lineWidth", v)}
            />
            <Slider
              label="Brightness"
              value={terrain.brightness}
              min={0.3}
              max={3}
              step={0.05}
              display={terrain.brightness.toFixed(2)}
              onChange={(v) => updateTerrain("brightness", v)}
            />

            <button
              onClick={() => setTerrain({ ...TERRAIN_DEFAULTS })}
              className="w-full mt-2 py-1.5 text-[10px] uppercase tracking-wider text-white/50 bg-white/5 hover:bg-white/10 hover:text-white/80 rounded transition-colors"
            >
              Reset to defaults
            </button>
          </div>
        )}

        {/* ─── AUDIO ─── */}
        {tab === "audio" && (
          <div className="space-y-4">
            {/* Source */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Source
              </label>
              <div className="flex gap-1">
                {(["none", "mic", "tab"] as AudioSource[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSource(s)}
                    className={`flex-1 py-1.5 rounded text-[10px] uppercase tracking-wider transition-colors ${
                      source === s
                        ? "bg-white/15 text-white/80"
                        : "bg-white/5 text-white/40 hover:bg-white/10"
                    }`}
                  >
                    {s === "tab" ? "Tab Audio" : s}
                  </button>
                ))}
              </div>
            </div>

            {/* Mic device picker */}
            {source === "mic" && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40">
                  Input Device
                </label>
                <div className="flex gap-1">
                  <select
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
                  >
                    <option value="">System default</option>
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={onRefreshDevices}
                    title="Refresh device list"
                    className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/50 bg-white/5 hover:bg-white/10 rounded transition-colors"
                  >
                    ↻
                  </button>
                </div>
                <p className="text-[9px] text-white/30 leading-relaxed">
                  Device labels appear after granting mic permission once.
                  Running BlackHole? Pick it here.
                </p>
              </div>
            )}

            {source === "tab" && (
              <p className="text-[10px] text-white/40 leading-relaxed">
                Pick a Chrome tab playing audio. Tick &ldquo;Share tab
                audio&rdquo; in the prompt.
              </p>
            )}

            {/* Start / stop */}
            {source !== "none" && (
              <button
                onClick={audioStatus.active ? onStop : onStart}
                className={`w-full py-2 rounded text-[10px] uppercase tracking-wider transition-colors ${
                  audioStatus.active
                    ? "bg-red-500/20 text-red-200 hover:bg-red-500/30"
                    : "bg-white/10 text-white/80 hover:bg-white/20"
                }`}
              >
                {audioStatus.active ? "Stop" : "Start"}
              </button>
            )}

            {/* Status */}
            <div className="space-y-1 text-[10px] leading-relaxed">
              <div className="flex justify-between text-white/40">
                <span>Status</span>
                <span className={audioStatus.active ? "text-green-300/70" : ""}>
                  {audioStatus.active ? "Active" : "Idle"}
                </span>
              </div>
              {audioStatus.active && (
                <>
                  <div className="text-white/30 truncate">
                    {audioStatus.deviceLabel || "(unlabelled stream)"}
                  </div>
                  <div className="text-white/20 tabular-nums">
                    {audioStatus.sampleRate} Hz
                  </div>
                </>
              )}
              {audioStatus.error && (
                <div className="text-red-400/80">{audioStatus.error}</div>
              )}
            </div>

            {/* Sensitivity */}
            <Slider
              label="Sensitivity"
              value={sensitivity}
              min={0}
              max={3}
              step={0.05}
              display={sensitivity.toFixed(2)}
              onChange={setSensitivity}
            />
          </div>
        )}

        {/* ─── MATRIX ─── */}
        {tab === "matrix" && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/40 leading-relaxed">
              Patch frequency bands to visual parameters. Each knob is depth
              0-1.
            </p>

            <div className="flex gap-1 items-center">
              <select
                value={preset}
                onChange={(e) => applyPreset(e.target.value as PresetId)}
                className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 focus:outline-none focus:border-white/30"
              >
                {(Object.keys(PRESETS) as PresetId[]).map((id) => (
                  <option key={id} value={id}>
                    {PRESETS[id].label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setPreset("off");
                  setMatrix(emptyMatrix());
                }}
                className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/50 bg-white/5 hover:bg-white/10 rounded transition-colors"
              >
                Clear
              </button>
            </div>

            <RoutingMatrixView
              matrix={matrix}
              onChange={handleMatrixCell}
              levelsRef={levelsRef}
            />

            {/* ─── Save current patch ─── */}
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Save Patch
              </label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newPatchName}
                  onChange={(e) => setNewPatchName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSavePatch();
                  }}
                  placeholder="Patch name"
                  maxLength={64}
                  className="flex-1 px-2 py-1 text-[10px] bg-white/5 border border-white/10 rounded text-white/80 placeholder-white/20 focus:outline-none focus:border-white/30"
                />
                <button
                  onClick={handleSavePatch}
                  disabled={!newPatchName.trim()}
                  className="px-3 py-1 text-[10px] uppercase tracking-wider text-white/70 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            {/* ─── Saved patches list ─── */}
            {savedPatches.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase tracking-wider text-white/40">
                  My Patches
                </label>
                <div className="space-y-1">
                  {savedPatches.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-1 group"
                    >
                      <button
                        onClick={() => handleLoadSavedPatch(p)}
                        className="flex-1 text-left px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 rounded text-white/70 hover:text-white/90 transition-colors truncate"
                        title={`Load "${p.name}"`}
                      >
                        {p.name}
                      </button>
                      <button
                        onClick={() => handleDeleteSavedPatch(p)}
                        className="px-2 py-1 text-[10px] text-white/30 hover:text-red-400/80 transition-colors"
                        aria-label={`Delete ${p.name}`}
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── ZONES ─── */}
        {tab === "zones" && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/40 leading-relaxed">
              Tap the map to drop a zone. Zones add audio-driven modulation
              only inside their circle, on top of the global matrix.
            </p>

            <ZoneEditor
              zones={zones}
              selectedId={selectedZoneId}
              levelsRef={levelsRef}
              onAddZone={addZone}
              onSelectZone={setSelectedZoneId}
              onMoveZone={moveZone}
              onResizeZone={resizeZone}
            />

            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-white/40 tabular-nums">
                {zones.length} / {MAX_ZONES} zones
                {zones.length >= MAX_ZONES && (
                  <span className="ml-1.5 text-amber-300/70">MAX</span>
                )}
              </span>
              {zones.length > 0 && (
                <button
                  onClick={clearAllZones}
                  className="px-2 py-1 text-[10px] uppercase tracking-wider text-white/50 bg-white/5 hover:bg-white/10 rounded transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {selectedZone && (
              <ZoneParams
                zone={selectedZone}
                onUpdate={(next) => updateZone(selectedZone.id, next)}
                onDelete={() => deleteZone(selectedZone.id)}
              />
            )}

            {!selectedZone && zones.length > 0 && (
              <p className="text-[9px] text-white/30 leading-relaxed pt-2 border-t border-white/5">
                Tap a zone on the map to edit its band, hardness, destinations
                and tint.
              </p>
            )}
          </div>
        )}

        {/* ─── COLOUR ─── */}
        {tab === "colour" && (
          <div className="space-y-4">
            {!colour.gradientMode && (
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/40">
                  Base Colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colour.baseColor}
                    onChange={(e) => updateColour("baseColor", e.target.value)}
                    className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-white/30 tabular-nums uppercase">
                    {colour.baseColor}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                Gradient Mode
              </span>
              <button
                onClick={() =>
                  updateColour("gradientMode", !colour.gradientMode)
                }
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  colour.gradientMode ? "bg-white/30" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                    colour.gradientMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {colour.gradientMode && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colour.gradientA}
                    onChange={(e) => updateColour("gradientA", e.target.value)}
                    className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-white/30">Valley</span>
                  <span className="text-[10px] text-white/20 tabular-nums uppercase">
                    {colour.gradientA}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colour.gradientB}
                    onChange={(e) => updateColour("gradientB", e.target.value)}
                    className="w-8 h-6 rounded border border-white/10 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-white/30">Peak</span>
                  <span className="text-[10px] text-white/20 tabular-nums uppercase">
                    {colour.gradientB}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full border border-white/10"
                  style={{
                    background: `linear-gradient(to right, ${colour.gradientA}, ${colour.gradientB})`,
                  }}
                />
              </div>
            )}

            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                Presets
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {GRADIENT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handleGradientPreset(p)}
                    className="group relative h-6 rounded border border-white/10 hover:border-white/30 transition-colors overflow-hidden"
                    title={p.name}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(to right, ${p.colorA}, ${p.colorB})`,
                      }}
                    />
                    <span className="relative text-[8px] text-white/70 font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Small slider widget ─── */

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider text-white/40">
          {props.label}
        </span>
        <span className="text-[10px] text-white/30 tabular-nums">
          {props.display}
        </span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
      />
    </div>
  );
}
