"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import SplitFlapChar from "./SplitFlapChar";
import type { BoardConfig, ThemeConfig } from "../engine/types";

interface SplitFlapBoardProps {
  board: string[][];
  config: BoardConfig;
  theme: ThemeConfig;
}

export default function SplitFlapBoard({
  board,
  config,
  theme,
}: SplitFlapBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(0);

  const calculateSize = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const padding = 16; // px padding on each side
    const gap = 3; // px gap between cells
    const availableWidth = rect.width - padding * 2;
    const availableHeight = rect.height - padding * 2;

    const totalGapX = (config.cols - 1) * gap;
    const totalGapY = (config.rows - 1) * gap;

    const cellW = (availableWidth - totalGapX) / config.cols;
    const cellH = (availableHeight - totalGapY) / config.rows;

    // Use the smaller dimension to keep cells square-ish (slightly taller than wide)
    const size = Math.min(cellW, cellH * 0.65);
    setCellSize(Math.max(8, Math.floor(size)));
  }, [config.cols, config.rows]);

  useEffect(() => {
    calculateSize();

    const observer = new ResizeObserver(() => {
      calculateSize();
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [calculateSize]);

  // Font size is ~65% of cell height
  const fontSize = Math.max(8, Math.floor(cellSize * 0.65));

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
      style={{ background: theme.boardBg }}
    >
      {cellSize > 0 && (
        <div
          className="flex flex-col items-center"
          style={{ gap: 3, padding: 16 }}
        >
          {board.map((row, rowIdx) => (
            <div key={rowIdx} className="flex" style={{ gap: 3 }}>
              {row.map((char, colIdx) => (
                <SplitFlapChar
                  key={`${rowIdx}-${colIdx}`}
                  targetChar={char}
                  flipDuration={config.flipDuration}
                  delay={
                    (rowIdx * config.cols + colIdx) * config.cascadeDelay
                  }
                  theme={theme}
                  fontSize={fontSize}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
