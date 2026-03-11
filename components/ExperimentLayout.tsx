"use client";

import Link from "next/link";

interface ExperimentLayoutProps {
  title: string;
  children: React.ReactNode;
}

export default function ExperimentLayout({ title, children }: ExperimentLayoutProps) {
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Navigation overlay */}
      <div className="absolute top-0 left-0 z-50 flex items-center gap-3 p-4">
        <Link
          href="/"
          className="text-white/30 hover:text-white/70 transition-colors text-sm"
          aria-label="Back to gallery"
        >
          ← back
        </Link>
        <span className="text-white/20 text-xs tracking-wide">
          {title}
        </span>
      </div>

      {/* Experiment canvas area */}
      <div className="w-full h-full">
        {children}
      </div>
    </div>
  );
}
