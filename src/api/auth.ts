import { config, electronAPI } from "@/lib/electron";
import { getFirebaseAuth } from "@/lib/firebase";
import { storage } from "@/lib/storage";
import {
  deleteUser,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  type Auth,
  type User,
} from "firebase/auth";

/**
 * Centralized Firebase Auth manager.
 * Handles sign-in/sign-out, token management, and Google Calendar token storage.
 */
class AuthManager {
  private auth: Auth | null;
  private currentUser: User | null = null;
  private authReady = false;
  private authReadyPromise: Promise<void>;
  private resolveAuthReady: (() => void) | null = null;
  private onAuthStateChangedCallback: ((user: User | null) => void) | null =
    null;

  constructor() {
    this.auth = getFirebaseAuth();
    this.authReadyPromise = new Promise((resolve) => {
      this.resolveAuthReady = resolve;
    });
    this.initialize();
  }

  private markAuthReady() {
    if (!this.authReady) {
      this.authReady = true;
      this.resolveAuthReady?.();
    }
  }

  /**
   * Sets up Firebase Auth listeners for token sync and state tracking.
   */
  private async initialize() {
    if (!this.auth) {
      this.markAuthReady();
      return;
    }

    this.auth.languageCode =
      typeof navigator !== "undefined" ? navigator.language : "en";

    onIdTokenChanged(this.auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken(true);
          await storage.setAuthToken(token);
          if (user.displayName) {
            await storage.set("authDisplayName", user.displayName);
          }
        } catch {}
      } else {
        await storage.removeAuthToken();
        await storage.remove("authDisplayName");
        await storage.clearGoogleAccessToken();
      }
    });

    onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      if (this.onAuthStateChangedCallback) {
        this.onAuthStateChangedCallback(user);
      }
    });

    this.currentUser = this.auth.currentUser;
    this.markAuthReady();
  }

  /**
   * Waits for Firebase Auth to finish initializing.
   */
  async waitForAuthReady(): Promise<void> {
    await this.authReadyPromise;
  }

  /**
   * Registers callback for auth state changes.
   * Immediately calls with current user if auth is ready.
   */
  setOnAuthStateChanged(callback: (user: User | null) => void): void {
    this.onAuthStateChangedCallback = callback;
    if (this.authReady) {
      callback(this.currentUser);
    }
  }

  /**
   * Ensures Firebase Auth is configured, throws if not.
   */
  private ensureAuth(): Auth {
    if (!this.auth) {
      throw new Error(
        "Firebase authentication is not configured. Verify environment variables.",
      );
    }
    return this.auth;
  }

  /**
   * Signs in with email and password.
   */
  async signInWithEmail(email: string, password: string): Promise<User> {
    const auth = this.ensureAuth();
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      );
      return credential.user;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Signs in with Google OAuth using Electron OAuth window.
   * Opens external OAuth window and extracts tokens from redirect URL.
   */
  async signInWithGoogle(): Promise<User> {
    const auth = this.ensureAuth();

    if (!electronAPI?.openOAuthWindow) {
      throw new Error("Electron API not available");
    }

    const api = electronAPI;

    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/userinfo.email");
      provider.addScope("https://www.googleapis.com/auth/userinfo.profile");
      provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
      provider.setCustomParameters({ prompt: "consent" });

      const apiKey = config.FIREBASE_API_KEY;
      const authDomain = config.FIREBASE_AUTH_DOMAIN;

      if (!apiKey || !authDomain) {
        throw new Error("Firebase configuration missing");
      }

      const providerId = provider.providerId;
      const scopes = provider.getScopes().join(",");
      const customParams = new URLSearchParams({
        apiKey,
        providerId,
        scopes,
        redirectUrl: `https://${authDomain}/__/auth/handler`,
        eventId: Math.random().toString(36).substring(7),
        v: "10.7.0",
      });

      const oauthUrl = `https://${authDomain}/__/auth/handler?${customParams.toString()}`;

      const result = await new Promise<{ url: string }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          api.removeAuthCallback();
          reject(new Error("OAuth timeout"));
        }, 120000);

        api.onAuthCallback((data: { url: string }) => {
          clearTimeout(timeoutId);
          api.removeAuthCallback();
          resolve(data);
        });

        api
          .openOAuthWindow({
            url: oauthUrl,
            callbackUrl: `https://${authDomain}/__/auth/handler`,
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            api.removeAuthCallback();
            reject(err);
          });
      });

      const urlParams = new URLSearchParams(result.url.split("#")[1] || "");
      const idToken = urlParams.get("id_token");
      const accessToken = urlParams.get("access_token");
      const expiresIn = urlParams.get("expires_in");

      if (!idToken) {
        throw new Error("No ID token received from Google");
      }

      const credential = GoogleAuthProvider.credential(idToken, accessToken);
      const userCredential = await signInWithCredential(auth, credential);

      if (accessToken) {
        const expiresInSeconds = expiresIn
          ? parseInt(expiresIn, 10)
          : undefined;
        await storage.setGoogleAccessToken(accessToken, expiresInSeconds);
      } else {
        await storage.clearGoogleAccessToken();
      }

      return userCredential.user;
    } catch (error: any) {
      await storage.clearGoogleAccessToken();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Signs in with Apple OAuth using Electron OAuth window.
   */
  async signInWithApple(): Promise<User> {
    const auth = this.ensureAuth();

    if (!electronAPI?.openOAuthWindow) {
      throw new Error("Electron API not available");
    }

    const api = electronAPI;

    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");

      const apiKey = config.FIREBASE_API_KEY;
      const authDomain = config.FIREBASE_AUTH_DOMAIN;

      if (!apiKey || !authDomain) {
        throw new Error("Firebase configuration missing");
      }

      const providerId = provider.providerId;
      const scopes = provider.getScopes().join(",");
      const customParams = new URLSearchParams({
        apiKey,
        providerId,
        scopes,
        redirectUrl: `https://${authDomain}/__/auth/handler`,
        eventId: Math.random().toString(36).substring(7),
        v: "10.7.0",
      });

      const oauthUrl = `https://${authDomain}/__/auth/handler?${customParams.toString()}`;

      const result = await new Promise<{ url: string }>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          api.removeAuthCallback();
          reject(new Error("OAuth timeout"));
        }, 120000);

        api.onAuthCallback((data: { url: string }) => {
          clearTimeout(timeoutId);
          api.removeAuthCallback();
          resolve(data);
        });

        api
          .openOAuthWindow({
            url: oauthUrl,
            callbackUrl: `https://${authDomain}/__/auth/handler`,
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            api.removeAuthCallback();
            reject(err);
          });
      });

      const urlParams = new URLSearchParams(result.url.split("#")[1] || "");
      const idToken = urlParams.get("id_token");

      if (!idToken) {
        throw new Error("No ID token received from Apple");
      }

      const credential = provider.credential({
        idToken: idToken,
      });
      const userCredential = await signInWithCredential(auth, credential);

      return userCredential.user;
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Signs out current user and clears all stored tokens.
   */
  async signOut(): Promise<void> {
    if (!this.auth) {
      return;
    }

    try {
      await firebaseSignOut(this.auth);
      await storage.removeAuthToken();
      await storage.remove("authDisplayName");
      await storage.clearGoogleAccessToken();
      this.currentUser = null;
      if (this.onAuthStateChangedCallback) {
        this.onAuthStateChangedCallback(null);
      }
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Permanently deletes the current user account.
   */
  async deleteAccount(): Promise<void> {
    if (!this.auth?.currentUser) {
      throw new Error("No active user to delete.");
    }
    try {
      await deleteUser(this.auth.currentUser);
      await storage.removeAuthToken();
      await storage.remove("authDisplayName");
      await storage.clearGoogleAccessToken();
      this.currentUser = null;
      if (this.onAuthStateChangedCallback) {
        this.onAuthStateChangedCallback(null);
      }
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Gets current authenticated user, null if not signed in.
   */
  async getCurrentUser(): Promise<User | null> {
    return this.currentUser;
  }

  /**
   * Gets Firebase ID token for current user.
   * Returns null if not authenticated.
   */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    if (!this.auth?.currentUser) {
      return null;
    }
    try {
      return await this.auth.currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }

  /**
   * Sends password reset email to user.
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    const auth = this.ensureAuth();
    try {
      await firebaseSendPasswordResetEmail(auth, email.trim());
    } catch (error: any) {
      throw this.handleAuthError(error);
    }
  }

  /**
   * Converts Firebase auth error codes to user-friendly messages.
   */
  private handleAuthError(error: any): Error {
    const code = error?.code || "";
    const message = error?.message || "Authentication failed";

    if (code === "auth/invalid-email") {
      return new Error("Enter a valid email address.");
    } else if (code === "auth/invalid-credential") {
      return new Error("Invalid email or password.");
    } else if (code === "auth/user-not-found") {
      return new Error("No account found with this email address.");
    } else if (code === "auth/too-many-requests") {
      return new Error("Too many failed attempts. Try again later.");
    } else if (code === "auth/popup-closed-by-user") {
      return new Error("Sign-in was cancelled.");
    } else if (code === "auth/account-exists-with-different-credential") {
      return new Error(
        "An account already exists with the same email address.",
      );
    } else if (code === "auth/operation-not-allowed") {
      return new Error("This sign-in method is disabled for your project.");
    } else if (code === "auth/requires-recent-login") {
      return new Error("Sign in again to complete this action.");
    } else if (code === "auth/unauthorized-domain") {
      return new Error("This domain is not authorized for OAuth operations.");
    } else if (message.includes("OAuth timeout")) {
      return new Error("Sign-in timed out. Please try again.");
    }

    return new Error(message);
  }
}

export const authManager = new AuthManager();
