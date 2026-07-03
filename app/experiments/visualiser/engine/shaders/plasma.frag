#version 300 es
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
