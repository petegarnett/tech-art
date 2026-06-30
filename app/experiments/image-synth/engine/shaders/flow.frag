#version 300 es
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
