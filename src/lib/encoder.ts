declare global {
  interface Window {
    AudioEncoder: any;
    MediaStreamTrackProcessor: any;
  }
}

export interface EncodedChunk {
  type: "chunk" | "error" | "complete";
  codec?: string;
  chunks?: Uint8Array[];
  timestamp?: number;
  reason?: string;
  totalBytes?: number;
  sampleRate?: number;
  channels?: number;
  error?: string;
  totalChunks?: number;
}

/**
 * Audio encoder using WebCodecs API for Opus encoding.
 * Buffers frames and flushes chunks based on size (120KB) or time (5s) thresholds.
 * Falls back to legacy MediaRecorder if WebCodecs unavailable.
 */
export class AudioEncoder {
  private audioEncoder: any = null;
  private trackProcessor: any = null;
  private trackReader: ReadableStreamDefaultReader<any> | null = null;
  private pendingFrames: Uint8Array[] = [];
  private pendingBytes = 0;
  private chunkTimer: NodeJS.Timeout | null = null;
  private chunkCounter = 0;
  public recordingActive = false;
  private isPaused = false;
  private encodingSampleRate = 16000;
  private encodingChannelCount = 1;
  private readonly TARGET_CHUNK_INTERVAL_MS = 5000;
  private readonly MAX_CHUNK_SIZE_BYTES = 120 * 1024;
  private onChunkCallback: ((chunkData: EncodedChunk) => void) | null = null;

  /**
   * Initializes encoder with media stream, sets up WebCodecs AudioEncoder and track processor.
   * Configures Opus codec at 16kHz sample rate.
   */
  async initialize(
    mediaStream: MediaStream,
    onChunk: (chunkData: EncodedChunk) => void,
  ): Promise<void> {
    if (this.recordingActive) {
      throw new Error("Encoder already active");
    }

    const AudioEncoderCtor = window.AudioEncoder;
    const MediaStreamTrackProcessorCtor = window.MediaStreamTrackProcessor;

    if (!AudioEncoderCtor || !MediaStreamTrackProcessorCtor) {
      throw new Error(
        "Audio encoder unavailable - WebCodecs API not supported",
      );
    }

    this.onChunkCallback = onChunk;

    const encodingContext = new AudioContext({ sampleRate: 16000 });
    const encodingDestination = encodingContext.createMediaStreamDestination();
    const encodingSource = encodingContext.createMediaStreamSource(mediaStream);
    encodingSource.connect(encodingDestination);
    const encodingMediaStream = encodingDestination.stream;

    const encodingTracks = encodingMediaStream.getAudioTracks();
    if (encodingTracks.length === 0) {
      throw new Error("No encoding track");
    }

    const recordingTrack = encodingTracks[0];
    const trackSettings = recordingTrack.getSettings();
    const sampleRate = encodingContext.sampleRate;
    const channelCount = trackSettings.channelCount ?? 1;

    this.trackProcessor = new MediaStreamTrackProcessorCtor({
      track: recordingTrack,
    });
    this.trackReader = this.trackProcessor.readable.getReader();

    this.audioEncoder = new AudioEncoderCtor({
      output: (chunk: any) => {
        const buffer = new ArrayBuffer(chunk.byteLength);
        chunk.copyTo(buffer);
        this.handleEncodedFrame(new Uint8Array(buffer));
      },
      error: (encoderError: any) => {
        if (this.onChunkCallback) {
          this.onChunkCallback({
            type: "error",
            error: `Audio encoder error: ${encoderError?.message || encoderError}`,
          });
        }
      },
    });

    this.audioEncoder.configure({
      codec: "opus",
      sampleRate,
      numberOfChannels: channelCount,
      bitrate: 16000,
    });

    this.pendingFrames = [];
    this.pendingBytes = 0;
    this.cancelFlushTimer();
    this.chunkCounter = 0;
    this.recordingActive = true;
    this.isPaused = false;
    this.encodingSampleRate = sampleRate;
    this.encodingChannelCount = channelCount;

    this.runEncoderLoop();
  }

  private scheduleFlushTimer(): void {
    if (this.chunkTimer !== null || this.isPaused || !this.recordingActive) {
      return;
    }
    this.chunkTimer = setTimeout(() => {
      this.chunkTimer = null;
      this.flushPendingFrames("timer");
    }, this.TARGET_CHUNK_INTERVAL_MS);
  }

  private cancelFlushTimer(): void {
    if (this.chunkTimer !== null) {
      clearTimeout(this.chunkTimer);
      this.chunkTimer = null;
    }
  }

  /**
   * Handles encoded audio frames, buffering until size or time threshold reached.
   */
  private handleEncodedFrame(frame: Uint8Array): void {
    if (!this.recordingActive || this.isPaused) {
      return;
    }

    this.pendingFrames.push(frame);
    this.pendingBytes += frame.byteLength;

    if (this.pendingBytes >= this.MAX_CHUNK_SIZE_BYTES) {
      this.cancelFlushTimer();
      this.flushPendingFrames("size");
      return;
    }

    this.scheduleFlushTimer();
  }

  private async flushPendingFrames(reason: string): Promise<void> {
    if (this.pendingFrames.length === 0) {
      if (reason === "stop" || reason === "pause") {
        this.cancelFlushTimer();
      }
      return;
    }

    this.cancelFlushTimer();

    const framesToSend = this.pendingFrames;
    const totalBytes = this.pendingBytes;
    this.pendingFrames = [];
    this.pendingBytes = 0;

    const timestamp = Date.now();
    this.chunkCounter += 1;

    if (this.onChunkCallback) {
      this.onChunkCallback({
        type: "chunk",
        codec: "opus",
        chunks: framesToSend,
        timestamp,
        reason,
        totalBytes,
        sampleRate: this.encodingSampleRate,
        channels: this.encodingChannelCount,
      });
    }
  }

  async pause(): Promise<void> {
    if (!this.recordingActive || this.isPaused) {
      return;
    }

    this.isPaused = true;
    this.cancelFlushTimer();
    await this.flushPendingFrames("pause");
  }

  async resume(): Promise<void> {
    if (!this.recordingActive || !this.isPaused) {
      return;
    }

    this.isPaused = false;
  }

  /**
   * Main encoding loop: reads audio frames from track and encodes them.
   * Handles errors and ensures proper cleanup of audio data.
   */
  private async runEncoderLoop(): Promise<void> {
    if (!this.trackReader || !this.audioEncoder) {
      return;
    }

    try {
      while (this.recordingActive) {
        const result = await this.trackReader.read();
        if (result.done) {
          break;
        }

        const audioData = result.value;
        try {
          this.audioEncoder.encode(audioData);
        } catch (encodeError) {
          if (this.onChunkCallback) {
            this.onChunkCallback({
              type: "error",
              error: `Encode failed: ${encodeError}`,
            });
          }
        } finally {
          if (audioData && typeof audioData.close === "function") {
            audioData.close();
          }
        }
      }
    } catch (readerError: any) {
      if (readerError?.name !== "AbortError") {
        if (this.onChunkCallback) {
          this.onChunkCallback({
            type: "error",
            error: `Track reader error: ${readerError}`,
          });
        }
      }
    } finally {
      try {
        await this.audioEncoder?.flush();
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
    this.cancelFlushTimer();

    if (this.trackReader) {
      try {
        await this.trackReader.cancel();
      } catch {}
    }

    try {
      await this.audioEncoder?.flush();
    } catch {}

    await this.flushPendingFrames("stop");

    if (this.onChunkCallback) {
      this.onChunkCallback({
        type: "complete",
        totalChunks: this.chunkCounter,
      });
    }

    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    this.cancelFlushTimer();
    this.pendingFrames = [];
    this.pendingBytes = 0;

    if (this.trackReader) {
      try {
        await this.trackReader.cancel();
      } catch {}
      if (this.trackReader.releaseLock) {
        this.trackReader.releaseLock();
      }
      this.trackReader = null;
    }

    this.trackProcessor = null;

    if (this.audioEncoder) {
      if (typeof this.audioEncoder.flush === "function") {
        try {
          await this.audioEncoder.flush();
        } catch {}
      }
      try {
        this.audioEncoder.close?.();
      } catch {}
      this.audioEncoder = null;
    }

    this.chunkCounter = 0;
    this.isPaused = false;
    this.recordingActive = false;
    this.encodingSampleRate = 16000;
    this.encodingChannelCount = 1;
    this.onChunkCallback = null;
  }
}

/**
 * Flattens multiple Opus chunks into single Uint8Array with length prefixes.
 * Each chunk is prefixed with 4-byte big-endian length.
 */
export function flattenOpusChunks(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + 4 + chunk.length, 0);
  const mergedBytes = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    const length = chunk.length;

    mergedBytes[offset] = (length >> 24) & 0xff;
    mergedBytes[offset + 1] = (length >> 16) & 0xff;
    mergedBytes[offset + 2] = (length >> 8) & 0xff;
    mergedBytes[offset + 3] = length & 0xff;
    offset += 4;

    mergedBytes.set(chunk, offset);
    offset += length;
  }

  return mergedBytes;
}
