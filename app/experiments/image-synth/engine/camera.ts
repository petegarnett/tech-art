/**
 * CameraEngine — owns the webcam stream and provides DPR-correct
 * ImageData frames for sonification.
 *
 * Why imperative: same pattern as the wireframe terrain AudioEngine.
 * Single instance per page mount, start/stop lifecycle, getFrame()
 * called from the animation loop.
 */
import type { CameraConfig } from "./types";

export class CameraEngine {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentDeviceId: string = "";
  private currentResolution = 256;
  active = false;
  error: string | null = null;
  deviceLabel: string | null = null;

  constructor() {
    // Off-screen canvas for frame extraction
    this.canvas = document.createElement("canvas");
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D context unavailable");
    this.ctx = ctx;
  }

  async start(config: CameraConfig): Promise<void> {
    await this.stop();
    try {
      this.error = null;
      const constraints: MediaStreamConstraints = {
        video: config.deviceId
          ? { deviceId: { exact: config.deviceId } }
          : true,
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      this.stream = stream;
      this.video = video;
      this.currentDeviceId = config.deviceId;
      this.currentResolution = config.resolution;
      this.canvas.width = config.resolution;
      this.canvas.height = Math.round((config.resolution * 3) / 4);
      this.deviceLabel = stream.getVideoTracks()[0]?.label ?? null;
      this.active = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.active = false;
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.active = false;
    this.deviceLabel = null;
  }

  /** Update resolution mid-stream without restarting the camera. */
  setResolution(resolution: number): void {
    this.currentResolution = resolution;
    this.canvas.width = resolution;
    this.canvas.height = Math.round((resolution * 3) / 4);
  }

  /**
   * Draw current video frame onto the canvas and return its ImageData.
   * Returns null if the video isn't ready yet.
   */
  getFrame(): ImageData | null {
    if (!this.video || this.video.readyState < 2) return null;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Mirror horizontally — feels more natural (selfie mode).
    this.ctx.save();
    this.ctx.translate(w, 0);
    this.ctx.scale(-1, 1);
    this.ctx.drawImage(this.video, 0, 0, w, h);
    this.ctx.restore();
    return this.ctx.getImageData(0, 0, w, h);
  }

  /** Process raw ImageData into a grayscale Float32Array for sonification. */
  static toGrayscale(
    frame: ImageData,
    config: CameraConfig,
  ): Float32Array {
    const { data, width, height } = frame;
    const out = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      // Luminance: 0.299R + 0.587G + 0.114B (BT.601).
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (config.invert) lum = 1 - lum;
      if (lum < config.threshold) lum = 0;
      else if (config.bw) lum = 1;
      else lum = (lum - config.threshold) / (1 - config.threshold);
      out[i] = lum;
    }
    return out;
  }
}

/** List video input devices. Labels appear after first permission grant. */
export async function listVideoInputs(): Promise<{ deviceId: string; label: string }[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "videoinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || "Camera" }));
  } catch {
    return [];
  }
}
