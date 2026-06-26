/**
 * AudioEngine — owns the Web Audio capture path for the wireframe terrain.
 *
 * Why this exists:
 *   - The previous implementation called getUserMedia({audio:true}) with no
 *     deviceId, so macOS users running BlackHole couldn't pick it.
 *   - It only split bins into 3 hardcoded bands.
 *
 * What this gives us:
 *   - Explicit source selection (mic with deviceId, or tab via getDisplayMedia).
 *   - 6 log-spaced bands matching how the ear perceives sound.
 *   - Per-band attack/release envelope so kicks pop and pads bloom.
 *   - A single mutable BandLevels object updated each frame for zero-lag reads.
 */

import { BAND_IDS, BAND_RANGES } from "./types";
import type {
  AudioConfig,
  AudioStatus,
  BandId,
  BandLevels,
} from "./types";

/** Default attack/release in seconds per band. Kicks fast attack, pads slower. */
const DEFAULT_ENVELOPES: Record<BandId, { attack: number; release: number }> = {
  sub: { attack: 0.005, release: 0.3 }, // fast attack, slow release for kick body
  bass: { attack: 0.01, release: 0.25 },
  lowMid: { attack: 0.02, release: 0.18 },
  highMid: { attack: 0.03, release: 0.15 },
  high: { attack: 0.05, release: 0.2 }, // slower follow for sustained sounds
  air: { attack: 0.05, release: 0.3 },
};

/**
 * AudioEngine — owns the AudioContext + AnalyserNode and splits FFT data
 * into 6 log-spaced frequency bands with per-band attack/release envelopes.
 *
 * Single-instance, imperative. Construct once per page mount, call start()
 * to begin capturing, stop() to release the stream, and update() each
 * frame to refresh band levels (call from the rAF draw loop).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;
  /** Bin index ranges for each band, computed from sample rate + FFT size. */
  private bandBins: Record<BandId, [number, number]> = {} as Record<
    BandId,
    [number, number]
  >;
  /** Envelope-followed band levels — what consumers actually read. */
  private levels: BandLevels = {
    sub: 0,
    bass: 0,
    lowMid: 0,
    highMid: 0,
    high: 0,
    air: 0,
  };
  private status: AudioStatus = {
    active: false,
    source: "none",
    deviceLabel: null,
    sampleRate: 0,
    error: null,
  };
  private lastTime = 0;

  /** Read a snapshot of the current engine status (immutable copy). */
  getStatus(): AudioStatus {
    return { ...this.status };
  }

  /** Read a snapshot of the latest band levels (immutable copy). */
  getLevels(): BandLevels {
    return { ...this.levels };
  }

  /**
   * Start capturing audio. Call with the chosen source/device.
   * For 'mic': requests getUserMedia (with deviceId constraint if set).
   * For 'tab': uses getDisplayMedia to capture a tab's audio.
   * Throws on user denial — caller handles.
   */
  async start(config: AudioConfig): Promise<void> {
    await this.stop(); // clean up any existing session

    try {
      let stream: MediaStream;

      if (config.source === "mic") {
        const constraints: MediaStreamConstraints = {
          audio: config.deviceId
            ? {
                deviceId: { exact: config.deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            : {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              },
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } else if (config.source === "tab") {
        // Capture tab/screen audio — user picks a tab in the prompt.
        // We ask for video too because Chrome requires it; we discard it.
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        // Stop video tracks immediately — we only need audio.
        stream.getVideoTracks().forEach((t) => t.stop());
        if (stream.getAudioTracks().length === 0) {
          throw new Error(
            'No audio track — make sure to tick "Share tab audio" in the prompt',
          );
        }
      } else {
        throw new Error(`Unknown audio source: ${config.source}`);
      }

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024; // 512 bins, decent resolution
      analyser.smoothingTimeConstant = 0.4; // some FFT smoothing; we do more in envelope
      source.connect(analyser);

      this.ctx = ctx;
      this.analyser = analyser;
      this.stream = stream;
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Compute which FFT bins fall into each frequency band.
      this.computeBandBins(ctx.sampleRate, analyser.fftSize);

      this.status = {
        active: true,
        source: config.source,
        deviceLabel: stream.getAudioTracks()[0]?.label ?? null,
        sampleRate: ctx.sampleRate,
        error: null,
      };
      this.lastTime = performance.now();
    } catch (err) {
      this.status = {
        active: false,
        source: "none",
        deviceLabel: null,
        sampleRate: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      throw err;
    }
  }

  /** Stop capture, release the stream and tear down the AudioContext. */
  async stop(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* ignore — already closed */
      }
      this.ctx = null;
    }
    this.analyser = null;
    this.dataArray = null;
    this.levels = {
      sub: 0,
      bass: 0,
      lowMid: 0,
      highMid: 0,
      high: 0,
      air: 0,
    };
    this.status = {
      active: false,
      source: "none",
      deviceLabel: null,
      sampleRate: 0,
      error: null,
    };
  }

  /**
   * Refresh band levels. Call once per animation frame.
   * Reads the FFT, averages bins per band, then applies attack/release envelope.
   */
  update(now: number): void {
    if (!this.analyser || !this.dataArray) return;
    this.analyser.getByteFrequencyData(this.dataArray);

    const dt = Math.max(0.001, (now - this.lastTime) / 1000);
    this.lastTime = now;

    for (const band of BAND_IDS) {
      const [lo, hi] = this.bandBins[band];
      let sum = 0;
      let count = 0;
      for (let i = lo; i <= hi && i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
        count++;
      }
      const raw = count > 0 ? sum / (count * 255) : 0; // 0-1

      // Attack/release: if rising, use attack time constant; if falling, use release.
      const env = DEFAULT_ENVELOPES[band];
      const current = this.levels[band];
      const target = raw;
      const tau = target > current ? env.attack : env.release;
      // Time-constant smoothing: alpha = 1 - exp(-dt/tau).
      // This is the discrete equivalent of a first-order low-pass with time constant τ.
      const alpha = 1 - Math.exp(-dt / Math.max(0.001, tau));
      this.levels[band] = current + (target - current) * alpha;
    }
  }

  /** Map each band's Hz range into FFT bin indices given the analyser's sample rate. */
  private computeBandBins(sampleRate: number, fftSize: number): void {
    const nyquist = sampleRate / 2;
    const binCount = fftSize / 2;
    const hzPerBin = nyquist / binCount;
    for (const band of BAND_IDS) {
      const [loHz, hiHz] = BAND_RANGES[band];
      const lo = Math.max(0, Math.floor(loHz / hzPerBin));
      const hi = Math.min(binCount - 1, Math.ceil(hiHz / hzPerBin));
      this.bandBins[band] = [lo, hi];
    }
  }
}

/**
 * List available audio input devices. Returns deviceIds and labels
 * so users can pick BlackHole, mic etc. explicitly.
 *
 * Note: labels are only populated after at least one getUserMedia call
 * has succeeded (browser privacy). Call once after first mic start to refresh.
 */
export async function listAudioInputs(): Promise<
  { deviceId: string; label: string }[]
> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({ deviceId: d.deviceId, label: d.label || "Unnamed input" }));
  } catch {
    return [];
  }
}
