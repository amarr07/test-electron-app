import { useAuth } from "@/hooks/useAuth";
import { type User } from "firebase/auth";
import { createContext, ReactNode, useContext } from "react";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signInWithApple: () => Promise<User>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  updateProfile: (updates: {
    name?: string;
    dob?: Date | null;
  }) => Promise<void>;
}

/**
 * Context for authentication state and operations.
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Provides authentication context to the app.
 * Wraps useAuth hook and exposes auth methods to children.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication context.
 * Throws error if used outside AuthProvider.
 */
export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
}
