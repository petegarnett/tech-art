"use client";

/**
 * ZoneEditor — top-down canvas for placing and editing spatial audio zones.
 *
 * The canvas is a normalised 2D map of the terrain (x ∈ [0,1] left→right,
 * z ∈ [0,1] near→far). Each zone is drawn as a filled circle in its band's
 * colour. The fill alpha pulses with `levelsRef.current[zone.band]` so you
 * can see at a glance which zones are receiving audio.
 *
 * Interaction:
 *   - Tap/click empty space → add a new zone.
 *   - Tap/click a zone → select it.
 *   - Drag the selected zone's body → move it.
 *   - Drag the selected zone's radius handle (right edge) → resize it.
 *   - Tap empty space while a zone is selected → deselect.
 *
 * All state lives in the parent — this component is pure presentation +
 * input handling. The internal rAF loop only reads from `levelsRef`.
 */

import { useEffect, useRef } from "react";
import { BAND_COLOURS, type Zone } from "../engine/zones";
import { BAND_LABELS } from "../engine/types";
import type { BandLevels } from "../engine/types";

interface Props {
  zones: Zone[];
  selectedId: string | null;
  levelsRef: React.MutableRefObject<BandLevels>;
  onAddZone: (x: number, z: number) => void;
  onSelectZone: (id: string | null) => void;
  onMoveZone: (id: string, x: number, z: number) => void;
  onResizeZone: (id: string, radius: number) => void;
}

/** Pixel radius of the radius-handle hit target. */
const HANDLE_R = 8;

/** Aspect ratio of the editor (height = width * RATIO). */
const RATIO = 0.65;

type DragMode = "move" | "resize";

interface DragState {
  id: string;
  mode: DragMode;
  /** Offset between zone centre and the pointer (move mode only), in normalised coords. */
  offsetX: number;
  offsetZ: number;
}

export default function ZoneEditor({
  zones,
  selectedId,
  levelsRef,
  onAddZone,
  onSelectZone,
  onMoveZone,
  onResizeZone,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Latest props mirrored into refs so the rAF loop sees them without rebinding.
  const zonesRef = useRef(zones);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const dragRef = useRef<DragState | null>(null);
  // True if the pointer was pressed on a zone/handle and may or may not have
  // moved enough to count as a drag. Used to decide tap-vs-drag on release.
  const pressedRef = useRef<{
    x: number;
    y: number;
    moved: boolean;
    targetId: string | null;
  } | null>(null);

  /* ─── DPR-aware resize + draw loop ─── */

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, cssW * RATIO);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const draw = () => {
      const w = cssW;
      const h = cssH;
      const levels = levelsRef.current;
      const sel = selectedIdRef.current;

      // Background
      ctx.fillStyle = "#08080c";
      ctx.fillRect(0, 0, w, h);

      // Subtle grid — 8×8 cells to hint at the terrain footprint.
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cells = 8;
      for (let i = 1; i < cells; i++) {
        const x = (i / cells) * w;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let i = 1; i < cells; i++) {
        const y = (i / cells) * h;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Border
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      // Horizon label (top)
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "8px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("HORIZON", w / 2, 4);

      // Zones — draw deepest (far) first so near zones overlay them.
      const zs = zonesRef.current
        .map((z, i) => ({ z, i }))
        .sort((a, b) => b.z.z - a.z.z);

      for (const { z } of zs) {
        const cx = z.x * w;
        const cy = z.z * h;
        const rPx = z.radius * w;
        const colour = BAND_COLOURS[z.band];
        const level = levels[z.band];
        // Pulse the fill alpha with band signal — soft baseline so it's always visible.
        const fillA = 0.08 + Math.min(0.45, level * 0.6);
        const strokeA = z === undefined ? 0.4 : 0.55 + Math.min(0.35, level * 0.5);

        ctx.fillStyle = withAlpha(colour, fillA);
        ctx.beginPath();
        ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
        ctx.fill();

        // Outline
        ctx.strokeStyle = withAlpha(colour, strokeA);
        ctx.lineWidth = z.id === sel ? 2 : 1;
        ctx.stroke();

        // Selected: brighter outer ring + radius handle
        if (z.id === sel) {
          ctx.strokeStyle = "rgba(255,255,255,0.65)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, rPx + 2, 0, Math.PI * 2);
          ctx.stroke();

          // Radius handle on the right edge
          const hx = cx + rPx;
          const hy = cy;
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.beginPath();
          ctx.arc(hx, hy, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Band label
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(BAND_LABELS[z.band], cx, cy);
      }

      // Camera indicator at bottom-centre — small upward arrow.
      const ax = w / 2;
      const ay = h - 8;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.moveTo(ax, ay - 6);
      ctx.lineTo(ax - 4, ay + 2);
      ctx.lineTo(ax + 4, ay + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "7px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText("CAMERA", ax, ay - 8);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [levelsRef]);

  /* ─── Pointer helpers ─── */

  /** Convert a client (px) point to normalised coords. */
  const toNorm = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, z: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / Math.max(1, rect.width);
    const z = (clientY - rect.top) / Math.max(1, rect.height);
    return { x: clamp01(x), z: clamp01(z) };
  };

  /** Hit-test in priority order: radius handle of selected zone > zone interior > empty. */
  const hitTest = (
    clientX: number,
    clientY: number,
  ): { id: string; mode: DragMode } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const sel = selectedIdRef.current;

    // 1) Radius handle of selected zone.
    if (sel) {
      const z = zonesRef.current.find((zz) => zz.id === sel);
      if (z) {
        const cx = z.x * w;
        const cy = z.z * h;
        const rPx = z.radius * w;
        const hx = cx + rPx;
        const hy = cy;
        const dx = px - hx;
        const dy = py - hy;
        if (dx * dx + dy * dy <= HANDLE_R * HANDLE_R) {
          return { id: z.id, mode: "resize" };
        }
      }
    }

    // 2) Zone interior — front-most (nearest) first.
    const sorted = [...zonesRef.current].sort((a, b) => a.z - b.z);
    for (const z of sorted) {
      const cx = z.x * w;
      const cy = z.z * h;
      const rPx = z.radius * w;
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= rPx * rPx) {
        return { id: z.id, mode: "move" };
      }
    }

    return null;
  };

  /* ─── Pointer handlers (unified mouse + touch via Pointer Events) ─── */

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Capture so we keep getting events even if the pointer leaves the canvas.
    canvas.setPointerCapture(e.pointerId);

    const hit = hitTest(e.clientX, e.clientY);
    pressedRef.current = {
      x: e.clientX,
      y: e.clientY,
      moved: false,
      targetId: hit?.id ?? null,
    };

    if (hit) {
      const z = zonesRef.current.find((zz) => zz.id === hit.id);
      if (!z) return;
      const { x: nx, z: nz } = toNorm(e.clientX, e.clientY);
      dragRef.current = {
        id: hit.id,
        mode: hit.mode,
        offsetX: z.x - nx,
        offsetZ: z.z - nz,
      };
    } else {
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pressed = pressedRef.current;
    if (pressed) {
      const dx = e.clientX - pressed.x;
      const dy = e.clientY - pressed.y;
      if (!pressed.moved && dx * dx + dy * dy > 9) pressed.moved = true;
    }

    const drag = dragRef.current;
    if (!drag) return;

    const z = zonesRef.current.find((zz) => zz.id === drag.id);
    if (!z) return;

    if (drag.mode === "move") {
      const { x: nx, z: nz } = toNorm(e.clientX, e.clientY);
      const newX = clamp01(nx + drag.offsetX);
      const newZ = clamp01(nz + drag.offsetZ);
      onMoveZone(z.id, newX, newZ);
    } else {
      // Resize — distance from current centre.
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const cx = z.x * w;
      const cy = z.z * h;
      const dPx = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      // Normalise on width (matches falloff math).
      const newR = Math.max(0.02, Math.min(0.8, dPx / Math.max(1, w)));
      onResizeZone(z.id, newR);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    canvas?.releasePointerCapture?.(e.pointerId);

    const pressed = pressedRef.current;
    pressedRef.current = null;
    const wasDragging = dragRef.current !== null;
    dragRef.current = null;

    if (!pressed) return;

    // Tap (not drag) → select / add / deselect logic.
    if (!pressed.moved) {
      if (pressed.targetId) {
        // Tap on a zone → select it.
        onSelectZone(pressed.targetId);
      } else if (selectedIdRef.current) {
        // Tap on empty space while something is selected → deselect.
        onSelectZone(null);
      } else {
        // Tap on empty space with nothing selected → add a new zone.
        const { x, z } = toNorm(e.clientX, e.clientY);
        onAddZone(x, z);
      }
    } else if (!wasDragging) {
      // Moved but didn't drag a zone — no-op.
    }
  };

  return (
    <div ref={wrapRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="w-full block rounded border border-white/10 touch-none cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}

/* ─── helpers ─── */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Append an alpha (0-1) to a #rrggbb hex colour as an rgba() string. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
