/**
 * Type definitions for Electron main process API exposed to renderer.
 * Includes OAuth, storage, theme, audio sources, and auto-launch functionality.
 */
export interface ElectronAPI {
  openOAuthWindow: (url: {
    url: string;
    callbackUrl: string;
  }) => Promise<{ closed: boolean }>;
  getStorage: (key: string) => Promise<any>;
  setStorage: (key: string, value: any) => Promise<boolean>;
  removeStorage: (key: string) => Promise<boolean>;
  setThemePreference: (theme: "light" | "dark") => Promise<boolean>;
  getAudioSources: () => Promise<any>;
  getAppVersion: () => Promise<string>;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  onAuthCallback: (callback: (data: { url: string }) => void) => void;
  removeAuthCallback: () => void;
}

export interface Config {
  BACKEND_URL?: string;
  DEVICE_ID?: string;
  REMOTE_ID?: string;
  APP_VERSION?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_STORAGE_BUCKET?: string;
  FIREBASE_MESSAGING_SENDER_ID?: string;
  FIREBASE_APP_ID?: string;
  FIREBASE_MEASUREMENT_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  APPLE_CLIENT_ID?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    config?: Config;
  }
}

export const electronAPI = window.electronAPI;
export const config: Config = window.config || {};
