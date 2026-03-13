"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { getFlipCount, getCharAtStep } from "../engine/characters";
import type { ThemeConfig } from "../engine/types";

interface SplitFlapCharProps {
  targetChar: string;
  flipDuration: number;
  delay: number;
  theme: ThemeConfig;
  fontSize: number;
  flapBgOverride?: string;
  flapTextOverride?: string;
}

/**
 * A single split-flap character module with physical flip animation.
 *
 * The flip works by:
 * 1. Showing a static top+bottom half of the current character
 * 2. When flipping, the top half folds down (rotateX) revealing the next char
 * 3. Characters cycle through intermediate values on the drum
 */
function SplitFlapCharInner({
  targetChar,
  flipDuration,
  delay,
  theme,
  fontSize,
  flapBgOverride,
  flapTextOverride,
}: SplitFlapCharProps) {
  // Effective colours — use overrides if provided, else theme defaults
  const effectiveBg = flapBgOverride ?? theme.flapBg;
  const effectiveText = flapTextOverride ?? theme.flapText;
  const [currentChar, setCurrentChar] = useState(targetChar);
  const [nextChar, setNextChar] = useState(targetChar);
  const [isFlipping, setIsFlipping] = useState(false);

  // Refs for managing the flip queue
  const flipQueueRef = useRef<string[]>([]);
  const isAnimatingRef = useRef(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const delayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetRef = useRef(targetChar);

  // Cleanup all timeouts
  const clearAllTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }
  }, []);

  // Process the next flip in the queue
  const processNextFlip = useCallback(() => {
    if (flipQueueRef.current.length === 0) {
      isAnimatingRef.current = false;
      setIsFlipping(false);
      return;
    }

    const next = flipQueueRef.current.shift()!;
    isAnimatingRef.current = true;

    // Set the next character and start the flip
    setNextChar(next);
    setIsFlipping(true);

    // At the midpoint, update the current char (bottom half updates)
    const midTimeout = setTimeout(() => {
      setCurrentChar(next);
    }, flipDuration * 0.5);
    timeoutsRef.current.push(midTimeout);

    // At the end, reset flip state and process next
    const endTimeout = setTimeout(() => {
      setIsFlipping(false);
      // Small gap before next flip for visual clarity
      const gapTimeout = setTimeout(() => {
        processNextFlip();
      }, 10);
      timeoutsRef.current.push(gapTimeout);
    }, flipDuration);
    timeoutsRef.current.push(endTimeout);
  }, [flipDuration]);

  // When target changes, build the flip queue
  useEffect(() => {
    targetRef.current = targetChar;

    // Build the sequence of characters to flip through
    const buildQueue = () => {
      const from = isAnimatingRef.current
        ? flipQueueRef.current.length > 0
          ? flipQueueRef.current[flipQueueRef.current.length - 1]
          : currentChar
        : currentChar;

      const count = getFlipCount(from, targetChar);
      if (count === 0) return;

      const queue: string[] = [];
      for (let i = 1; i <= count; i++) {
        queue.push(getCharAtStep(from, i));
      }
      return queue;
    };

    // Clear any pending delay
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
      delayTimeoutRef.current = null;
    }

    // Apply cascade delay
    delayTimeoutRef.current = setTimeout(() => {
      const queue = buildQueue();
      if (!queue || queue.length === 0) return;

      flipQueueRef.current = queue;

      if (!isAnimatingRef.current) {
        processNextFlip();
      }
    }, delay);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetChar, delay, processNextFlip]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimeouts();
  }, [clearAllTimeouts]);

  const halfDuration = flipDuration * 0.5;
  const cellHeight = fontSize * 1.6;
  const cellWidth = fontSize * 1.0;

  return (
    <div
      className="relative select-none"
      style={{
        width: cellWidth,
        height: cellHeight,
        perspective: cellHeight * 3,
        fontFamily: "var(--font-geist-mono), monospace",
      }}
    >
      {/* === BOTTOM HALF (static — shows current char bottom) === */}
      <div
        className="absolute left-0 right-0 overflow-hidden"
        style={{
          top: "50%",
          height: "50%",
          background: `linear-gradient(to bottom, ${effectiveBg}, ${adjustBrightness(effectiveBg, -8)})`,
          borderRadius: "0 0 2px 2px",
          zIndex: 1,
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center font-bold"
          style={{
            color: effectiveText,
            fontSize,
            lineHeight: 1,
            height: "200%",
            top: "-100%",
          }}
        >
          {currentChar === " " ? "\u00A0" : currentChar}
        </div>
      </div>

      {/* === TOP HALF (static — shows next char top, visible behind flip) === */}
      <div
        className="absolute left-0 right-0 overflow-hidden"
        style={{
          top: 0,
          height: "50%",
          background: `linear-gradient(to bottom, ${adjustBrightness(effectiveBg, 8)}, ${effectiveBg})`,
          borderRadius: "2px 2px 0 0",
          zIndex: 1,
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center font-bold"
          style={{
            color: effectiveText,
            fontSize,
            lineHeight: 1,
            height: "200%",
          }}
        >
          {nextChar === " " ? "\u00A0" : nextChar}
        </div>
      </div>

      {/* === FLIPPING TOP HALF (folds down from current to next) === */}
      <div
        className="absolute left-0 right-0 overflow-hidden"
        style={{
          top: 0,
          height: "50%",
          transformOrigin: "bottom center",
          transform: isFlipping ? "rotateX(-90deg)" : "rotateX(0deg)",
          transition: isFlipping
            ? `transform ${halfDuration}ms ease-in`
            : `transform ${halfDuration}ms ease-out`,
          backfaceVisibility: "hidden",
          background: `linear-gradient(to bottom, ${adjustBrightness(effectiveBg, 8)}, ${effectiveBg})`,
          borderRadius: "2px 2px 0 0",
          zIndex: isFlipping ? 3 : 2,
          willChange: isFlipping ? "transform" : "auto",
          boxShadow: isFlipping
            ? `0 2px 4px rgba(0,0,0,0.5)`
            : "none",
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center font-bold"
          style={{
            color: effectiveText,
            fontSize,
            lineHeight: 1,
            height: "200%",
          }}
        >
          {currentChar === " " ? "\u00A0" : currentChar}
        </div>
      </div>

      {/* === FLIPPING BOTTOM HALF (flips up to reveal next char bottom) === */}
      <div
        className="absolute left-0 right-0 overflow-hidden"
        style={{
          top: "50%",
          height: "50%",
          transformOrigin: "top center",
          transform: isFlipping ? "rotateX(0deg)" : "rotateX(90deg)",
          transition: isFlipping
            ? `transform ${halfDuration}ms ease-out ${halfDuration}ms`
            : `transform 0ms`,
          backfaceVisibility: "hidden",
          background: `linear-gradient(to bottom, ${effectiveBg}, ${adjustBrightness(effectiveBg, -8)})`,
          borderRadius: "0 0 2px 2px",
          zIndex: isFlipping ? 3 : 0,
          willChange: isFlipping ? "transform" : "auto",
          boxShadow: isFlipping
            ? `0 -1px 3px rgba(0,0,0,0.4)`
            : "none",
        }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center font-bold"
          style={{
            color: effectiveText,
            fontSize,
            lineHeight: 1,
            height: "200%",
            top: "-100%",
          }}
        >
          {nextChar === " " ? "\u00A0" : nextChar}
        </div>
      </div>

      {/* === SPLIT LINE (the horizontal gap) === */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{
          top: "50%",
          height: "1px",
          transform: "translateY(-0.5px)",
          background: theme.flapBorder,
          zIndex: 10,
        }}
      />
    </div>
  );
}

/**
 * Adjust hex colour brightness by a given amount (-255 to 255).
 */
function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const SplitFlapChar = memo(SplitFlapCharInner);
export default SplitFlapChar;
