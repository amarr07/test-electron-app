/**
 * Electron preload script - exposes secure APIs to renderer process.
 * Bridges IPC communication between renderer and main process.
 */
const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");
const fs = require("fs");

/**
 * Loads environment variables from .env file.
 * Parses KEY=VALUE format, ignoring comments and empty lines.
 */
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  const env = {};

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...values] = trimmed.split("=");
        if (key && values.length > 0) {
          env[key.trim()] = values.join("=").trim();
        }
      }
    });
  }

  return env;
}

const env = loadEnv();

/**
 * Exposes Electron APIs to renderer process via contextBridge.
 * Provides secure IPC communication for OAuth, storage, theme, audio, and auto-launch.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  openOAuthWindow: (url) => ipcRenderer.invoke("open-oauth-window", url),
  getStorage: (key) => ipcRenderer.invoke("get-storage", key),
  setStorage: (key, value) => ipcRenderer.invoke("set-storage", key, value),
  removeStorage: (key) => ipcRenderer.invoke("remove-storage", key),
  setThemePreference: (theme) =>
    ipcRenderer.invoke("set-theme-preference", theme),
  getAudioSources: () => ipcRenderer.invoke("get-audio-sources"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  /**
   * Registers callback for OAuth authentication results.
   */
  onAuthCallback: (callback) => {
    ipcRenderer.on("auth-callback", (event, data) => callback(data));
  },
  /**
   * Removes all OAuth callback listeners.
   */
  removeAuthCallback: () => {
    ipcRenderer.removeAllListeners("auth-callback");
  },
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),
  setAutoLaunch: (enabled) => ipcRenderer.invoke("set-auto-launch", enabled),
});

/**
 * Exposes environment configuration to renderer process.
 */
contextBridge.exposeInMainWorld("config", {
  BACKEND_URL: env.BACKEND_URL,
  DEVICE_ID: env.DEVICE_ID,
  REMOTE_ID: env.REMOTE_ID,
  APP_VERSION: env.APP_VERSION,
  FIREBASE_API_KEY: env.FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: env.FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: env.FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: env.FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: env.FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID: env.FIREBASE_MEASUREMENT_ID,
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  APPLE_CLIENT_ID: env.APPLE_CLIENT_ID,
});
