/**
 * shaders.ts — TS-string exports of the fragment shader sources.
 *
 * The .frag files in ./shaders/ are the canonical form (edit-friendly for
 * GLSL tooling). At runtime, VisualiserGL reads these string exports —
 * they're kept in sync manually. If you edit a .frag, mirror the change
 * here (or add a build step; not worth it yet).
 */
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

export const PLASMA_FRAG = `#version 300 es
precision highp float;

/**
 * PLASMA — MilkDrop-classic flowing plasma.
 *
 * A layered sum of sinusoidal fields, coloured by a cosine palette, with
 * audio-reactive scale / speed / colour rotation.
 *
 * Uniform contract (all optional — VisualiserGL sets whichever exist):
 *   iTime, iResolution                 — engine
 *   iBass, iMid, iTreble, iEnergy, iBeat — FFT bands (0..1 mostly, beat 0/1)
 *   iScale, iSpeed, iComplexity        — base plasma controls (0..1)
 *   iBassZoom, iTrebleDetail, iBeatFlash — audio-reactivity depth (0..1)
 *   iColourCycle, iSaturation, iBrightness — colour controls (0..1)
 *   iVignette, iSymmetry               — post + kaleidoscope (0..1)
 */

uniform float iTime;
uniform vec2  iResolution;
uniform float iBass;
uniform float iMid;
uniform float iTreble;
uniform float iEnergy;
uniform float iBeat;

// Preset knobs (all 0-1 user-controlled depth):
uniform float iScale;         // 0-1, base plasma frequency (0 = huge waves, 1 = tight)
uniform float iSpeed;         // 0-1, temporal drift speed
uniform float iComplexity;    // 0-1, layered sine fields count (linear 2..6)
uniform float iBassZoom;      // 0-1, bass drives radial zoom
uniform float iTrebleDetail;  // 0-1, treble adds high-frequency layer
uniform float iColourCycle;   // 0-1, palette rotation speed
uniform float iSaturation;    // 0-1
uniform float iBrightness;    // 0-1
uniform float iVignette;      // 0-1
uniform float iBeatFlash;     // 0-1, beat pulse intensity
uniform float iSymmetry;      // 0-1, mirror-symmetry amount

in vec2 vUv;
out vec4 fragColor;

// Iñigo-Quilez cosine palette — smooth gradient across a full cycle of t.
// The three phase offsets give a warm/cool triadic feel.
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t));
}

void main() {
  // Screen-space in [-1,1], aspect-corrected so sines look isotropic.
  vec2 p = (vUv * 2.0 - 1.0);
  p.x *= iResolution.x / iResolution.y;

  // ── Bass zoom ── low frequencies pull us in radially.
  p /= 1.0 + iBassZoom * iBass * 0.5;

  // ── Kaleidoscope ── fold angle-space into 2..8 wedges.
  // iSymmetry 0 = no folding, 1 = 8-fold symmetry.
  if (iSymmetry > 0.001) {
    float ang = atan(p.y, p.x);
    float r = length(p);
    float wedges = 2.0 + iSymmetry * 6.0;
    ang = mod(ang, 6.2831 / wedges);
    p = vec2(cos(ang), sin(ang)) * r;
  }

  // Time scaled by user speed. Speed=0 → slow drift, speed=1 → frantic.
  float t = iTime * (0.2 + iSpeed * 2.0);
  float layers = mix(2.0, 6.0, iComplexity);
  float k = mix(1.0, 8.0, iScale);

  // Sum up to 6 sine layers; each adds three cross-diagonal waves.
  // Note the fixed loop bound + explicit break — GLSL ES loop unrolling
  // is happier with this pattern than a dynamic upper bound.
  float v = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= layers) break;
    float fi = float(i);
    v += sin(p.x * k * (fi * 0.5 + 1.0) + t * (fi + 1.0));
    v += cos(p.y * k * (fi * 0.4 + 0.8) - t * (fi * 0.7 + 1.0));
    v += sin((p.x + p.y) * k * (fi * 0.3 + 0.5) + t * (fi * 0.5 + 0.5));
  }
  v /= layers * 3.0;

  // ── Treble detail ── high-frequency shimmer on top of the base field.
  v += sin(p.x * 30.0 + t * 10.0) * cos(p.y * 30.0) * iTrebleDetail * iTreble * 0.2;

  // ── Colour ── palette lookup, then saturation + brightness controls.
  vec3 col = palette(v + iColourCycle * iTime * 0.3 + iMid * 0.1);
  // Luma-lock desaturation: mix toward grey by iSaturation.
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, iSaturation);
  col *= mix(0.4, 1.6, iBrightness);
  // Beat flash — an additive white pulse. iBeat is sustained across frames.
  col += vec3(iBeatFlash * iBeat * 0.3);

  // ── Vignette ── radial darkening for depth.
  float vd = length(vUv - 0.5);
  col *= 1.0 - iVignette * smoothstep(0.3, 1.0, vd);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export const TUNNEL_FRAG = `#version 300 es
precision highp float;

/**
 * TUNNEL — perspective tunnel via polar/log-radial coords.
 *
 * We're not raymarching — cheaper hack: convert screen to polar (angle,
 * radius), take the log of radius (turns the punch-hole into a corridor),
 * translate along z over time, sample a procedural surface (checker / grid /
 * noise), tint by band levels, apply glow + vignette.
 *
 * All knobs at 0.5 gives a mid-speed corridor with faint checker walls —
 * the safe baseline.
 *
 * Uniforms:
 *   iTime, iResolution, iBass, iMid, iTreble, iEnergy, iBeat — standard
 *   iZoomSpeed        (0..1) base corridor speed
 *   iRotation         (0..1) rotation rate about the depth axis
 *   iTexture          (0..1) 0 = checker, 0.5 = mixed, 1 = grid
 *   iSurfaceDistort   (0..1) baseline wall displacement (independent of audio)
 *   iColourHue        (0..1) palette hue offset (loops)
 *   iBassSpeed        (0..1) bass → extra depth speed
 *   iTrebleDistort    (0..1) treble → glitchy displacement
 *   iGlow             (0..1) additive centre glow
 *   iVignette         (0..1)
 *   iBeatFlash        (0..1) beat pulse intensity (forward punch + flash)
 *   iBrightness       (0..1)
 */

uniform float iTime;
uniform vec2  iResolution;
uniform float iBass;
uniform float iMid;
uniform float iTreble;
uniform float iEnergy;
uniform float iBeat;

uniform float iZoomSpeed;
uniform float iRotation;
uniform float iTexture;
uniform float iSurfaceDistort;
uniform float iColourHue;
uniform float iBassSpeed;
uniform float iTrebleDistort;
uniform float iGlow;
uniform float iVignette;
uniform float iBeatFlash;
uniform float iBrightness;

in vec2 vUv;
out vec4 fragColor;

// Cheap 2D hash — used for the noise texture channel.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Smooth noise (value noise via bilinear interp of hash grid).
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Cosine palette shifted by iColourHue — three phase offsets pick a triadic scheme.
vec3 palette(float t, float hueOffset) {
  return 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + t + hueOffset));
}

void main() {
  // Screen space in [-1..1], aspect-corrected.
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  // Guard divide-by-zero near the origin: a tiny epsilon nudge avoids NaN
  // pixels at the vanishing point.
  float r = length(uv) + 1e-4;
  float ang = atan(uv.y, uv.x);

  // Depth speed — user knob (baseline 0.15..1.5), bass modulation, and
  // an audible forward "punch" on the beat.
  float depthSpeed = mix(0.15, 1.5, iZoomSpeed)
    + iBass * iBassSpeed * 1.2
    + iBeat * iBeatFlash * 0.6;
  float z = iTime * depthSpeed;

  // Rotation about the depth axis. Rate scales with iRotation.
  ang += iTime * (iRotation - 0.5) * 1.2;

  // Log-radial mapping turns the "outside → outward" perception into
  // "outside → far away", i.e. a corridor stretching toward the horizon.
  // v = 0..1 across the tunnel wall texture; u = 0..1 around it.
  float u = ang / 6.2831;
  float v = 1.0 / r + z;

  // Baseline surface displacement — user knob + treble jitter.
  float distort = iSurfaceDistort * 0.15 + iTreble * iTrebleDistort * 0.25;
  u += sin(v * 6.0 + iTime * 2.0) * distort;
  v += cos(u * 12.5 + iTime * 3.0) * distort * 0.5;

  // ── Wall texture ── three channels blended by iTexture.
  //   iTexture = 0.0 → checker
  //   iTexture = 0.5 → 50/50 mix
  //   iTexture = 1.0 → grid
  // A noise channel sits underneath both, weighted by the middle of the range.
  vec2 uv2 = vec2(u * 8.0, v * 4.0);
  float checker = mod(floor(uv2.x) + floor(uv2.y), 2.0);
  vec2 gv = fract(uv2);
  float gridLine = smoothstep(0.05, 0.0, gv.x)
                 + smoothstep(0.05, 0.0, gv.y)
                 + smoothstep(0.95, 1.0, gv.x)
                 + smoothstep(0.95, 1.0, gv.y);
  gridLine = clamp(gridLine, 0.0, 1.0);
  float noiseTex = noise(uv2 * 2.0 + iTime * 0.3);

  // Bell curve peaking at iTexture = 0.5 for the noise contribution.
  float noiseWeight = 1.0 - abs(iTexture * 2.0 - 1.0);
  float surface = mix(checker, gridLine, iTexture);
  surface = mix(surface, noiseTex, noiseWeight * 0.5);

  // ── Colour ── palette lookup, hue shifted by mid frequencies and knob.
  float paletteT = v * 0.15 + iMid * 0.3;
  vec3 col = palette(paletteT, iColourHue) * (0.3 + surface * 0.9);

  // ── Depth fog ── far away = dark. Adds the "moving through a tunnel" cue.
  float depthFog = smoothstep(0.0, 3.0, r);
  col *= mix(1.0, 0.25, depthFog);

  // ── Centre glow ── additive haze at the vanishing point.
  float glow = exp(-r * 4.0) * iGlow * (0.6 + iEnergy * 1.2);
  col += palette(iTime * 0.1, iColourHue) * glow;

  // Beat flash — a soft white pulse.
  col += vec3(iBeat * iBeatFlash * 0.25);

  // Brightness knob (0.4..1.6 range).
  col *= mix(0.4, 1.6, iBrightness);

  // Vignette.
  float vd = length(vUv - 0.5);
  col *= 1.0 - iVignette * smoothstep(0.3, 1.0, vd);

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;
