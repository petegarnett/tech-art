#version 300 es
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
