/**
 * audioSource.ts — the AudioSourceEngine.
 *
 * Owns the input stream and exposes a single AudioNode tap point that the
 * FFTAnalyser hooks into. Five modes:
 *
 *   - silent  — no source; the visualiser runs on LFOs alone.
 *   - system  — getDisplayMedia({ audio: true, systemAudio: "include" });
 *               user picks "Entire Screen" + ticks "Share system audio".
 *   - tab     — getDisplayMedia with preferCurrentTab hint off; user picks
 *               a browser tab + ticks "Share tab audio".
 *   - mic     — getUserMedia({ audio: true }) with optional deviceId.
 *   - file    — HTMLAudioElement + createMediaElementSource. Play/pause/seek.
 *
 * All modes route through a shared `master` GainNode on Tone's rawContext,
 * which fans out to both the analyser tap and the audio destination (so the
 * user hears the sound). Silent mode never creates a source — it just
 * ensures the AudioContext is running.
 *
 * Notes:
 *   - getDisplayMedia + audio is Chrome-only and requires HTTPS in prod
 *     (localhost is exempt). We check for the presence of the API and
 *     surface a helpful error otherwise.
 *   - Tone.start() must be called from a user gesture; the AudioSourcePicker
 *     handles that by only calling start() from onClick handlers.
 */

import * as Tone from "tone";
import type { AudioSourceMode, AudioStreamInfo } from "./types";

export interface AudioSourceState {
  mode: AudioSourceMode;
  active: boolean;
  error: string | null;
  streamInfo: AudioStreamInfo;
}

/** Options passed to start(). */
export interface AudioSourceStartOptions {
  /** Device id for mic mode. `""` = default. */
  deviceId?: string;
  /** File for file mode. */
  file?: File;
  /** Should file playback loop? */
  loop?: boolean;
}

/** File mode exposes a small playhead — seek + duration read. */
export interface AudioSourceFilePlayhead {
  duration: number;
  currentTime: number;
  paused: boolean;
  seek(t: number): void;
  playPause(): void;
  setLoop(loop: boolean): void;
}

export class AudioSourceEngine {
  state: AudioSourceState = {
    mode: "silent",
    active: false,
    error: null,
    streamInfo: {},
  };

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // Mode-specific bits.
  private mediaStream: MediaStream | null = null;
  private streamNode: MediaStreamAudioSourceNode | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private mediaElNode: MediaElementAudioSourceNode | null = null;

  /** Listener for external state-change notifications (e.g. React setState). */
  private listeners = new Set<(s: AudioSourceState) => void>();

  /** Subscribe — returns an unsubscribe fn. */
  subscribe(listener: (s: AudioSourceState) => void): () => void {
    this.listeners.add(listener);
    // Fire immediately with current state so subscribers can hydrate.
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = { ...this.state, streamInfo: { ...this.state.streamInfo } };
    this.listeners.forEach((l) => l(snapshot));
  }

  /** Lazy-init the shared AudioContext + master gain. */
  private async ensureContext(): Promise<{ ctx: AudioContext; master: GainNode }> {
    // Tone.start() resolves the raw context. Must be called after a user gesture.
    await Tone.start();
    if (!this.ctx || !this.master) {
      this.ctx = Tone.getContext().rawContext as AudioContext;
      this.master = this.ctx.createGain();
      this.master.gain.value = 1.0;
      // Master fans to destination — analyser is tapped externally via getAudioNode().
      this.master.connect(this.ctx.destination);
    }
    return { ctx: this.ctx, master: this.master };
  }

  /**
   * The AudioNode the FFTAnalyser should tap. Always the master gain, so the
   * analyser stays connected across mode switches.
   *
   * Returns null before start() is first called (context not yet created).
   */
  getAudioNode(): AudioNode | null {
    return this.master;
  }

  /**
   * Start a new source in the given mode. Stops any previous source first.
   * Resolves once the source is up and audible. Throws on permission denial
   * or missing browser API.
   */
  async start(mode: AudioSourceMode, opts: AudioSourceStartOptions = {}): Promise<void> {
    this.stop(); // clear previous source, keep context / master alive
    const { ctx, master } = await this.ensureContext();

    this.state.mode = mode;
    this.state.error = null;
    this.state.streamInfo = {};

    try {
      if (mode === "silent") {
        // Nothing to hook up — analyser will just see silence.
        this.state.active = true;
      } else if (mode === "system" || mode === "tab") {
        await this.startDisplayMedia(mode, ctx, master);
      } else if (mode === "mic") {
        await this.startMic(opts.deviceId ?? "", ctx, master);
      } else if (mode === "file") {
        if (!opts.file) throw new Error("No file provided for file mode.");
        await this.startFile(opts.file, opts.loop ?? true, ctx, master);
      }
    } catch (err) {
      // Roll back on failure.
      const msg = err instanceof Error ? err.message : String(err);
      this.state.active = false;
      this.state.error = msg;
      this.notify();
      throw err;
    }

    this.notify();
  }

  /** ── system / tab audio (getDisplayMedia) ── */
  private async startDisplayMedia(
    mode: "system" | "tab",
    ctx: AudioContext,
    master: GainNode,
  ): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      throw new Error("getDisplayMedia is not available. Try Chrome on a desktop.");
    }
    // TypeScript's lib.dom doesn't cover the Chrome-specific systemAudio /
    // monitorTypeSurfaces / preferCurrentTab options yet — cast through
    // a wider type. See https://developer.chrome.com/docs/web-platform/screen-sharing-controls/.
    const constraints: MediaStreamConstraints & {
      systemAudio?: "include" | "exclude";
      monitorTypeSurfaces?: "include" | "exclude";
      preferCurrentTab?: boolean;
    } = mode === "system"
      ? {
          video: { displaySurface: "monitor" } as MediaTrackConstraints,
          audio: true,
          systemAudio: "include",
          monitorTypeSurfaces: "include",
        }
      : {
          video: true,
          audio: true,
          preferCurrentTab: false,
        };

    const stream = await navigator.mediaDevices.getDisplayMedia(
      constraints as MediaStreamConstraints,
    );

    // Immediately kill the video track — we only want the audio.
    stream.getVideoTracks().forEach((t) => t.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        mode === "system"
          ? "No system audio in stream. In Chrome's picker, tick 'Share system audio' (bottom-left)."
          : "No tab audio in stream. In Chrome's picker, pick a tab and tick 'Share tab audio'.",
      );
    }

    // Wrap the stream (audio-only now) in a source node.
    const audioOnlyStream = new MediaStream(audioTracks);
    this.mediaStream = audioOnlyStream;
    this.streamNode = ctx.createMediaStreamSource(audioOnlyStream);
    this.streamNode.connect(master);

    // If the user hits "Stop sharing" in Chrome's overlay, react to it.
    audioTracks[0].addEventListener("ended", () => {
      if (this.state.mode === mode && this.state.active) {
        this.stop();
        this.state.error = "Sharing stopped by user.";
        this.notify();
      }
    });

    this.state.active = true;
    this.state.streamInfo = { deviceLabel: audioTracks[0].label || (mode === "system" ? "System audio" : "Tab audio") };
  }

  /** ── microphone ── */
  private async startMic(deviceId: string, ctx: AudioContext, master: GainNode): Promise<void> {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia is not available.");
    }
    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId } }
        : true,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.mediaStream = stream;
    this.streamNode = ctx.createMediaStreamSource(stream);
    this.streamNode.connect(master);
    const track = stream.getAudioTracks()[0];
    this.state.active = true;
    this.state.streamInfo = { deviceLabel: track?.label || "Microphone" };
  }

  /** ── file playback ── */
  private async startFile(file: File, loop: boolean, ctx: AudioContext, master: GainNode): Promise<void> {
    // Create an <audio> element in memory. We don't need to attach it to
    // the DOM — createMediaElementSource wires it directly.
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.src = url;
    el.loop = loop;
    el.crossOrigin = "anonymous";
    // Wait for metadata so duration is known before we resolve.
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        el.removeEventListener("loadedmetadata", onReady);
        el.removeEventListener("error", onErr);
        resolve();
      };
      const onErr = () => {
        el.removeEventListener("loadedmetadata", onReady);
        el.removeEventListener("error", onErr);
        reject(new Error("Could not decode audio file. Try MP3 / WAV / OGG."));
      };
      el.addEventListener("loadedmetadata", onReady);
      el.addEventListener("error", onErr);
    });
    this.audioEl = el;
    this.mediaElNode = ctx.createMediaElementSource(el);
    this.mediaElNode.connect(master);
    // Kick off playback.
    await el.play().catch(() => {
      /* autoplay might fail — the UI's play button handles it */
    });
    this.state.active = true;
    this.state.streamInfo = { fileName: file.name, duration: el.duration };
  }

  /** File mode: expose a small controller for the playhead UI. Returns null in other modes. */
  getFilePlayhead(): AudioSourceFilePlayhead | null {
    if (this.state.mode !== "file" || !this.audioEl) return null;
    const el = this.audioEl;
    return {
      get duration() { return el.duration || 0; },
      get currentTime() { return el.currentTime || 0; },
      get paused() { return el.paused; },
      seek(t: number) {
        try { el.currentTime = Math.max(0, Math.min(el.duration || 0, t)); }
        catch { /* Not-yet-seekable — ignore. */ }
      },
      playPause() {
        if (el.paused) void el.play().catch(() => {});
        else el.pause();
      },
      setLoop(loop: boolean) { el.loop = loop; },
    };
  }

  /** Stop the current source. Keeps context + master alive for future starts. */
  stop(): void {
    // Media stream.
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.streamNode) {
      try { this.streamNode.disconnect(); } catch { /* not connected */ }
      this.streamNode = null;
    }
    // File audio element.
    if (this.audioEl) {
      this.audioEl.pause();
      // Release the object URL to reclaim memory.
      try { URL.revokeObjectURL(this.audioEl.src); } catch { /* already revoked */ }
      this.audioEl = null;
    }
    if (this.mediaElNode) {
      try { this.mediaElNode.disconnect(); } catch { /* not connected */ }
      this.mediaElNode = null;
    }
    this.state.active = false;
    this.notify();
  }

  /** Full teardown — call from component unmount. */
  dispose(): void {
    this.stop();
    if (this.master) {
      try { this.master.disconnect(); } catch { /* not connected */ }
      this.master = null;
    }
    // The AudioContext is owned by Tone — do NOT close it, other components
    // may still be using it.
    this.ctx = null;
    this.listeners.clear();
  }
}
