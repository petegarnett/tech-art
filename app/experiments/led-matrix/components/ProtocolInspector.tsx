"use client";

import { useState } from "react";
import type { FrameBuffer } from "../engine/frame-buffer";
import type { GridMapping } from "../engine/types";

interface ProtocolInspectorProps {
  buffer: FrameBuffer;
  mapping: GridMapping;
  fps: number;
}

export default function ProtocolInspector({
  buffer,
  mapping,
  fps,
}: ProtocolInspectorProps) {
  const [open, setOpen] = useState(false);

  const pixelCount = buffer.pixelCount;
  const bufferSize = buffer.data.length;

  // Get hex dump of first 16 pixels (48 bytes)
  const hexDump = (() => {
    const parts: string[] = [];
    const maxBytes = Math.min(48, buffer.data.length);
    for (let i = 0; i < maxBytes; i += 3) {
      const r = buffer.data[i].toString(16).padStart(2, "0");
      const g = buffer.data[i + 1].toString(16).padStart(2, "0");
      const b = buffer.data[i + 2].toString(16).padStart(2, "0");
      parts.push(r + g + b);
    }
    return parts.join(" ");
  })();

  return (
    <div className="border-t border-white/5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 text-[10px] uppercase tracking-wider text-white/30 hover:text-white/50 transition-colors"
      >
        <span>Protocol</span>
        <span className="text-[10px]">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="pb-3 space-y-2">
          <div className="flex justify-between text-[10px] text-white/30 tabular-nums">
            <span>
              {pixelCount} pixels ({buffer.cols}×{buffer.rows})
            </span>
            <span>{Math.round(fps)} fps</span>
          </div>
          <div className="flex justify-between text-[10px] text-white/30 tabular-nums">
            <span>{bufferSize} bytes</span>
            <span>{mapping}</span>
          </div>
          <div className="text-[9px] text-white/20 font-mono break-all leading-relaxed bg-white/3 rounded p-2">
            {hexDump}
          </div>
        </div>
      )}
    </div>
  );
}
