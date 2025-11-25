import { config } from "@/lib/electron";
import { flattenOpusChunks } from "@/lib/encoder";

const APP_VERSION = config.APP_VERSION as string;

export interface UploadOptions {
  source: string;
  audioBuffer: Uint8Array;
  deviceId: string;
  remoteId: string;
  timestamp: number;
  appVersion?: string;
  isOpus: boolean;
  isBytes: boolean;
  neoBatteryMv?: string;
}

export interface UploadResult {
  success: boolean;
  response?: any;
  error?: string;
}

export interface EventData {
  timestamp: number;
  event: string;
}

/**
 * Manages audio file uploads and event tracking to backend.
 */
class UploadManager {
  private backendUrl: string;
  private deviceId: string;
  private remoteId: string;

  constructor() {
    this.backendUrl = config.BACKEND_URL!;
    this.deviceId = config.DEVICE_ID!;
    this.remoteId = config.REMOTE_ID!;
  }

  /**
   * Uploads audio file as multipart form data.
   */
  async uploadAudio(
    options: UploadOptions,
    authToken: string,
  ): Promise<UploadResult> {
    try {
      const uploadUrl = `${this.backendUrl}/upload_audio/`;
      const formData = this.buildFormData({
        ...options,
        appVersion: APP_VERSION,
      });
      const headers = this.buildAuthHeaders(authToken);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error status: ${response.status} ${errorText}`);
      }

      const responseData = await response.json();

      return {
        success: true,
        response: responseData,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Builds multipart form data with audio file and metadata.
   */
  private buildFormData(
    options: UploadOptions & { appVersion: string },
  ): FormData {
    const formData = new FormData();

    formData.append("source", options.source);
    formData.append("device_id", options.deviceId);
    formData.append("remote_id", options.remoteId);
    formData.append("app_version", options.appVersion);
    formData.append("timestamp", options.timestamp.toString());
    formData.append("neo_battery_mv", options.neoBatteryMv ?? "0");
    formData.append("is_opus", options.isOpus.toString());
    formData.append("is_bytes", options.isBytes.toString());

    const audioBlob = this.createAudioBlob(options.audioBuffer);
    const filename = `${options.timestamp}.opus`;
    formData.append("audio_file", audioBlob, filename);

    return formData;
  }

  /**
   * Converts audio buffer to Blob for form data upload.
   */
  private createAudioBlob(audioBuffer: Uint8Array): Blob {
    const audioBytes =
      audioBuffer instanceof Uint8Array
        ? new Uint8Array(audioBuffer)
        : new Uint8Array(audioBuffer);

    const arrayBuffer = new ArrayBuffer(audioBytes.byteLength);
    new Uint8Array(arrayBuffer).set(audioBytes);

    return new Blob([arrayBuffer], { type: "audio/opus" });
  }

  /**
   * Builds authorization headers for upload requests.
   */
  private buildAuthHeaders(authToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${authToken}`,
    };
  }

  /**
   * Sends event tracking data to backend.
   */
  async sendEvent(
    eventData: EventData,
    authToken: string,
  ): Promise<UploadResult> {
    try {
      const eventsUrl = `${this.backendUrl}/events/`;

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      };

      const response = await fetch(eventsUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(eventData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to send event: ${errorText}`);
      }

      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Uploads audio chunks by flattening Opus chunks and uploading as single file.
   */
  async uploadChunk(
    chunkData: {
      chunks: Uint8Array[];
      timestamp: number;
      sampleRate: number;
      channels: number;
    },
    authToken: string,
  ): Promise<UploadResult> {
    const { chunks, timestamp } = chunkData;

    if (!chunks || chunks.length === 0) {
      return {
        success: false,
        error: "No audio frames in chunk",
      };
    }

    const flattened = flattenOpusChunks(chunks);
    if (!flattened || flattened.byteLength === 0) {
      return {
        success: false,
        error: "Failed to prepare audio payload",
      };
    }

    return await this.uploadAudio(
      {
        source: "electron",
        audioBuffer: flattened,
        deviceId: this.deviceId,
        remoteId: this.remoteId,
        appVersion: APP_VERSION,
        timestamp,
        isOpus: true,
        isBytes: true,
      },
      authToken,
    );
  }
}

export const uploadManager = new UploadManager();
