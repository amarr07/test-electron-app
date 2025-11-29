import { AudioEncoder } from "./encoder";

export interface RecordingOptions {
  includeMic?: boolean;
  includeSystem?: boolean;
  onChunk?: (chunkData: any) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

export interface RecordingStatus {
  recording: boolean;
  paused: boolean;
  hasMic: boolean;
  hasSystem: boolean;
}

type DisplayMediaTrackConstraints = MediaTrackConstraints & {
  mediaSource?: "screen" | "window" | "application" | "browser";
};

const SCREEN_CAPTURE_VIDEO_CONSTRAINTS: DisplayMediaTrackConstraints = {
  mediaSource: "screen",
  width: { max: 1 },
  height: { max: 1 },
  frameRate: { max: 1 },
};

// MediaRecorder timeslice interval (5 seconds)
const TIMESLICE_MS = 5000;

/**
 * Audio recorder that captures microphone and/or system audio.
 * Mixes audio sources using Web Audio API and encodes using WebCodecs (Opus) or MediaRecorder fallback.
 */
class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private systemStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private recordingActive = false;
  private isPaused = false;
  private onChunkCallback: ((chunkData: any) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onCompleteCallback: (() => void) | null = null;
  private encoder: AudioEncoder | null = null;
  private legacyRecorder: MediaRecorder | null = null;

  /**
   * Starts recording with optional mic and/or system audio.
   * Initializes streams, mixes audio, and begins encoding.
   */
  async start(options: RecordingOptions = {}): Promise<{
    success: boolean;
    hasMic: boolean;
    hasSystem: boolean;
  }> {
    if (this.recordingActive) {
      throw new Error("Recording already active");
    }

    this.setCallbacks(options);

    try {
      await this.initializeAudioStreams(options);
      await this.setupAudioMixing();
      await this.startEncoding();

      this.recordingActive = true;
      this.isPaused = false;

      return {
        success: true,
        hasMic: !!this.micStream,
        hasSystem: !!this.systemStream,
      };
    } catch (error) {
      await this.cleanup();
      throw error;
    }
  }

  private setCallbacks(options: RecordingOptions): void {
    this.onChunkCallback = options.onChunk || null;
    this.onErrorCallback = options.onError || null;
    this.onCompleteCallback = options.onComplete || null;
  }

  private async initializeAudioStreams(
    options: RecordingOptions,
  ): Promise<void> {
    const { includeMic = true, includeSystem = true } = options;

    if (includeMic) {
      await this.getMicrophoneStream();
    }

    if (includeSystem) {
      await this.getSystemAudioStream();
    }
  }

  private async getMicrophoneStream(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: { ideal: 2 },
        },
        video: false,
      });
    } catch (micError: any) {
      if (this.onErrorCallback) {
        this.onErrorCallback(`Microphone access denied: ${micError.message}`);
      }
    }
  }

  /**
   * Captures system audio via getDisplayMedia.
   *
   * WINDOWS:
   * - Loopback audio captures ALL system output (apps, meets, YouTube, etc.)
   * - Works with any output device (speakers, AirPods, wired headphones)
   * - Captures both sides of GMeet/Zoom calls automatically
   *
   * macOS:
   * - Requires Screen Recording permission (one-time user prompt)
   * - Captures all system audio output consistently
   * - Works with built-in speakers, AirPods, and all output devices
   */
  private async getSystemAudioStream(): Promise<void> {
    try {
      this.systemStream = await navigator.mediaDevices.getDisplayMedia({
        video: SCREEN_CAPTURE_VIDEO_CONSTRAINTS,
        audio: {
          echoCancellation: false, // Don't echo cancel system audio
          noiseSuppression: false, // Preserve original audio
          autoGainControl: false, // Don't auto-adjust levels
          sampleRate: 16000,
          channelCount: { ideal: 2 }, // Stereo for full audio capture
        },
      });

      // Stop video track immediately - we only need the audio loopback
      this.systemStream.getVideoTracks().forEach((track) => track.stop());
    } catch (systemError: any) {
      if (this.onErrorCallback) {
        this.onErrorCallback(
          `System audio access denied: ${systemError.message}`,
        );
      }
    }
  }

  /**
   * Sets up Web Audio API to mix microphone and system audio streams.
   * Creates stereo destination with gain nodes for each source.
   */
  private async setupAudioMixing(): Promise<void> {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const destination = this.audioContext.createMediaStreamDestination();

    destination.channelCount = 2;
    destination.channelCountMode = "explicit";

    const masterGain = this.audioContext.createGain();
    masterGain.gain.value = 1.0;

    let hasAudio = false;

    if (this.micStream && this.micStream.getAudioTracks().length > 0) {
      this.connectAudioSource(this.micStream, masterGain);
      hasAudio = true;
    }

    if (this.systemStream && this.systemStream.getAudioTracks().length > 0) {
      this.connectAudioSource(this.systemStream, masterGain);
      hasAudio = true;
    }

    if (!hasAudio) {
      throw new Error("No audio sources available");
    }

    masterGain.connect(destination);

    this.mixedStream = destination.stream;
    this.mediaStream = this.mixedStream;
  }

  private connectAudioSource(
    stream: MediaStream,
    destination: AudioNode,
  ): void {
    const source = this.audioContext!.createMediaStreamSource(stream);
    const gain = this.audioContext!.createGain();
    gain.gain.value = 1.0;
    source.connect(gain);
    gain.connect(destination);
  }

  /**
   * Starts audio encoding using WebCodecs if available, otherwise MediaRecorder.
   */
  private async startEncoding(): Promise<void> {
    if (!this.mediaStream) {
      throw new Error("No media stream available");
    }

    if (this.supportsWebCodecs()) {
      this.encoder = new AudioEncoder();
      await this.encoder.initialize(this.mediaStream, (chunkData: any) => {
        this.handleEncoderChunk(chunkData);
      });
      return;
    }

    await this.startLegacyEncoding();
  }

  private supportsWebCodecs(): boolean {
    return (
      typeof window !== "undefined" &&
      !!window.AudioEncoder &&
      !!window.MediaStreamTrackProcessor
    );
  }

  private async startLegacyEncoding(): Promise<void> {
    if (!this.mediaStream) {
      throw new Error("No media stream available");
    }

    if (typeof MediaRecorder === "undefined") {
      throw new Error("Audio recording is not supported in this environment.");
    }

    try {
      this.legacyRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 128000,
      });
    } catch (error: any) {
      throw new Error(
        `Unable to initialize audio recorder: ${error?.message || error}`,
      );
    }

    this.legacyRecorder.addEventListener("dataavailable", async (event) => {
      if (!event.data || event.data.size === 0 || !this.recordingActive) {
        return;
      }

      try {
        const buffer = new Uint8Array(await event.data.arrayBuffer());
        if (this.onChunkCallback) {
          this.onChunkCallback({
            type: "chunk",
            codec: "opus",
            chunks: [buffer],
            timestamp: Date.now(),
            reason: "legacy",
            totalBytes: buffer.byteLength,
            sampleRate: 16000,
            channels: 1,
          });
        }
      } catch (err: any) {
        this.onErrorCallback?.(
          err?.message || "Failed to process recorded audio chunk.",
        );
      }
    });

    this.legacyRecorder.addEventListener("error", (event: any) => {
      const message = event?.error?.message || "Recording error";
      this.onErrorCallback?.(message);
    });

    this.legacyRecorder.addEventListener("stop", () => {
      if (this.onChunkCallback) {
        this.onChunkCallback({ type: "complete" });
      }
    });

    this.legacyRecorder.start(TIMESLICE_MS);
  }

  private handleEncoderChunk(chunkData: any): void {
    if (chunkData.type === "chunk" && this.onChunkCallback) {
      this.onChunkCallback(chunkData);
    } else if (chunkData.type === "error" && this.onErrorCallback) {
      this.onErrorCallback(chunkData.error);
    } else if (chunkData.type === "complete" && this.onCompleteCallback) {
      this.onCompleteCallback();
    }
  }

  async pause(): Promise<void> {
    if (!this.recordingActive || this.isPaused) {
      return;
    }

    this.isPaused = true;
    if (this.encoder) {
      await this.encoder.pause();
    } else if (
      this.legacyRecorder &&
      this.legacyRecorder.state === "recording"
    ) {
      try {
        this.legacyRecorder.pause();
      } catch {}
    }
  }

  async resume(): Promise<void> {
    if (!this.recordingActive || !this.isPaused) {
      return;
    }

    this.isPaused = false;
    if (this.encoder) {
      await this.encoder.resume();
    } else if (this.legacyRecorder && this.legacyRecorder.state === "paused") {
      try {
        this.legacyRecorder.resume();
      } catch {}
    }
  }

  async stop(): Promise<void> {
    if (!this.recordingActive) {
      await this.cleanup();
      return;
    }

    this.recordingActive = false;
    this.isPaused = false;

    if (this.encoder) {
      await this.encoder.stop();
    } else if (this.legacyRecorder) {
      await this.stopLegacyRecorder();
    }

    await this.cleanup();
  }

  private stopLegacyRecorder(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.legacyRecorder) {
        resolve();
        return;
      }

      const recorder = this.legacyRecorder;
      const finalize = () => {
        recorder.removeEventListener("stop", finalize);
        resolve();
      };
      recorder.addEventListener("stop", finalize);

      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          resolve();
        }
      } else {
        resolve();
      }
    });
  }

  /**
   * Forcefully stops recording and cleans up all resources.
   * Public method for emergency cleanup (e.g., on logout).
   */
  async forceCleanup(): Promise<void> {
    this.recordingActive = false;
    this.isPaused = false;
    await this.cleanup();
  }

  /**
   * Cleans up all audio streams, contexts, and encoders.
   */
  private async cleanup(): Promise<void> {
    if (this.encoder && this.encoder.recordingActive) {
      await this.encoder.stop();
    }

    if (this.legacyRecorder) {
      try {
        if (this.legacyRecorder.state !== "inactive") {
          this.legacyRecorder.stop();
        }
      } catch {}
      this.legacyRecorder = null;
    }

    const stopStream = (stream: MediaStream | null) => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          try {
            if (track.readyState === "live") {
              track.stop();
            }
            track.enabled = false;
          } catch (err) {}
        });
      }
    };

    stopStream(this.mixedStream);
    stopStream(this.micStream);
    stopStream(this.systemStream);

    if (this.audioContext) {
      try {
        await this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.mediaStream = null;
    this.micStream = null;
    this.systemStream = null;
    this.mixedStream = null;
    this.onChunkCallback = null;
    this.onErrorCallback = null;
    this.onCompleteCallback = null;
    this.encoder = null;
  }

  getStatus(): RecordingStatus {
    return {
      recording: this.recordingActive,
      paused: this.isPaused,
      hasMic: !!this.micStream,
      hasSystem: !!this.systemStream,
    };
  }
}

export const audioRecorder = new AudioRecorder();
