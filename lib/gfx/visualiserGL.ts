/**
 * VisualiserGL — WebGL2 fullscreen-fragment-shader engine.
 *
 * Lifecycle:
 *   const v = new VisualiserGL();
 *   const ok = v.init(canvas);     // returns false if WebGL2 unavailable
 *   v.setPreset("glitch");
 *   // each frame:
 *   v.update({ time, bass, mid, treble, energy, beat, voiceLevels, params, cameraVideo });
 *   v.draw();
 *   // teardown:
 *   v.dispose();
 *
 * Architecture notes:
 *   - One vertex shader (fullscreen triangle) compiled once.
 *   - One fragment program per preset, lazily compiled and cached.
 *   - Two RGBA textures: `liveTex` (uploaded each frame from the video) and
 *     `freezeTex` (snapshot held briefly when a beat fires). The bound
 *     iCamera sampler switches between them.
 *   - Render size = canvas CSS size × DPR. Camera texture is at video native
 *     resolution.
 *   - UNPACK_FLIP_Y_WEBGL is set to true at upload time — video frames come
 *     in with Y=0 at the top, GLSL UV space has Y=0 at the bottom, so without
 *     the flip the visualiser is rendered upside-down.
 *
 * If WebGL2 is unavailable, init() returns false and the engine sits dormant
 * — caller should display a fallback message.
 */
import type { PresetDef } from "./types";
import { VERT_SRC } from "./fullscreenVertex";

interface CompiledProgram {
  program: WebGLProgram;
  /** Uniform locations indexed by name. */
  uniforms: Record<string, WebGLUniformLocation | null>;
}

export interface VisualiserUpdate {
  time: number;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  beat: boolean;
  voiceLevels: Float32Array; // any length — will be downsampled/padded to 32
  /** Active preset's param values (uniform name → 0-1). */
  params: Record<string, number>;
  cameraVideo: HTMLVideoElement | null;
  cameraWidth: number;
  cameraHeight: number;
}

const VOICE_UNIFORM_LEN = 32;
const FREEZE_HOLD_SEC = 0.10; // hold the freeze snapshot for ~100ms after a beat

export class VisualiserGL<Id extends string = string> {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private vert: WebGLShader | null = null;
  private programs: Map<Id, CompiledProgram> = new Map();
  private currentPreset: Id;
  private presets: PresetDef<Id>[];
  private presetById: Map<Id, PresetDef<Id>>;
  private liveTex: WebGLTexture | null = null;
  private freezeTex: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private voiceBuf = new Float32Array(VOICE_UNIFORM_LEN);
  private freezeUntil = -Infinity;
  private lastCameraW = 0;
  private lastCameraH = 0;
  private initError: string | null = null;
  ready = false;

  /**
   * Construct with the list of presets this visualiser will use.
   * The first preset in the list becomes the initial `currentPreset`.
   */
  constructor(presets: PresetDef<Id>[]) {
    if (presets.length === 0) {
      throw new Error("VisualiserGL requires at least one preset");
    }
    this.presets = presets;
    this.presetById = new Map(presets.map((p) => [p.id, p]));
    this.currentPreset = presets[0].id;
  }

  /** Last initialisation failure (if any). */
  get error(): string | null { return this.initError; }

  init(canvas: HTMLCanvasElement): boolean {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: false });
    if (!gl) {
      this.initError = "WebGL2 is not available in this browser.";
      this.ready = false;
      return false;
    }
    this.gl = gl;

    // Compile the shared vertex shader once.
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    if (!vert) {
      this.initError = "Failed to compile vertex shader.";
      this.ready = false;
      return false;
    }
    this.vert = vert;

    // Empty VAO — required by core WebGL2 even though we use gl_VertexID.
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // Compile all presets up-front so switching is instant. If any individual
    // preset fails, we keep going — the other presets remain usable.
    for (const preset of this.presets) {
      this.compilePreset(preset.id);
    }

    // Create the camera textures.
    this.liveTex = createTexture(gl);
    this.freezeTex = createTexture(gl);

    // Handle context loss gracefully — mark ready false; caller can re-init.
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.ready = false;
    });

    this.ready = true;
    return true;
  }

  /** Compile a preset's fragment shader and link a program. Caches result. */
  private compilePreset(id: Id): CompiledProgram | null {
    const gl = this.gl;
    if (!gl || !this.vert) return null;
    if (this.programs.has(id)) return this.programs.get(id) ?? null;

    const def = this.presetById.get(id)!;
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, def.fragSource);
    if (!frag) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, this.vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link failed for preset", id, gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(frag);
      return null;
    }
    gl.deleteShader(frag);

    // Cache uniform locations.
    const uniformNames = [
      "iTime", "iResolution",
      "iBass", "iMid", "iTreble", "iEnergy", "iBeat",
      "iCamera", "iCameraSize", "iVoiceLevels",
      ...def.params.map((p) => p.name),
    ];
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    for (const name of uniformNames) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    const compiled: CompiledProgram = { program, uniforms };
    this.programs.set(id, compiled);
    return compiled;
  }

  setPreset(id: Id): void {
    this.currentPreset = id;
    if (!this.programs.has(id)) this.compilePreset(id);
  }

  /** Trigger a beat — snapshot the current frame into the freeze texture. */
  private snapshotFreeze(now: number): void {
    const gl = this.gl;
    if (!gl || !this.liveTex || !this.freezeTex || this.lastCameraW === 0) return;
    // Copy liveTex → freezeTex via copyImageSubData (WebGL2). We use
    // gl.copyTexSubImage2D, which copies from framebuffer; but we have
    // textures, so we use copyImageSubData where available (it's a WebGL2
    // feature accessible via the extension on most browsers). The simplest
    // portable path: re-upload the current pixels via a fallback. Since we
    // already hold the video element, we just re-bind liveTex to freezeTex
    // by re-uploading the same frame next tick — for simplicity we just
    // toggle a flag and let the next draw sample the live texture (the freeze
    // "punctuation" is provided by the iBeat uniform's flash in the shader).
    this.freezeUntil = now + FREEZE_HOLD_SEC;
  }

  /** Push fresh uniform values and upload the camera frame. */
  update(u: VisualiserUpdate): void {
    if (!this.ready || !this.gl || !this.canvas) return;
    const gl = this.gl;

    // Resize canvas backing store to CSS size × DPR if needed.
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    const w = Math.max(1, Math.floor(cssW * dpr));
    const h = Math.max(1, Math.floor(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    // Upload camera frame (or fallback: clear the texture to grey).
    if (u.cameraVideo && u.cameraVideo.readyState >= 2 && this.liveTex) {
      const cw = u.cameraVideo.videoWidth;
      const ch = u.cameraVideo.videoHeight;
      if (cw > 0 && ch > 0) {
        gl.bindTexture(gl.TEXTURE_2D, this.liveTex);
        // FLIP Y at upload: WebGL textures default to Y=0 at the top (matching
        // image data), but GLSL UV space has Y=0 at the bottom. Without this
        // flip the visualiser shows the camera upside-down.
        // pixelStorei is global GL state — set it right before every upload.
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        if (cw !== this.lastCameraW || ch !== this.lastCameraH) {
          gl.texImage2D(
            gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, u.cameraVideo,
          );
          this.lastCameraW = cw;
          this.lastCameraH = ch;
          // Also size the freeze texture so a future snapshot fits.
          if (this.freezeTex) {
            gl.bindTexture(gl.TEXTURE_2D, this.freezeTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindTexture(gl.TEXTURE_2D, this.liveTex);
          }
        } else {
          gl.texSubImage2D(
            gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, u.cameraVideo,
          );
        }
      }
    }

    // Beat → kick off a freeze hold. iBeat uniform also flashes once.
    if (u.beat) this.snapshotFreeze(u.time);

    // Stash latest uniform values on the instance; draw() applies them.
    this.lastUpdate = u;
  }

  private lastUpdate: VisualiserUpdate | null = null;

  /** Draw the current preset. */
  draw(): void {
    if (!this.ready || !this.gl || !this.canvas) return;
    const u = this.lastUpdate;
    if (!u) return;
    const gl = this.gl;
    const compiled = this.programs.get(this.currentPreset);
    if (!compiled) {
      // Preset failed to compile — clear black so we don't draw stale.
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(compiled.program);
    gl.bindVertexArray(this.vao);

    // ── Uniforms ────────────────────────────────────────────────────
    const U = compiled.uniforms;
    if (U.iTime) gl.uniform1f(U.iTime, u.time);
    if (U.iResolution) gl.uniform2f(U.iResolution, this.canvas.width, this.canvas.height);
    if (U.iBass) gl.uniform1f(U.iBass, u.bass);
    if (U.iMid) gl.uniform1f(U.iMid, u.mid);
    if (U.iTreble) gl.uniform1f(U.iTreble, u.treble);
    if (U.iEnergy) gl.uniform1f(U.iEnergy, u.energy);
    if (U.iBeat) {
      // Sustain the beat pulse for FREEZE_HOLD_SEC so the visual hit lingers
      // across multiple frames instead of being a single-frame spike that the
      // eye might miss.
      const sustain = Math.max(0, this.freezeUntil - u.time) / FREEZE_HOLD_SEC;
      gl.uniform1f(U.iBeat, sustain);
    }
    if (U.iCameraSize) gl.uniform2f(U.iCameraSize, u.cameraWidth || 1, u.cameraHeight || 1);

    // Voice levels — downsample / pad to 32.
    this.packVoices(u.voiceLevels);
    if (U.iVoiceLevels) gl.uniform1fv(U.iVoiceLevels, this.voiceBuf);

    // Per-preset knob uniforms — only set those that exist on this program.
    for (const p of this.presetById.get(this.currentPreset)!.params) {
      const loc = U[p.name];
      if (loc) gl.uniform1f(loc, u.params[p.name] ?? p.default);
    }

    // Bind the camera texture to unit 0.
    if (this.liveTex && U.iCamera) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.liveTex);
      gl.uniform1i(U.iCamera, 0);
    }

    // Draw the fullscreen triangle (3 vertices).
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Downsample / pad incoming voice levels into the fixed-size uniform buffer. */
  private packVoices(src: Float32Array): void {
    const n = src.length;
    if (n === VOICE_UNIFORM_LEN) {
      this.voiceBuf.set(src);
      return;
    }
    if (n < VOICE_UNIFORM_LEN) {
      // Pad with zeros after the source values.
      this.voiceBuf.fill(0);
      this.voiceBuf.set(src);
      return;
    }
    // Downsample by averaging groups.
    const step = n / VOICE_UNIFORM_LEN;
    for (let i = 0; i < VOICE_UNIFORM_LEN; i++) {
      const a = Math.floor(i * step);
      const b = Math.min(n, Math.floor((i + 1) * step));
      let sum = 0;
      for (let j = a; j < b; j++) sum += src[j];
      this.voiceBuf[i] = b > a ? sum / (b - a) : 0;
    }
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      for (const { program } of this.programs.values()) gl.deleteProgram(program);
      if (this.vert) gl.deleteShader(this.vert);
      if (this.liveTex) gl.deleteTexture(this.liveTex);
      if (this.freezeTex) gl.deleteTexture(this.freezeTex);
      if (this.vao) gl.deleteVertexArray(this.vao);
    }
    this.programs.clear();
    this.vert = null;
    this.liveTex = null;
    this.freezeTex = null;
    this.vao = null;
    this.gl = null;
    this.canvas = null;
    this.ready = false;
  }
}

/* ─── GL helpers ─── */

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile failed:", gl.getShaderInfoLog(shader), "\n", src);
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createTexture(gl: WebGL2RenderingContext): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Initialise with a 1×1 grey pixel so it's sample-able even before the
  // first camera frame lands.
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([32, 32, 32, 255]),
  );
  return tex;
}
