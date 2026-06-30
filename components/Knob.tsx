"use client";

/**
 * Knob — a draggable rotary control inspired by hardware synth knobs.
 *
 * Vertical drag changes the value (drag up = increase, drag down = decrease).
 * Works on mouse + touch. Double-click resets to 0.
 *
 * Visuals:
 *   - Circular dial with an indicator line showing the current value.
 *   - Arc background showing the range (0 to 270°, from 7 o'clock to 5 o'clock).
 *   - Filled arc tracks the current value.
 *   - Optional `accent` ring driven by an outside signal (the band level) —
 *     gives a live "this knob is being modulated" glow.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface KnobProps {
  value: number; // 0-1
  onChange: (value: number) => void;
  /** Size in pixels (diameter). Default 36. */
  size?: number;
  /** A 0-1 signal to show as a glow ring (e.g. live band level). */
  signal?: number;
  /** ARIA label. */
  label?: string;
  /** How many pixels of drag = full 0→1 range. Default 120. */
  dragRange?: number;
}

const ARC_START = 135; // degrees from 12 o'clock — 7 o'clock position
const ARC_END = 405; // 5 o'clock (135 + 270)

export default function Knob({
  value,
  onChange,
  size = 36,
  signal = 0,
  label,
  dragRange = 120,
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    startY: number;
    startValue: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  /** Begin a drag — record starting position + value. */
  const beginDrag = useCallback(
    (clientY: number) => {
      dragStateRef.current = { startY: clientY, startValue: value };
      setIsDragging(true);
    },
    [value],
  );

  /** Update drag — compute new value from vertical delta. */
  const updateDrag = useCallback(
    (clientY: number) => {
      const state = dragStateRef.current;
      if (!state) return;
      const dy = state.startY - clientY; // up = positive
      const delta = dy / dragRange;
      const next = Math.max(0, Math.min(1, state.startValue + delta));
      onChange(next);
    },
    [onChange, dragRange],
  );

  /** End drag — clear state. */
  const endDrag = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

  // Global mouse/touch listeners while dragging — covers cases where the user
  // drags off the knob itself.
  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => updateDrag(e.clientY);
    const onMouseUp = () => endDrag();
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        updateDrag(e.touches[0].clientY);
        e.preventDefault(); // stop page scroll while dragging
      }
    };
    const onTouchEnd = () => endDrag();

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [isDragging, updateDrag, endDrag]);

  /** Wheel: fine-tune with mouse wheel. */
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const step = e.shiftKey ? 0.01 : 0.05;
      const next = Math.max(0, Math.min(1, value - Math.sign(e.deltaY) * step));
      onChange(next);
    },
    [value, onChange],
  );

  /** Double-click resets to 0. */
  const onDoubleClick = useCallback(() => onChange(0), [onChange]);

  // Geometry for the SVG indicator
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 3;
  const angle = ARC_START + value * (ARC_END - ARC_START); // degrees
  const rad = (angle - 90) * (Math.PI / 180); // SVG 0° = 3 o'clock, shift to 12
  const indicatorX = cx + Math.cos(rad) * (radius - 4);
  const indicatorY = cy + Math.sin(rad) * (radius - 4);

  // Arc path — full background range
  const arcPath = describeArc(cx, cy, radius, ARC_START, ARC_END);
  const filledArcPath = describeArc(cx, cy, radius, ARC_START, angle);

  return (
    <div
      ref={knobRef}
      className="flex flex-col items-center gap-0.5 select-none"
      style={{ width: size }}
    >
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        onMouseDown={(e) => {
          e.preventDefault();
          beginDrag(e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches[0]) beginDrag(e.touches[0].clientY);
        }}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        className={`relative cursor-ns-resize touch-manipulation rounded-full transition-colors ${
          isDragging ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
        }`}
        style={{ width: size, height: size }}
      >
        {/* Live signal glow ring — pulses with the band level being routed. */}
        {signal > 0.02 && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: `0 0 ${4 + signal * 8}px ${signal * 2}px rgba(180, 220, 255, ${signal * 0.6})`,
            }}
          />
        )}
        <svg width={size} height={size} className="absolute inset-0">
          {/* Background arc */}
          <path
            d={arcPath}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          {/* Filled arc — shows the current value */}
          {value > 0 && (
            <path
              d={filledArcPath}
              stroke={value > 0 ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)"}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
          )}
          {/* Indicator line from centre to current angle */}
          <line
            x1={cx}
            y1={cy}
            x2={indicatorX}
            y2={indicatorY}
            stroke={value > 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)"}
            strokeWidth={2}
            strokeLinecap="round"
          />
          {/* Centre dot */}
          <circle cx={cx} cy={cy} r={1.5} fill="rgba(255,255,255,0.4)" />
        </svg>
      </div>
      <span className="text-[8px] text-white/40 tabular-nums leading-none h-2">
        {value > 0 ? value.toFixed(2) : ""}
      </span>
    </div>
  );
}

/**
 * Build an SVG arc path between two angles (in degrees, 0° = top).
 * Used for both the background range and the filled value arc.
 */
function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const polarToCartesian = (angle: number) => {
    const rad = (angle - 90) * (Math.PI / 180);
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad),
    };
  };
  const start = polarToCartesian(endAngle);
  const end = polarToCartesian(startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
