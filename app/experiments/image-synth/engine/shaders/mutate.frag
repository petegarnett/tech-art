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
