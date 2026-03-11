"use client";

import { useRef } from "react";
import { useCanvas } from "@/lib/canvas/setup";
import type { FrameBuffer } from "../engine/frame-buffer";
import type { AppearanceConfig } from "../engine/types";

interface LEDCanvasProps {
  buffer: FrameBuffer;
  appearance: AppearanceConfig;
}

export default function LEDCanvas({ buffer, appearance }: LEDCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useCanvas(canvasRef, ({ ctx, width, height }) => {
    const { cols, rows } = buffer;
    const cellW = width / cols;
    const cellH = height / rows;
    const cellSize = Math.min(cellW, cellH);
    const gap = appearance.gap;

    // Center the grid
    const gridW = cellSize * cols;
    const gridH = cellSize * rows;
    const offsetX = (width - gridW) / 2;
    const offsetY = (height - gridH) / 2;

    // Background
    ctx.fillStyle = appearance.bgColor;
    ctx.fillRect(0, 0, width, height);

    // Draw each LED
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const [r, g, b] = buffer.getPixel(x, y);
        const brightness = (r + g + b) / (3 * 255);
        const maxRadius = (cellSize - gap) / 2;
        const radius = maxRadius * (0.15 + brightness * 0.85);

        const cx = offsetX + x * cellSize + cellSize / 2;
        const cy = offsetY + y * cellSize + cellSize / 2;

        // Bloom glow
        if (appearance.bloom && brightness > 0.3) {
          ctx.shadowBlur = radius * 1.5;
          ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;

        if (appearance.pixelShape === "circle") {
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const rr = radius * 0.3;
          ctx.beginPath();
          ctx.roundRect(cx - radius, cy - radius, radius * 2, radius * 2, rr);
          ctx.fill();
        }
      }
    }

    // Reset shadow
    ctx.shadowBlur = 0;
  });

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
