import { electronAPI } from "@/lib/electron";

/**
 * Storage wrapper for Electron API with typed methods for common data.
 * Handles auth tokens, Google access tokens (with expiry), theme, and timer state.
 */
class Storage {
  async get(key: string): Promise<any> {
    if (!electronAPI) return null;
    return await electronAPI.getStorage(key);
  }

  async set(key: string, value: any): Promise<boolean> {
    if (!electronAPI) return false;
    return await electronAPI.setStorage(key, value);
  }

  async remove(key: string): Promise<boolean> {
    if (!electronAPI) return false;
    return await electronAPI.removeStorage(key);
  }

  async getAuthToken(): Promise<string | null> {
    return await this.get("authToken");
  }

  async setAuthToken(token: string): Promise<boolean> {
    return await this.set("authToken", token);
  }

  async removeAuthToken(): Promise<boolean> {
    return await this.remove("authToken");
  }

  async clearSessionData(): Promise<void> {
    const keysToClear = [
      "authToken",
      "authDisplayName",
      "timer_state",
      "reminderSettings",
      "googleAccessToken",
      "googleAccessTokenExpiresAt",
    ];

    await Promise.all(keysToClear.map((key) => this.remove(key)));
    await this.clearGoogleAccessToken();
  }

  /**
   * Stores Google access token with optional expiry (1 minute buffer).
   */
  async setGoogleAccessToken(token: string, expiresInSeconds?: number) {
    await this.set("googleAccessToken", token);
    if (expiresInSeconds) {
      const expiresAt = Date.now() + expiresInSeconds * 1000 - 60 * 1000;
      await this.set("googleAccessTokenExpiresAt", expiresAt);
    } else {
      await this.remove("googleAccessTokenExpiresAt");
    }
  }

  /**
   * Gets Google access token if valid (not expired), otherwise returns null.
   */
  async getGoogleAccessToken(): Promise<string | null> {
    const token = await this.get("googleAccessToken");
    if (!token) return null;
    const expiresAt = await this.get("googleAccessTokenExpiresAt");
    if (expiresAt && Date.now() >= expiresAt) {
      await this.clearGoogleAccessToken();
      return null;
    }
    return token;
  }

  async clearGoogleAccessToken() {
    await this.remove("googleAccessToken");
    await this.remove("googleAccessTokenExpiresAt");
  }

  async getTheme(): Promise<"light" | "dark"> {
    return (await this.get("theme")) || "light";
  }

  async setTheme(theme: "light" | "dark"): Promise<boolean> {
    if (electronAPI?.setThemePreference) {
      await electronAPI.setThemePreference(theme);
      return true;
    }
    return await this.set("theme", theme);
  }

  async getTimerState(): Promise<{
    status: string;
    accumulatedTime: number;
    runStartedAt: number | null;
  }> {
    return (
      (await this.get("timer_state")) || {
        status: "idle",
        accumulatedTime: 0,
        runStartedAt: null,
      }
    );
  }

  async setTimerState(state: {
    status: string;
    accumulatedTime: number;
    runStartedAt: number | null;
  }): Promise<boolean> {
    return await this.set("timer_state", state);
  }
}

export const storage = new Storage();
