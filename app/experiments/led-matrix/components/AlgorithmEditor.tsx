"use client";

interface AlgorithmEditorProps {
  code: string;
  onChange: (code: string) => void;
  onApply: () => void;
  error: string | null;
}

export default function AlgorithmEditor({
  code,
  onChange,
  onApply,
  error,
}: AlgorithmEditorProps) {
  return (
    <div className="space-y-3">
      {/* Function signature hint */}
      <div className="text-[10px] text-white/30 font-mono">
        {"// (x, y, t, cols, rows, frame) => [r, g, b]"}
      </div>

      {/* Code editor textarea */}
      <textarea
        value={code}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full h-[200px] bg-white/5 border border-white/10 rounded-md p-3 text-[11px] leading-relaxed text-white/80 font-mono resize-none focus:outline-none focus:border-white/20 placeholder-white/20"
        placeholder="Write your pixel function here..."
      />

      {/* Apply button */}
      <button
        onClick={onApply}
        className="px-4 py-1.5 text-[10px] uppercase tracking-wider border border-white/10 rounded-md hover:border-white/20 hover:bg-white/5 transition-colors text-white/60 hover:text-white/80"
      >
        Apply
      </button>

      {/* Error display */}
      {error && (
        <div className="text-[10px] text-red-400/80 bg-red-400/5 border border-red-400/10 rounded-md p-2 font-mono break-all">
          {error}
        </div>
      )}
    </div>
  );
}
