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
import { Timestamp } from "firebase/firestore";

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
   * Connects Google Calendar without signing in to Firebase.
   * Only gets calendar access token for existing signed-in users.
   */
  async connectGoogleCalendar(): Promise<string> {
    if (!electronAPI) {
      throw new Error("Electron API not available");
    }

    const clientId = config.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("Google Client ID not configured");
    }

    // Only request calendar scope, don't sign in
    const redirectUri = `https://${config.FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/handler`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "https://www.googleapis.com/auth/calendar.readonly",
      prompt: "select_account",
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    const result = await new Promise<{ url: string }>((resolve, reject) => {
      if (!electronAPI) {
        reject(new Error("Electron API not available"));
        return;
      }

      const timeout = setTimeout(() => {
        electronAPI?.removeAuthCallback();
        reject(new Error("Authentication timeout"));
      }, 120000);

      const handleCallback = (data: { url: string }) => {
        clearTimeout(timeout);
        electronAPI?.removeAuthCallback();
        resolve(data);
      };

      electronAPI.onAuthCallback(handleCallback);
      electronAPI.openOAuthWindow({
        url: authUrl,
        callbackUrl: redirectUri,
      });
    });

    const urlParams = new URLSearchParams(result.url.split("#")[1] || "");
    const accessToken = urlParams.get("access_token");

    if (!accessToken) {
      throw new Error("No access token received from Google");
    }

    await storage.setGoogleAccessToken(accessToken);
    return accessToken;
  }

  /**
   * Signs in with Google using custom OAuth window for Electron.
   * Uses response_mode=query to get tokens in query params for better reliability.
   */
  async signInWithGoogle(): Promise<User> {
    const auth = this.ensureAuth();

    if (!electronAPI) {
      throw new Error("Electron API not available");
    }

    try {
      const clientId = config.GOOGLE_CLIENT_ID;
      if (!clientId) {
        throw new Error("Google Client ID not configured");
      }

      // Scopes for authentication and calendar access
      const scopes = [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
      ];

      const redirectUri = `https://${config.FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/handler`;
      const nonce = Math.random().toString(36).substring(2);

      // Use implicit flow - tokens will be in URL fragment (#)
      // Google does not support response_mode=query for implicit flow
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "id_token token",
        scope: scopes.join(" "),
        nonce: nonce,
        prompt: "select_account",
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      // Open OAuth window and wait for callback
      const result = await new Promise<{ url: string }>((resolve, reject) => {
        if (!electronAPI) {
          reject(new Error("Electron API not available"));
          return;
        }

        const timeout = setTimeout(() => {
          electronAPI?.removeAuthCallback();
          reject(new Error("Authentication timeout"));
        }, 120000);

        const handleCallback = (data: { url: string }) => {
          clearTimeout(timeout);
          electronAPI?.removeAuthCallback();
          resolve(data);
        };

        electronAPI.onAuthCallback(handleCallback);
        electronAPI.openOAuthWindow({
          url: authUrl,
          callbackUrl: redirectUri,
        });
      });

      // Parse tokens from callback URL
      // For implicit flow, tokens are always in the URL fragment (#)
      let idToken: string | null = null;
      let accessToken: string | null = null;

      if (result.url.includes("#")) {
        const hashParams = new URLSearchParams(result.url.split("#")[1]);
        idToken = hashParams.get("id_token");
        accessToken = hashParams.get("access_token");
      }

      // Also check query params as fallback (in case callback URL was modified)
      if (!idToken) {
        const urlObj = new URL(result.url);
        idToken = urlObj.searchParams.get("id_token");
        accessToken = urlObj.searchParams.get("access_token");
      }

      if (!idToken) {
        throw new Error("No ID token received from Google");
      }

      // Sign in to Firebase with Google credential
      const credential = GoogleAuthProvider.credential(
        idToken,
        accessToken || undefined,
      );
      const userCredential = await signInWithCredential(auth, credential);
      const currentUser = userCredential.user;

      // Store access token for Google Calendar API
      if (accessToken) {
        await storage.setGoogleAccessToken(accessToken);
      }

      await this.ensureUserRecord(currentUser);

      if (accessToken && (!currentUser.displayName || !currentUser.photoURL)) {
        try {
          const userInfoResponse = await fetch(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            },
          );

          if (userInfoResponse.ok) {
            const userInfo = await userInfoResponse.json();
            const { updateProfile } = await import("firebase/auth");

            await updateProfile(currentUser, {
              displayName: userInfo.name || currentUser.displayName,
              photoURL: userInfo.picture || currentUser.photoURL,
            });

            await currentUser.reload();
          }
        } catch {}
      }

      return userCredential.user;
    } catch (error: any) {
      await storage.clearGoogleAccessToken();
      throw this.handleAuthError(error);
    }
  }

  /**
   * Signs in with Apple using custom OAuth window for Electron.
   * Requires Apple OAuth configuration in Firebase Console.
   * Works in both dev and production builds.
   */
  async signInWithApple(): Promise<User> {
    const auth = this.ensureAuth();

    if (!electronAPI) {
      throw new Error("Electron API not available");
    }

    try {
      const clientId = config.APPLE_CLIENT_ID;
      if (!clientId) {
        throw new Error("Apple Client ID not configured in .env file");
      }

      // Generate nonce for security
      const generateNonce = () => {
        const charset =
          "0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._";
        let result = "";
        const randomValues = new Uint8Array(32);
        crypto.getRandomValues(randomValues);
        randomValues.forEach((v) => {
          result += charset[v % charset.length];
        });
        return result;
      };

      const rawNonce = generateNonce();
      const state = Math.random().toString(36).substring(2);

      // Hash the nonce using SHA-256 (required by Apple)
      const hashNonce = async (nonce: string) => {
        const encoder = new TextEncoder();
        const data = encoder.encode(nonce);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      };

      const hashedNonce = await hashNonce(rawNonce);

      // Build Apple OAuth URL
      // Note: Apple requires Service ID, Team ID, Key ID, and Private Key to be configured
      // in Firebase Console > Authentication > Sign-in method > Apple
      const redirectUri = `https://${config.FIREBASE_PROJECT_ID}.firebaseapp.com/__/auth/handler`;

      // Use "code id_token" to get both authorization code AND id_token
      // Apple requires response_mode=form_post when requesting name or email scope
      // IMPORTANT: Apple requires the SHA256 hash of the nonce, not the raw nonce
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code id_token",
        response_mode: "form_post",
        state: state,
        scope: "name email", // Request name and email from Apple
        nonce: hashedNonce, // Send hashed nonce to Apple
      });

      const authUrl = `https://appleid.apple.com/auth/authorize?${params.toString()}`;

      // Open OAuth window and wait for callback
      const result = await new Promise<{ url: string }>((resolve, reject) => {
        if (!electronAPI) {
          reject(new Error("Electron API not available"));
          return;
        }

        const timeout = setTimeout(() => {
          electronAPI?.removeAuthCallback();
          reject(
            new Error(
              "Authentication timeout - window closed or no response received",
            ),
          );
        }, 120000);

        const handleCallback = (data: { url: string }) => {
          clearTimeout(timeout);
          electronAPI?.removeAuthCallback();
          resolve(data);
        };

        electronAPI.onAuthCallback(handleCallback);
        electronAPI.openOAuthWindow({
          url: authUrl,
          callbackUrl: redirectUri,
        });
      });

      // Parse ID token from callback URL
      const fragment = result.url.split("#")[1] || "";
      const query = result.url.split("?")[1]?.split("#")[0] || "";

      // Try fragment first (response_mode=fragment puts it in hash)
      let urlParams = new URLSearchParams(fragment);
      let idToken = urlParams.get("id_token");

      // Fallback to query params
      if (!idToken) {
        urlParams = new URLSearchParams(query);
        idToken = urlParams.get("id_token");
      }

      // Check for errors in response
      const error = urlParams.get("error");
      const errorDescription = urlParams.get("error_description");
      if (error) {
        throw new Error(
          `Apple Sign-In error: ${error}${errorDescription ? ` - ${errorDescription}` : ""}`,
        );
      }

      if (!idToken) {
        throw new Error(
          "No ID token received from Apple. " +
            "Callback URL: " +
            result.url +
            ". " +
            "Please ensure Apple OAuth is properly configured in Firebase Console " +
            "and that response_type=id_token is supported by your Apple Service ID.",
        );
      }

      // Sign in to Firebase with the Apple credential
      // IMPORTANT: Use the raw (unhashed) nonce for Firebase verification
      const provider = new OAuthProvider("apple.com");
      const credential = provider.credential({
        idToken,
        rawNonce: rawNonce,
      });
      const userCredential = await signInWithCredential(auth, credential);
      await this.ensureUserRecord(userCredential.user);

      return userCredential.user;
    } catch (error: any) {
      // Provide helpful error messages
      if (error.message?.includes("No ID token")) {
        throw error; // Already has helpful message
      }
      throw this.handleAuthError(error);
    }
  }

  /**
   * Signs out current user and clears all stored tokens.
   * Ensures recording is stopped and mic is released before logout.
   */
  async signOut(): Promise<void> {
    if (!this.auth) {
      return;
    }

    try {
      try {
        const { audioRecorder } = await import("@/lib/recorder");
        await audioRecorder.forceCleanup();
      } catch (cleanupError) {}

      await firebaseSignOut(this.auth);
      await storage.clearSessionData();
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
      await storage.clearSessionData();
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
   * Ensures a Firestore user record exists and updates last sign-in timestamp.
   * Fails silently to avoid blocking authentication if Firestore is unavailable.
   */
  private async ensureUserRecord(user: User | null): Promise<void> {
    if (!user?.uid) return;
    try {
      const { upsertUser } = await import("@/lib/firestore");
      const now = Timestamp.now();
      const providerId =
        user.providerData?.find((p) => p.providerId)?.providerId || "password";
      const displayName =
        user.displayName?.trim() || user.email?.split("@")[0] || "User";

      await upsertUser({
        id: user.uid,
        name: displayName,
        email: user.email || "",
        profile_url: user.photoURL || null,
        provider: providerId,
        created_at: now,
        updated_at: now,
        last_sign_at: now,
      });
    } catch (err) {
      console.error("Failed to ensure user record:", err);
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
