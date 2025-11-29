import {
  checkUserHasBackendAccount,
  isCurrentDevicePaired,
} from "@/api/device";
import { useEffect, useRef, useState } from "react";

export interface InitialChecksResult {
  hasBackendAccount: boolean;
  isDevicePaired: boolean;
  error: string | null;
}

/**
 * Hook for performing initial checks after authentication.
 * Verifies backend account existence and device pairing.
 */
export function useInitialChecks(userId: string | null) {
  const [checking, setChecking] = useState(false);
  const [checksResult, setChecksResult] = useState<InitialChecksResult | null>(
    null,
  );
  const hasRunRef = useRef(false);
  const currentUserIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Reset if user changes
    if (currentUserIdRef.current !== userId) {
      // Cancel any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      hasRunRef.current = false;
      currentUserIdRef.current = userId;
      setChecksResult(null);
      setChecking(false);
    }

    // Don't run if no user or already ran for this user
    if (!userId || hasRunRef.current) {
      return;
    }

    hasRunRef.current = true;
    setChecking(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const performChecks = async () => {
      try {
        // Check if user has backend account first
        // Force token refresh to avoid using stale tokens from previous user
        const hasBackendAccount = await checkUserHasBackendAccount();

        if (abortController.signal.aborted) {
          return;
        }

        // Only check device pairing if user has an account
        // This prevents unnecessary API calls that would return 500
        let isDevicePaired = false;
        if (hasBackendAccount) {
          try {
            isDevicePaired = await isCurrentDevicePaired();
            if (abortController.signal.aborted) {
              return;
            }
          } catch (error: any) {
            // If device check fails, user still has account but device not paired
            isDevicePaired = false;
          }
        }

        if (abortController.signal.aborted) {
          return;
        }

        setChecksResult({
          hasBackendAccount,
          isDevicePaired,
          error: null,
        });
      } catch (error: any) {
        if (abortController.signal.aborted) {
          return;
        }
        setChecksResult({
          hasBackendAccount: false,
          isDevicePaired: false,
          error: error.message || "Failed to perform initial checks",
        });
      } finally {
        if (!abortController.signal.aborted) {
          setChecking(false);
        }
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    };

    performChecks();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [userId]);

  return {
    checking,
    checksResult,
  };
}
