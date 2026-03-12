"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";
import SplitFlapBoard from "./components/SplitFlapBoard";
import ControlPanel from "./components/ControlPanel";
import { sanitizeText } from "./engine/characters";
import { THEMES } from "./engine/types";
import type { BoardConfig, ThemeConfig } from "./engine/types";

function createEmptyBoard(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(" "));
}

/** Get the clock cell positions for a given config */
function getClockCells(
  config: BoardConfig
): { row: number; startCol: number } | null {
  if (!config.showClock) return null;
  const clockLen = 5; // HH:MM
  const pos = config.clockPosition;
  const row = pos.startsWith("top") ? 0 : config.rows - 1;
  const startCol = pos.endsWith("right")
    ? config.cols - clockLen
    : 0;
  return { row, startCol };
}

/** Check if a cell is occupied by the clock */
function isClockCell(
  row: number,
  col: number,
  clockCells: { row: number; startCol: number } | null
): boolean {
  if (!clockCells) return false;
  return (
    row === clockCells.row &&
    col >= clockCells.startCol &&
    col < clockCells.startCol + 5
  );
}

const WELCOME_MESSAGE = "HELLO WORLD";

export default function SplitFlapPage() {
  const [config, setConfig] = useState<BoardConfig>({
    rows: 6,
    cols: 22,
    flipDuration: 100,
    cascadeDelay: 30,
    showClock: true,
    clockPosition: "top-right",
    sound: false,
  });

  const [theme, setTheme] = useState<ThemeConfig>(THEMES.classic);
  const [board, setBoard] = useState<string[][]>(() =>
    createEmptyBoard(6, 22)
  );

  // Track the last sent message so we can re-apply on config changes
  const lastMessageRef = useRef<string>(WELCOME_MESSAGE);
  const initializedRef = useRef(false);

  // Apply a message to the board, avoiding clock cells
  const applyMessage = useCallback(
    (
      text: string,
      currentBoard: string[][],
      cfg: BoardConfig
    ): string[][] => {
      const totalCells = cfg.rows * cfg.cols;
      const clockCells = getClockCells(cfg);
      const sanitized = sanitizeText(text, totalCells);

      const newBoard = currentBoard.map((row) => [...row]);
      let charIdx = 0;

      for (let r = 0; r < cfg.rows; r++) {
        for (let c = 0; c < cfg.cols; c++) {
          if (isClockCell(r, c, clockCells)) continue;
          if (charIdx < sanitized.length) {
            newBoard[r][c] = sanitized[charIdx];
            charIdx++;
          } else {
            newBoard[r][c] = " ";
          }
        }
      }

      return newBoard;
    },
    []
  );

  // Apply clock to the board
  const applyClockToBoard = useCallback(
    (time: string, currentBoard: string[][]): string[][] => {
      const clockCells = getClockCells(config);
      if (!clockCells) return currentBoard;

      const newBoard = currentBoard.map((row) => [...row]);
      for (let i = 0; i < 5 && i < time.length; i++) {
        const col = clockCells.startCol + i;
        if (col < config.cols) {
          newBoard[clockCells.row][col] = time[i];
        }
      }
      return newBoard;
    },
    [config]
  );

  // Handle message send
  const handleSend = useCallback(
    (text: string) => {
      lastMessageRef.current = text;
      setBoard((prev) => {
        const withMessage = applyMessage(text, prev, config);
        // Re-apply clock on top
        if (config.showClock) {
          const now = new Date();
          const time = now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return applyClockToBoard(time, withMessage);
        }
        return withMessage;
      });
    },
    [applyMessage, applyClockToBoard, config]
  );

  // Initialize with welcome message
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Small delay so the flip animation is visible on load
      const timeout = setTimeout(() => {
        handleSend(WELCOME_MESSAGE);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [handleSend]);

  // Clock effect — updates every second
  useEffect(() => {
    if (!config.showClock) return;

    const update = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setBoard((prev) => applyClockToBoard(time, prev));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [config.showClock, applyClockToBoard]);

  // When board size changes, rebuild the board
  const handleConfigChange = useCallback(
    (newConfig: BoardConfig) => {
      const sizeChanged =
        newConfig.rows !== config.rows || newConfig.cols !== config.cols;

      setConfig(newConfig);

      if (sizeChanged) {
        // Rebuild board with new dimensions
        const empty = createEmptyBoard(newConfig.rows, newConfig.cols);
        const withMessage = (() => {
          const totalCells = newConfig.rows * newConfig.cols;
          const clockCells = getClockCells(newConfig);
          const sanitized = sanitizeText(
            lastMessageRef.current,
            totalCells
          );

          const newBoard = empty.map((row) => [...row]);
          let charIdx = 0;

          for (let r = 0; r < newConfig.rows; r++) {
            for (let c = 0; c < newConfig.cols; c++) {
              if (isClockCell(r, c, clockCells)) continue;
              if (charIdx < sanitized.length) {
                newBoard[r][c] = sanitized[charIdx];
                charIdx++;
              }
            }
          }

          // Apply clock
          if (newConfig.showClock) {
            const now = new Date();
            const time = now.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const cc = getClockCells(newConfig);
            if (cc) {
              for (let i = 0; i < 5 && i < time.length; i++) {
                const col = cc.startCol + i;
                if (col < newConfig.cols) {
                  newBoard[cc.row][col] = time[i];
                }
              }
            }
          }

          return newBoard;
        })();

        setBoard(withMessage);
      }
    },
    [config.rows, config.cols]
  );

  const maxChars = config.rows * config.cols;
  const clockChars = 5;

  return (
    <ExperimentLayout title="Split-Flap Display">
      <div className="flex flex-col lg:flex-row h-auto lg:h-full pt-12">
        {/* Board area */}
        <div className="h-[60vh] lg:h-auto lg:flex-1 min-h-0">
          <SplitFlapBoard board={board} config={config} theme={theme} />
        </div>

        {/* Control panel */}
        <ControlPanel
          config={config}
          onConfigChange={handleConfigChange}
          theme={theme}
          onThemeChange={setTheme}
          onSend={handleSend}
          maxChars={maxChars}
          clockChars={clockChars}
        />
      </div>
    </ExperimentLayout>
  );
}
