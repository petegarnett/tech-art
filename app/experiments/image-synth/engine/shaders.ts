/**
 * shaders.ts — TS strings for the WebGL2 shader sources.
 *
 * The .glsl / .frag files in this directory are mirrored copies (kept for
 * editing convenience + future custom-loader support). At runtime,
 * VisualiserGL reads the strings exported here.
 */

export const VERT_SRC = `#version 300 es
// Fullscreen triangle — 3 vertices generated from gl_VertexID, no VBO needed.
// Outputs vUv in 0..1 for fragment shaders to sample textures with.

out vec2 vUv;

void main() {
  // (0,0), (2,0), (0,2) in clip space → 1 large triangle that covers
  // the entire (-1..1, -1..1) viewport.
  vec2 pos = vec2(
    float((gl_VertexID & 1) << 2) - 1.0,
    float((gl_VertexID & 2) << 1) - 1.0
  );
  vUv = (pos + 1.0) * 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

export const GLITCH_FRAG = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform float iBass;
uniform float iMid;
uniform float iTreble;
uniform float iEnergy;
uniform float iBeat;
uniform sampler2D iCamera;
uniform vec2  iCameraSize;
uniform float iVoiceLevels[32];

in vec2 vUv;
out vec4 fragColor;

// Hash for pseudo-random per-pixel noise (Inigo Quilez style).
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


// Per-preset knobs (all 0-1 user-controlled depth):
uniform float iChromaticAberration;
uniform float iScanlineTear;
uniform float iBitCrush;
uniform float iNoiseDust;
uniform float iEdgeBoost;
uniform float iHueRotate;
uniform float iInvert;
uniform float iFreezeFrame;
uniform float iZoom;
uniform float iBlockShift;
uniform float iVignette;
uniform float iCameraMix;

void main() {
  vec2 uv = vUv;

  // ── 1. Bass-driven zoom in ──────────────────────────────────────────
  // 0% knob → no zoom. 100% knob + full bass → 30% pull-in.
  vec2 centered = uv - 0.5;
  float zoomAmount = 1.0 - iZoom * iBass * 0.3;
  uv = centered * zoomAmount + 0.5;

  // ── 2. Scanline tear ────────────────────────────────────────────────
  // Horizontal strips jitter independently. Tied to mid frequencies.
  float lineH = 1.0 / 80.0;
  float lineY = floor(uv.y / lineH);
  float tear = (hash(vec2(lineY, floor(iTime * 8.0))) * 2.0 - 1.0)
               * iScanlineTear * (0.02 + iMid * 0.15);
  uv.x += tear;

  // ── 3. Block-shift datamoshing ──────────────────────────────────────
  // Divide screen into blocks; some blocks jump to a random offset.
  float blockSize = 1.0 / 24.0;
  vec2 block = floor(uv / blockSize);
  float blockHash = hash(block + floor(iTime * 4.0));
  float shiftProb = iBlockShift * (0.1 + iEnergy * 0.6);
  if (blockHash > 1.0 - shiftProb) {
    uv += (vec2(hash(block + 17.0), hash(block + 31.0)) * 2.0 - 1.0) * blockSize * 1.5;
  }

  // Wrap UVs so we don't sample out of bounds.
  uv = fract(uv);

  // ── 4. Chromatic aberration ─────────────────────────────────────────
  // Three taps of the camera with R/G/B at slightly different UVs.
  float ab = iChromaticAberration * (0.003 + iTreble * 0.025);
  vec2 dir = (uv - 0.5);
  if (length(dir) > 1e-5) dir = normalize(dir) * ab; else dir = vec2(0.0);
  float r = texture(iCamera, uv + dir).r;
  float g = texture(iCamera, uv).g;
  float b = texture(iCamera, uv - dir).b;
  vec3 col = vec3(r, g, b);

  // ── 5. Edge boost (cheap 4-tap Sobel) ───────────────────────────────
  float dx = 1.0 / iCameraSize.x;
  float dy = 1.0 / iCameraSize.y;
  vec3 cR = texture(iCamera, uv + vec2(dx, 0.0)).rgb;
  vec3 cL = texture(iCamera, uv - vec2(dx, 0.0)).rgb;
  vec3 cU = texture(iCamera, uv + vec2(0.0, dy)).rgb;
  vec3 cD = texture(iCamera, uv - vec2(0.0, dy)).rgb;
  vec3 edge = abs(cR - cL) + abs(cU - cD);
  col += edge * iEdgeBoost * (0.5 + iTreble * 1.5);

  // ── 6. Bit crush / posterise ───────────────────────────────────────
  // Reduce colour resolution. Knob at 0 = 256 levels (passthrough),
  // knob at 1 = 4 levels.
  float levels = mix(256.0, 4.0, iBitCrush);
  col = floor(col * levels) / levels;

  // ── 7. Hue rotate ───────────────────────────────────────────────────
  if (iHueRotate > 0.001) {
    vec3 hsv = rgb2hsv(col);
    // Modulate by iTime for slow drift, plus knob value for absolute offset.
    hsv.x = fract(hsv.x + iHueRotate + iTime * 0.05);
    col = hsv2rgb(hsv);
  }

  // ── 8. Invert (binary threshold) ────────────────────────────────────
  col = mix(col, 1.0 - col, step(0.5, iInvert));

  // ── 9. Noise dust ───────────────────────────────────────────────────
  float n = hash(uv * 437.0 + iTime * 13.0) * 2.0 - 1.0;
  col += n * iNoiseDust * 0.18;

  // ── 10. Freeze on beat (visual flash) ───────────────────────────────
  // iBeat is 1 on the frame a beat fires; we flash bright then settle.
  // iFreezeFrame scales the flash intensity. (The texture freeze itself
  // is handled in JS by swapping the camera texture; the shader just adds
  // the visual punctuation.)
  col += vec3(iBeat * iFreezeFrame * 0.4);
  // Bright pop on the voice levels — pick the loudest voice for a sparkle.
  float maxV = 0.0;
  for (int i = 0; i < 32; i++) maxV = max(maxV, iVoiceLevels[i]);
  col += vec3(maxV * 0.05) * iEnergy;

  // ── 11. Vignette ────────────────────────────────────────────────────
  float vd = length(vUv - 0.5);
  col *= 1.0 - iVignette * smoothstep(0.3, 1.0, vd);

  // ── 12. Mix with energy tint ────────────────────────────────────────
  // When iCameraMix < 1, blend in a colour from the FFT bands so the
  // visual still responds to audio when the camera is dark.
  vec3 energyTint = vec3(iBass, iMid, iTreble);
  col = mix(energyTint, col, clamp(iCameraMix, 0.0, 1.0));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
export const FLOW_FRAG = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform float iBass;
uniform float iMid;
uniform float iTreble;
uniform float iEnergy;
uniform float iBeat;
uniform sampler2D iCamera;
uniform vec2  iCameraSize;
uniform float iVoiceLevels[32];

in vec2 vUv;
out vec4 fragColor;

// Hash for pseudo-random per-pixel noise (Inigo Quilez style).
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


// Per-preset knobs (placeholders — preset is a stub).
uniform float iFlowParam0;
uniform float iFlowParam1;
uniform float iFlowParam2;
uniform float iFlowParam3;
uniform float iFlowParam4;
uniform float iFlowParam5;
uniform float iFlowParam6;
uniform float iFlowParam7;
uniform float iFlowParam8;
uniform float iFlowParam9;
uniform float iFlowParam10;
uniform float iFlowParam11;

// TODO: Jin Lee inspired — fog particles, laminar vs turbulent flows.
// Stub renders a dark blue field with a subtle audio-reactive horizon glow
// so the canvas isn't pure black while the preset is unfinished.
void main() {
  vec3 base = vec3(0.05, 0.05, 0.10);
  float glow = exp(-pow((vUv.y - 0.5) * 6.0, 2.0)) * iEnergy * 0.4;
  vec3 col = base + vec3(0.10, 0.18, 0.30) * glow;
  fragColor = vec4(col, 1.0);
}
`;
export const MUTATE_FRAG = `#version 300 es
precision highp float;

uniform float iTime;
uniform vec2  iResolution;
uniform float iBass;
uniform float iMid;
uniform float iTreble;
uniform float iEnergy;
uniform float iBeat;
uniform sampler2D iCamera;
uniform vec2  iCameraSize;
uniform float iVoiceLevels[32];

in vec2 vUv;
out vec4 fragColor;

// Hash for pseudo-random per-pixel noise (Inigo Quilez style).
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}


// Per-preset knobs (placeholders — preset is a stub).
uniform float iMutateParam0;
uniform float iMutateParam1;
uniform float iMutateParam2;
uniform float iMutateParam3;
uniform float iMutateParam4;
uniform float iMutateParam5;
uniform float iMutateParam6;
uniform float iMutateParam7;
uniform float iMutateParam8;
uniform float iMutateParam9;
uniform float iMutateParam10;
uniform float iMutateParam11;

// TODO: Lisa Meinesz inspired — metallic SDF blob with audio displacement.
// Stub: dark red field with a small breathing centre, to confirm the
// pipeline routes through this shader before the real one lands.
void main() {
  vec3 base = vec3(0.10, 0.05, 0.05);
  float d = length(vUv - 0.5);
  float blob = smoothstep(0.30 + iBass * 0.10, 0.10, d);
  vec3 col = base + vec3(0.25, 0.10, 0.05) * blob;
  fragColor = vec4(col, 1.0);
}
`;
