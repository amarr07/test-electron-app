import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility to merge Tailwind CSS classes, resolving conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formats time in milliseconds as HH:MM:SS or MM:SS (omits hours if zero).
 */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [
    h > 0 ? String(h).padStart(2, "0") : undefined,
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].filter(Boolean);
  return parts.join(":");
}

/**
 * Debounces function calls, executing only after wait period of inactivity.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttles function calls, executing at most once per limit period.
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Parses OAuth callback URL hash parameters (access_token, id_token, etc.).
 */
export function parseOAuthCallback(url: string) {
  try {
    const urlObj = new URL(url);
    const hash = urlObj.hash.substring(1);
    const params = new URLSearchParams(hash);
    return {
      access_token: params.get("access_token"),
      id_token: params.get("id_token"),
      token_type: params.get("token_type"),
      expires_in: params.get("expires_in"),
      state: params.get("state"),
      error: params.get("error"),
      error_description: params.get("error_description"),
    };
  } catch (e) {
    return {};
  }
}

/**
 * Decodes JWT token payload (base64url decoding).
 */
export function decodeJWT(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 ? 4 - (normalized.length % 4) : 0;
    const decoded = atob(normalized + "=".repeat(padding));
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

/**
 * Generates random nonce string for OAuth state validation.
 */
export function generateNonce(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/**
 * Hashes nonce using SHA-256 for OAuth PKCE flow.
 */
export async function hashNonce(nonce: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(nonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
