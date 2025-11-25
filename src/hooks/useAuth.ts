import { authManager } from "@/api/auth";
import { useToast } from "@/providers/ToastProvider";
import { type User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";

/**
 * Hook for managing authentication state and operations.
 * Provides sign-in methods (email, Google, Apple), sign-out, account deletion, and profile updates.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        await authManager.waitForAuthReady();

        authManager.setOnAuthStateChanged((currentUser) => {
          if (mounted) {
            setUser(currentUser);
            setLoading(false);
          }
        });

        const currentUser = await authManager.getCurrentUser();
        if (mounted) {
          setUser(currentUser);
          setLoading(false);
        }
      } catch (error: any) {
        toast({
          title: "Unable to initialize authentication",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, [toast]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const user = await authManager.signInWithEmail(email, password);
      return user;
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    const user = await authManager.signInWithGoogle();
    return user;
  }, []);

  const signInWithApple = useCallback(async () => {
    const user = await authManager.signInWithApple();
    return user;
  }, []);

  const signOut = useCallback(async () => {
    await authManager.signOut();
  }, []);

  const deleteAccount = useCallback(async () => {
    await authManager.deleteAccount();
  }, []);

  const sendPasswordResetEmail = useCallback(async (email: string) => {
    await authManager.sendPasswordResetEmail(email);
  }, []);

  /**
   * Updates user profile (name, date of birth) in Firestore and Firebase Auth.
   * Syncs displayName to Firebase Auth when name is updated.
   */
  const updateProfile = useCallback(
    async (updates: { name?: string; dob?: Date | null }) => {
      if (!user?.uid) {
        throw new Error("User not authenticated");
      }
      const { updateUserProfile } = await import("@/lib/firestore");
      await updateUserProfile(user.uid, updates);

      if (updates.name && user.displayName !== updates.name) {
        const { updateProfile: updateAuthProfile } = await import(
          "firebase/auth"
        );
        const { getFirebaseAuth } = await import("@/lib/firebase");
        const auth = getFirebaseAuth();
        if (auth?.currentUser) {
          await updateAuthProfile(auth.currentUser, {
            displayName: updates.name,
          });
        }
      }
    },
    [user],
  );

  return {
    user,
    loading,
    signInWithEmail,
    signInWithGoogle,
    signInWithApple,
    signOut,
    deleteAccount,
    sendPasswordResetEmail,
    updateProfile,
  };
}
