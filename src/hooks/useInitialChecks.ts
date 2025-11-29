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

  useEffect(() => {
    // Reset if user changes
    if (currentUserIdRef.current !== userId) {
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

    const performChecks = async () => {
      try {
        // Check if user has backend account first
        const hasBackendAccount = await checkUserHasBackendAccount();

        // Only check device pairing if user has an account
        // This prevents unnecessary API calls that would return 500
        let isDevicePaired = false;
        if (hasBackendAccount) {
          try {
            isDevicePaired = await isCurrentDevicePaired();
          } catch (error: any) {
            // If device check fails, user still has account but device not paired
            isDevicePaired = false;
          }
        }

        setChecksResult({
          hasBackendAccount,
          isDevicePaired,
          error: null,
        });
      } catch (error: any) {
        setChecksResult({
          hasBackendAccount: false,
          isDevicePaired: false,
          error: error.message || "Failed to perform initial checks",
        });
      } finally {
        setChecking(false);
      }
    };

    performChecks();
  }, [userId]);

  return {
    checking,
    checksResult,
  };
}
