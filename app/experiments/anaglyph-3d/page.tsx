"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ExperimentLayout from "@/components/ExperimentLayout";

const PRESETS = [
  { id: "1018", url: "https://picsum.photos/id/1018/1200/800", label: "Mountains" },
  { id: "1015", url: "https://picsum.photos/id/1015/1200/800", label: "River" },
  { id: "1025", url: "https://picsum.photos/id/1025/1200/800", label: "Dog" },
  { id: "1035", url: "https://picsum.photos/id/1035/1200/800", label: "City" },
  { id: "1039", url: "https://picsum.photos/id/1039/1200/800", label: "Mist" },
];

const DEFAULT_IMAGE = PRESETS[0].url;

export default function AnaglyphPage() {
  const [imageUrl, setImageUrl] = useState(DEFAULT_IMAGE);
  const [inputValue, setInputValue] = useState(DEFAULT_IMAGE);
  const [redOffset, setRedOffset] = useState(5);
  const [cyanOffset, setCyanOffset] = useState(-5);
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [useSvgFilter, setUseSvgFilter] = useState(false);
  const [imageError, setImageError] = useState(false);

  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const baseRedOffsetRef = useRef(5);
  const baseCyanOffsetRef = useRef(-5);

  // Animation loop using requestAnimationFrame + sine waves (independent channels)
  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = (timestamp - startTimeRef.current) / 1000;

    // Red oscillates at 1.7 rad/s
    const redSine = Math.sin(elapsed * 1.7);
    const newRedOffset = baseRedOffsetRef.current + redSine * (Math.abs(baseRedOffsetRef.current) * 0.8 + 2);
    setRedOffset(Math.max(-30, Math.min(30, newRedOffset)));

    // Cyan oscillates at 2.3 rad/s with phase shift of 1.0
    const cyanSine = Math.sin(elapsed * 2.3 + 1.0);
    const newCyanOffset = baseCyanOffsetRef.current + cyanSine * (Math.abs(baseCyanOffsetRef.current) * 0.8 + 2);
    setCyanOffset(Math.max(-30, Math.min(30, newCyanOffset)));

    animRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (animating) {
      baseRedOffsetRef.current = redOffset;
      baseCyanOffsetRef.current = cyanOffset;
      startTimeRef.current = 0;
      animRef.current = requestAnimationFrame(animate);
    } else {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
    }
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animating, animate]);

  // Validate image loading
  useEffect(() => {
    setImageError(false);
    const img = new Image();
    img.onload = () => setImageError(false);
    img.onerror = () => setImageError(true);
    img.src = imageUrl;
  }, [imageUrl]);

  const handleUrlSubmit = () => {
    if (inputValue.trim()) {
      setImageUrl(inputValue.trim());
    }
  };

  const handlePresetClick = (url: string) => {
    setInputValue(url);
    setImageUrl(url);
  };

  // Source input for SVG filter: either grayscale-converted or raw SourceGraphic
  const svgFilterSource = grayscale ? "gray" : "SourceGraphic";

  return (
    <ExperimentLayout title="Anaglyph 3D">
      {/* Hidden SVG filter definition */}
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <filter id="anaglyph-filter" colorInterpolationFilters="sRGB">
            {/* Optional grayscale conversion */}
            {grayscale && (
              <feColorMatrix type="saturate" values="0" in="SourceGraphic" result="gray" />
            )}
            {/* Red channel: offset by redOffset */}
            <feOffset in={svgFilterSource} dx={redOffset} dy={0} result="red-shifted" />
            <feComponentTransfer in="red-shifted" result="red-layer">
              <feFuncR type="identity" />
              <feFuncG type="discrete" tableValues="0" />
              <feFuncB type="discrete" tableValues="0" />
            </feComponentTransfer>
            {/* Cyan channel: offset by cyanOffset */}
            <feOffset in={svgFilterSource} dx={cyanOffset} dy={0} result="cyan-shifted" />
            <feComponentTransfer in="cyan-shifted" result="cyan-layer">
              <feFuncR type="discrete" tableValues="0" />
              <feFuncG type="identity" />
              <feFuncB type="identity" />
            </feComponentTransfer>
            {/* Blend them together */}
            <feBlend in="red-layer" in2="cyan-layer" mode="screen" />
          </filter>
        </defs>
      </svg>

      <div className="w-full h-full flex flex-col lg:flex-row pt-12">
        {/* Main image area */}
        <div className="flex-1 relative flex items-center justify-center p-4 lg:p-8 min-h-0">
          {imageError ? (
            <div className="text-neutral-500 text-sm border border-neutral-800 rounded-lg p-8 text-center max-w-md">
              <p className="mb-2">⚠ Could not load image</p>
              <p className="text-xs text-neutral-600">
                The image URL may be invalid or blocked by CORS. Try a different URL or use one of the presets.
              </p>
            </div>
          ) : useSvgFilter ? (
            /* SVG Filter Mode */
            <div
              className="w-full h-full max-w-4xl max-h-[70vh] lg:max-h-full rounded-lg overflow-hidden"
              style={{
                perspective: "800px",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  backgroundImage: `url(${imageUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "url(#anaglyph-filter)",
                  transform: `rotateY(${rotation}deg)`,
                  transition: animating ? "none" : "transform 0.2s ease",
                }}
              />
            </div>
          ) : (
            /* CSS Blend Mode */
            <div
              className="w-full h-full max-w-4xl max-h-[70vh] lg:max-h-full rounded-lg overflow-hidden"
              style={{
                perspective: "800px",
              }}
            >
              <div
                className="relative w-full h-full"
                style={{
                  transform: `rotateY(${rotation}deg)`,
                  transition: animating ? "none" : "transform 0.2s ease",
                }}
              >
                {/* Cyan layer (base) */}
                {grayscale ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      transform: `translateX(${cyanOffset}px)`,
                      transition: animating ? "none" : "transform 0.1s ease",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${imageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: "grayscale(100%)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "#00ffff",
                        mixBlendMode: "lighten",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url(${imageUrl})`,
                      backgroundColor: "#00ffff",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundBlendMode: "lighten",
                      transform: `translateX(${cyanOffset}px)`,
                      transition: animating ? "none" : "transform 0.1s ease",
                    }}
                  />
                )}
                {/* Red layer (offset, blended on top) */}
                {grayscale ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      mixBlendMode: "darken",
                      transform: `translateX(${redOffset}px)`,
                      transition: animating ? "none" : "transform 0.1s ease",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundImage: `url(${imageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        filter: "grayscale(100%)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        backgroundColor: "#ff0000",
                        mixBlendMode: "lighten",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `url(${imageUrl})`,
                      backgroundColor: "#ff0000",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundBlendMode: "lighten",
                      mixBlendMode: "darken",
                      transform: `translateX(${redOffset}px)`,
                      transition: animating ? "none" : "transform 0.1s ease",
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Control panel */}
        <div className="lg:w-72 xl:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="p-4 space-y-5">
            <h2 className="text-[10px] uppercase tracking-widest text-white/30 mb-4">
              Controls
            </h2>

            {/* Image URL */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Image URL
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white/80 placeholder-white/20 focus:outline-none focus:border-white/30 min-w-0"
                  placeholder="https://..."
                />
                <button
                  onClick={handleUrlSubmit}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded text-xs text-white/60 hover:text-white/90 transition-colors shrink-0"
                >
                  Load
                </button>
              </div>
            </div>

            {/* Red Offset slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-wider text-red-400/60 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500/70" />
                  Red Offset
                </label>
                <span className="text-[10px] text-white/30 tabular-nums">
                  {redOffset.toFixed(1)}px
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                step={0.5}
                value={redOffset}
                onChange={(e) => {
                  setRedOffset(parseFloat(e.target.value));
                  if (animating) {
                    baseRedOffsetRef.current = parseFloat(e.target.value);
                  }
                }}
                disabled={animating}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ accentColor: "#f87171" }}
              />
            </div>

            {/* Cyan Offset slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-wider text-cyan-400/60 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-500/70" />
                  Cyan Offset
                </label>
                <span className="text-[10px] text-white/30 tabular-nums">
                  {cyanOffset.toFixed(1)}px
                </span>
              </div>
              <input
                type="range"
                min={-30}
                max={30}
                step={0.5}
                value={cyanOffset}
                onChange={(e) => {
                  setCyanOffset(parseFloat(e.target.value));
                  if (animating) {
                    baseCyanOffsetRef.current = parseFloat(e.target.value);
                  }
                }}
                disabled={animating}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ accentColor: "#22d3ee" }}
              />
            </div>

            {/* Rotation slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase tracking-wider text-white/40">
                  Rotation Y
                </label>
                <span className="text-[10px] text-white/30 tabular-nums">
                  {rotation}°
                </span>
              </div>
              <input
                type="range"
                min={-20}
                max={20}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value))}
                className="w-full h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-white/60"
              />
            </div>

            {/* Animation toggle */}
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Animate
              </label>
              <button
                onClick={() => setAnimating(!animating)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  animating ? "bg-white/30" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                    animating ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Grayscale toggle */}
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Grayscale
              </label>
              <button
                onClick={() => setGrayscale(!grayscale)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  grayscale ? "bg-white/30" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                    grayscale ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* SVG Filter toggle */}
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                SVG Filter Mode
              </label>
              <button
                onClick={() => setUseSvgFilter(!useSvgFilter)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  useSvgFilter ? "bg-white/30" : "bg-white/10"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/80 transition-transform ${
                    useSvgFilter ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Mode indicator */}
            <div className="text-[10px] text-white/20 border border-white/5 rounded px-2 py-1.5">
              {useSvgFilter
                ? "Using SVG feOffset + feComponentTransfer + feBlend"
                : "Using CSS background-blend-mode + mix-blend-mode"}
            </div>

            {/* Preset gallery */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-white/40">
                Presets
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => handlePresetClick(preset.url)}
                    className={`aspect-square rounded overflow-hidden border transition-colors ${
                      imageUrl === preset.url
                        ? "border-white/40"
                        : "border-white/10 hover:border-white/25"
                    }`}
                    title={preset.label}
                  >
                    <div
                      className="w-full h-full"
                      style={{
                        backgroundImage: `url(https://picsum.photos/id/${preset.id}/100/100)`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="text-[10px] text-white/15 leading-relaxed pt-2 border-t border-white/5">
              Classic anaglyph 3D — view with red/cyan glasses for stereoscopic depth.
              Adjust red &amp; cyan offsets independently to control channel separation.
              Enable grayscale for cleaner 3D without colour conflicts.
            </div>
          </div>
        </div>
      </div>
    </ExperimentLayout>
  );
}
