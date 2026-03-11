# Tech Art Lab

A creative coding playground for generative art, visual experiments, and algorithmic beauty. Built with Next.js, TypeScript, and the HTML Canvas API.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Font:** Geist Mono
- **Canvas:** HTML5 Canvas with a custom React hook

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the gallery.

## Adding a New Experiment

1. Create a new directory under `app/experiments/`:

   ```
   app/experiments/my-experiment/page.tsx
   ```

2. Use the shared `ExperimentLayout` wrapper and `useCanvas` hook:

   ```tsx
   "use client";

   import { useRef } from "react";
   import ExperimentLayout from "@/components/ExperimentLayout";
   import { useCanvas } from "@/lib/canvas/setup";

   export default function MyExperiment() {
     const canvasRef = useRef<HTMLCanvasElement>(null);

     useCanvas(canvasRef, ({ ctx, width, height, elapsed }) => {
       ctx.clearRect(0, 0, width, height);
       // Your drawing code here
     });

     return (
       <ExperimentLayout title="My Experiment">
         <canvas ref={canvasRef} className="block w-full h-full" />
       </ExperimentLayout>
     );
   }
   ```

3. Add the experiment to the gallery by updating the `experiments` array in `app/page.tsx`:

   ```ts
   const experiments: Experiment[] = [
     {
       slug: "my-experiment",
       title: "My Experiment",
       description: "A brief description of what this does.",
       date: "2025-01-15",
     },
   ];
   ```

## Project Structure

```
tech-art/
├── app/
│   ├── layout.tsx              # Root layout — dark theme, Geist Mono
│   ├── page.tsx                # Gallery index — lists all experiments
│   ├── globals.css             # Base styles + Tailwind
│   └── experiments/            # Each experiment gets a directory here
│       └── [slug]/page.tsx
├── components/
│   └── ExperimentLayout.tsx    # Shared wrapper for experiments
├── lib/
│   ├── canvas/
│   │   └── setup.ts            # useCanvas hook — resize, DPR, animation loop
│   ├── math/
│   │   ├── vec2.ts             # 2D vector operations
│   │   └── utils.ts            # clamp, lerp, easing functions
│   └── colour/
│       └── palettes.ts         # Curated colour palettes
└── public/                     # Static assets
```

## Utilities

### `useCanvas` Hook

Handles canvas setup, DPR scaling, resize observation, and the animation loop. Your draw function receives:

- `ctx` — the 2D rendering context (already DPR-scaled)
- `width`, `height` — logical dimensions in CSS pixels
- `frameCount` — frames since mount
- `deltaTime` — seconds since last frame
- `elapsed` — seconds since mount

### Vec2

Basic 2D vector math: `add`, `sub`, `mul`, `div`, `length`, `normalize`, `dot`, `distance`, `lerp`.

### Math Utils

`clamp`, `map` (range remapping), `lerp`, and easing functions (`easeInOut`, `easeInQuad`, `easeOutQuad`, `easeInOutCubic`).

### Colour Palettes

Curated palettes: Warm Sunset, Cool Ocean, Neon, Monochrome, Earth Tones, Retrowave, Forest. Each palette is an array of hex strings with helper functions `randomColour` and `colourAt`.

## License

MIT
