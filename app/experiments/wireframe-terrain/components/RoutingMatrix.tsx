"use client";

/**
 * RoutingMatrixView — the 6×8 patch grid using draggable knobs.
 *
 * Layout:
 *   - Each row is a frequency band (SUB → AIR) with a live signal LED.
 *   - Each column is a visual destination (AMP, FREQ, SPEED, ...).
 *   - Each cell is a Knob (drag vertically to set 0-1, double-click to reset,
 *     mouse wheel to fine-tune).
 *
 * The knob shows a glow when its band has signal, so you can see at a glance
 * which routes are actively modulating.
 */

import { useEffect, useState } from "react";
import Knob from "./Knob";
import {
  BAND_IDS,
  BAND_LABELS,
  DESTINATION_IDS,
  DESTINATION_LABELS,
} from "../engine/types";
import type {
  RoutingMatrix,
  BandId,
  BandLevels,
  DestinationId,
} from "../engine/types";

interface Props {
  matrix: RoutingMatrix;
  onChange: (band: BandId, dest: DestinationId, value: number) => void;
  /** Ref to live band levels, polled at 30Hz for the signal indicators. */
  levelsRef: React.MutableRefObject<BandLevels>;
}

export default function RoutingMatrixView({
  matrix,
  onChange,
  levelsRef,
}: Props) {
  // Poll band levels at 30Hz so the signal indicators stay live.
  // Not every frame — 30Hz is enough for visual feedback and saves renders.
  const [levels, setLevels] = useState<BandLevels>(levelsRef.current);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 33) {
        last = now;
        setLevels({ ...levelsRef.current });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelsRef]);

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="grid grid-cols-[60px_repeat(8,1fr)] gap-1.5 items-end">
        <div />
        {DESTINATION_IDS.map((d) => (
          <div
            key={d}
            className="text-[8px] uppercase tracking-wider text-white/40 text-center leading-none"
          >
            {DESTINATION_LABELS[d]}
          </div>
        ))}
      </div>
      {/* Rows: band label + signal LED + 8 knobs */}
      {BAND_IDS.map((band) => {
        const level = levels[band];
        return (
          <div
            key={band}
            className="grid grid-cols-[60px_repeat(8,1fr)] gap-1.5 items-center"
          >
            {/* Band label + signal LED */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-1.5 h-1.5 rounded-full transition-colors"
                style={{
                  background: `rgba(120, 200, 255, ${Math.min(1, level * 1.5)})`,
                  boxShadow:
                    level > 0.1
                      ? `0 0 ${level * 6}px rgba(120, 200, 255, ${level})`
                      : "none",
                }}
                aria-hidden
              />
              <span className="text-[10px] uppercase tracking-wider text-white/60">
                {BAND_LABELS[band]}
              </span>
            </div>
            {DESTINATION_IDS.map((dest) => (
              <div key={dest} className="flex justify-center">
                <Knob
                  size={32}
                  value={matrix[band][dest]}
                  signal={level * matrix[band][dest]}
                  onChange={(v) => onChange(band, dest, v)}
                  label={`${BAND_LABELS[band]} to ${DESTINATION_LABELS[dest]}`}
                />
              </div>
            ))}
          </div>
        );
      })}

      {/* Hint */}
      <p className="text-[9px] text-white/30 pt-2 leading-relaxed">
        Drag knobs vertically · double-click to reset · wheel to fine-tune
      </p>
    </div>
  );
}
