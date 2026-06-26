"use client";

/**
 * RoutingMatrixView — the 6×8 patch grid.
 *
 * 6 rows (frequency bands) × 8 columns (visual destinations) of mini-sliders.
 * Each slider is the depth (0-1) for that band → destination route.
 */

import {
  BAND_IDS,
  BAND_LABELS,
  DESTINATION_IDS,
  DESTINATION_LABELS,
} from "../engine/types";
import type {
  RoutingMatrix,
  BandId,
  DestinationId,
} from "../engine/types";

interface Props {
  matrix: RoutingMatrix;
  onChange: (band: BandId, dest: DestinationId, value: number) => void;
}

export default function RoutingMatrixView({ matrix, onChange }: Props) {
  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="grid grid-cols-[64px_repeat(8,1fr)] gap-1 items-end">
        <div />
        {DESTINATION_IDS.map((d) => (
          <div
            key={d}
            className="text-[8px] uppercase tracking-wider text-white/40 text-center"
          >
            {DESTINATION_LABELS[d]}
          </div>
        ))}
      </div>
      {/* Rows: band label + 8 sliders */}
      {BAND_IDS.map((band) => (
        <div
          key={band}
          className="grid grid-cols-[64px_repeat(8,1fr)] gap-1 items-center"
        >
          <div className="text-[10px] uppercase tracking-wider text-white/50">
            {BAND_LABELS[band]}
          </div>
          {DESTINATION_IDS.map((dest) => {
            const value = matrix[band][dest];
            return (
              <div key={dest} className="flex flex-col items-center gap-0.5">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={value}
                  onChange={(e) => onChange(band, dest, Number(e.target.value))}
                  className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60 touch-manipulation"
                  aria-label={`${BAND_LABELS[band]} to ${DESTINATION_LABELS[dest]}`}
                />
                <span className="text-[7px] text-white/30 tabular-nums">
                  {value > 0 ? value.toFixed(2) : ""}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
