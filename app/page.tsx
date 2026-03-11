import Link from "next/link";

interface Experiment {
  slug: string;
  title: string;
  description: string;
  date: string;
}

const experiments: Experiment[] = [
  {
    slug: "anaglyph-3d",
    title: "Anaglyph 3D",
    description: "Classic red/cyan stereoscopic effect using pure CSS blend modes. Paste any image and watch it pop.",
    date: "2025-03-11",
  },
  {
    slug: "wireframe-terrain",
    title: "Wireframe Terrain",
    description: "Retro 3D wireframe landscape with audio reactivity. Scrolling terrain driven by noise, controllable via sliders or your microphone.",
    date: "2025-03-11",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-16 max-w-5xl mx-auto">
      <header className="mb-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          Tech Art Lab
        </h1>
        <p className="text-neutral-500 text-lg">
          A creative coding playground — generative art, visual experiments, and algorithmic beauty.
        </p>
      </header>

      {experiments.length === 0 ? (
        <div className="text-neutral-600 text-sm border border-neutral-800 rounded-lg p-12 text-center">
          No experiments yet. Create one in <code className="text-neutral-400">app/experiments/</code> to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {experiments.map((exp) => (
            <Link
              key={exp.slug}
              href={`/experiments/${exp.slug}`}
              className="group block border border-neutral-800 rounded-lg p-5 hover:border-neutral-600 transition-colors"
            >
              <h2 className="text-base font-medium mb-1 group-hover:text-white text-neutral-200">
                {exp.title}
              </h2>
              <p className="text-neutral-500 text-sm mb-3 line-clamp-2">
                {exp.description}
              </p>
              <time className="text-neutral-700 text-xs">{exp.date}</time>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
