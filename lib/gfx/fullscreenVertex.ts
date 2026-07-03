/**
 * fullscreenVertex.ts — the standard fullscreen-triangle vertex shader.
 *
 * A single triangle that covers the entire (-1..1, -1..1) viewport, generated
 * from gl_VertexID (no VBO needed). This is the standard trick for running a
 * fragment shader across the whole canvas.
 *
 * vUv is output in 0..1 for fragment shaders to sample textures with.
 *
 * Reusable across any WebGL2 experiment.
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
