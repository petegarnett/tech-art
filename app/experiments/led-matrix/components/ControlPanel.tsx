"use client";

import { useState } from "react";
import { ANIMATION_PRESETS } from "../engine/animations";
import AlgorithmEditor from "./AlgorithmEditor";
import ProtocolInspector from "./ProtocolInspector";
import type { FrameBuffer } from "../engine/frame-buffer";
import type { GridMapping, PixelShape } from "../engine/types";

type Tab = "grid" | "style" | "animate" | "code";

interface ControlPanelProps {
  // Grid
  cols: number;
  rows: number;
  setCols: (v: number) => void;
  setRows: (v: number) => void;
  mapping: GridMapping;
  setMapping: (v: GridMapping) => void;

  // Appearance
  pixelShape: PixelShape;
  setPixelShape: (v: PixelShape) => void;
  gap: number;
  setGap: (v: number) => void;
  bloom: boolean;
  setBloom: (v: boolean) => void;
  bgColor: string;
  setBgColor: (v: string) => void;
  brightness: number;
  setBrightness: (v: number) => void;

  // Animation
  activePreset: string | null;
  setActivePreset: (v: string | null) => void;
  speed: number;
  setSpeed: (v: number) => void;
  paused: boolean;
  setPaused: (v: boolean) => void;

  // Custom code
  customCode: string;
  setCustomCode: (v: string) => void;
  codeError: string | null;
  onApplyCode: () => void;

  // Protocol inspector
  buffer: FrameBuffer;
  fps: number;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "grid", label: "Grid" },
  { id: "style", label: "Style" },
  { id: "animate", label: "Animate" },
  { id: "code", label: "Code" },
];

export default function ControlPanel(props: ControlPanelProps) {
  const [tab, setTab] = useState<Tab>("animate");
  const [lockAspect, setLockAspect] = useState(true);

  const handleCols = (v: number) => {
    props.setCols(v);
    if (lockAspect) props.setRows(v);
  };

  const handleRows = (v: number) => {
    props.setRows(v);
    if (lockAspect) props.setCols(v);
  };

  return (
    <div className="lg:w-80 xl:w-96 bg-black/60 backdrop-blur-sm lg:h-full overflow-y-auto pb-8 lg:pb-0 touch-manipulation">
      <div className="p-4 space-y-4">
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

        {/* Tab content */}
        {tab === "grid" && (
          <div className="space-y-4">
            {/* Cols */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">
                Columns
                <span className="text-white/30 tabular-nums ml-2">{props.cols}</span>
              </label>
              <input
                type="range"
                min={8}
                max={64}
                step={1}
                value={props.cols}
                onChange={(e) => handleCols(Number(e.target.value))}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
              />
            </div>

            {/* Rows */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">
                Rows
                <span className="text-white/30 tabular-nums ml-2">{props.rows}</span>
              </label>
              <input
                type="range"
                min={8}
                max={64}
                step={1}
                value={props.rows}
                onChange={(e) => handleRows(Number(e.target.value))}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
              />
            </div>

            {/* Lock aspect ratio */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLockAspect(!lockAspect)}
                className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                  lockAspect
                    ? "bg-white/30 text-white/80"
                    : "bg-white/10 text-white/40"
                }`}
              >
                Lock Aspect
              </button>
            </div>

            {/* Mapping */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-2">
                Mapping
              </label>
              <div className="flex gap-1">
                {(["ltr", "serpentine"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => props.setMapping(m)}
                    className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                      props.mapping === m
                        ? "bg-white/30 text-white/80"
                        : "bg-white/10 text-white/40 hover:bg-white/15"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Pixel count */}
            <div className="text-[10px] text-white/30 tabular-nums">
              {props.cols}×{props.rows} = {props.cols * props.rows} pixels
            </div>
          </div>
        )}

        {tab === "style" && (
          <div className="space-y-4">
            {/* Pixel shape */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-2">
                Pixel Shape
              </label>
              <div className="flex gap-1">
                {(["circle", "square"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => props.setPixelShape(s)}
                    className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                      props.pixelShape === s
                        ? "bg-white/30 text-white/80"
                        : "bg-white/10 text-white/40 hover:bg-white/15"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Gap */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">
                Gap
                <span className="text-white/30 tabular-nums ml-2">{props.gap}px</span>
              </label>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={props.gap}
                onChange={(e) => props.setGap(Number(e.target.value))}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
              />
            </div>

            {/* Bloom */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => props.setBloom(!props.bloom)}
                className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                  props.bloom
                    ? "bg-white/30 text-white/80"
                    : "bg-white/10 text-white/40"
                }`}
              >
                Bloom
              </button>
            </div>

            {/* Background colour */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-2">
                Background
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={props.bgColor}
                  onChange={(e) => props.setBgColor(e.target.value)}
                  className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
                />
                <span className="text-[10px] text-white/30 tabular-nums font-mono">
                  {props.bgColor}
                </span>
              </div>
            </div>

            {/* Brightness */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">
                Brightness
                <span className="text-white/30 tabular-nums ml-2">
                  {Math.round(props.brightness * 100)}%
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={props.brightness}
                onChange={(e) => props.setBrightness(Number(e.target.value))}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
              />
            </div>
          </div>
        )}

        {tab === "animate" && (
          <div className="space-y-4">
            {/* Speed */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-1">
                Speed
                <span className="text-white/30 tabular-nums ml-2">
                  {props.speed.toFixed(1)}×
                </span>
              </label>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={props.speed}
                onChange={(e) => props.setSpeed(Number(e.target.value))}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
              />
            </div>

            {/* Pause/Play */}
            <button
              onClick={() => props.setPaused(!props.paused)}
              className={`px-4 py-1.5 rounded-full text-[10px] uppercase tracking-wider transition-colors ${
                props.paused
                  ? "bg-white/20 text-white/80"
                  : "bg-white/10 text-white/40 hover:bg-white/15"
              }`}
            >
              {props.paused ? "▶ Play" : "⏸ Pause"}
            </button>

            {/* Preset grid */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/40 block mb-2">
                Presets
              </label>
              <div className="grid grid-cols-2 gap-1">
                {ANIMATION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => props.setActivePreset(preset.id)}
                    className={`px-2 py-2 rounded-md text-[10px] text-left transition-colors ${
                      props.activePreset === preset.id
                        ? "bg-white/20 text-white/80"
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60"
                    }`}
                    title={preset.description}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "code" && (
          <AlgorithmEditor
            code={props.customCode}
            onChange={props.setCustomCode}
            onApply={props.onApplyCode}
            error={props.codeError}
          />
        )}

        {/* Protocol Inspector — always visible at bottom */}
        <ProtocolInspector
          buffer={props.buffer}
          mapping={props.mapping}
          fps={props.fps}
        />
      </div>
    </div>
  );
}
