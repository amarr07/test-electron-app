import { authManager } from "@/api/auth";
import { storage } from "@/lib/storage";
import { decodeJWT } from "@/lib/utils";

/**
 * Buffer time (seconds) before token expiry to consider it invalid.
 * Prevents using tokens that expire during request execution.
 */
const TOKEN_EXPIRY_BUFFER_SECONDS = 60;

interface TokenOptions {
  forceRefresh?: boolean;
  purpose?: string;
}

interface FetchOptions extends TokenOptions {
  retryOnAuthError?: boolean;
}

/**
 * Validates JWT token by checking expiration time.
 */
function isTokenValid(token: string): boolean {
  const payload = decodeJWT(token);
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const exp = Number((payload as Record<string, unknown>).exp);
  if (!Number.isFinite(exp)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  return exp - TOKEN_EXPIRY_BUFFER_SECONDS > nowSeconds;
}

/**
 * Builds user-friendly auth error message based on purpose.
 */
function buildAuthErrorMessage(purpose?: string) {
  const action = purpose ? `to ${purpose}` : "to continue";
  return `Sign in ${action}.`;
}

/**
 * Gets valid auth token, using cache when possible.
 * Retries with fresh token if cache is invalid.
 */
export async function getValidAuthToken(
  options: TokenOptions = {},
): Promise<string> {
  const { forceRefresh = false, purpose } = options;
  const authError = buildAuthErrorMessage(purpose);

  if (!forceRefresh) {
    const cached = await storage.getAuthToken();
    if (cached && isTokenValid(cached)) {
      return cached;
    }
  }

  try {
    const refreshed = await authManager.getIdToken(true);
    if (refreshed) {
      await storage.setAuthToken(refreshed);
      return refreshed;
    }
  } catch {}

  await storage.removeAuthToken();
  throw new Error(authError);
}

/**
 * Normalizes various header formats to consistent structure.
 */
function normalizeHeaders(
  headers?: HeadersInit,
): Record<string, string> | Headers {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return headers;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, entry) => {
      const [key, value] = entry;
      acc[key] = value;
      return acc;
    }, {});
  }

  return { ...headers };
}

/**
 * Injects Authorization header into request config.
 */
function withAuthorization(
  init: RequestInit | undefined,
  token: string,
): RequestInit {
  const normalized = normalizeHeaders(init?.headers);

  if (normalized instanceof Headers) {
    normalized.set("Authorization", `Bearer ${token}`);
    return {
      ...init,
      headers: normalized,
    };
  }

  return {
    ...init,
    headers: {
      ...normalized,
      Authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Checks if status code indicates auth failure requiring retry.
 */
function shouldRetryAuth(status: number) {
  return status === 401 || status === 403;
}

/**
 * Authenticated fetch with automatic token injection and retry on 401/403.
 */
export async function authorizedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchOptions = {},
): Promise<Response> {
  const { retryOnAuthError = true, purpose, forceRefresh = false } = options;
  let token = await getValidAuthToken({ purpose, forceRefresh });

  let response = await fetch(input, withAuthorization(init, token));
  if (retryOnAuthError && shouldRetryAuth(response.status)) {
    token = await getValidAuthToken({ purpose, forceRefresh: true });
    response = await fetch(input, withAuthorization(init, token));
  }

  return response;
}
