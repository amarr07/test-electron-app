import { Loader } from "@/components/ui/loader";
import { AuthPage } from "@/pages/AuthPage";
import { HomePage } from "@/pages/HomePage";
import { AppProvider } from "@/providers/AppProvider";
import { useAuthContext } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import React, { useEffect, useRef } from "react";
import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from "react-router-dom";

/**
 * Route wrapper that requires authentication.
 * Shows loader while checking auth and performing initial checks.
 * Redirects to /auth if not authenticated.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, checking, hasBackendAccount, checksError, signOut } =
    useAuthContext();
  const { toast } = useToast();
  const hasHandledSignOutRef = useRef(false);

  useEffect(() => {
    if (!user) {
      hasHandledSignOutRef.current = false;
      return;
    }

    if (checking) {
      return;
    }

    if (hasHandledSignOutRef.current) {
      return;
    }

    if (checksError || !hasBackendAccount) {
      hasHandledSignOutRef.current = true;

      const message = checksError
        ? checksError
        : "No account found. Please contact support to create an account before signing in.";

      toast({
        title: checksError ? "Account verification failed" : "No account found",
        description: message,
        variant: "destructive",
      });

      signOut().catch((error) => {
        console.error("Failed to sign out:", error);
      });
    }
  }, [user, checking, checksError, hasBackendAccount, toast, signOut]);

  // Show loading while auth is initializing
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader label="Initializing..." />
      </div>
    );
  }

  // If not authenticated, redirect to auth page
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while performing initial checks
  if (checking) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader label="Verifying account..." />
      </div>
    );
  }

  // After checks complete, if there's an error or no backend account,
  // show signing out loader while sign out is in progress
  if (user && (checksError || !hasBackendAccount)) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader label="Signing out..." />
      </div>
    );
  }

  // All checks passed, show content
  return <>{children}</>;
}

/**
 * Route wrapper for public pages (auth page).
 * Redirects to / if already authenticated.
 */
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader label="Preparing your workspace..." />
      </div>
    );
  }

  return !user ? <>{children}</> : <Navigate to="/" replace />;
}

/**
 * Defines application routes with authentication guards.
 */
function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

/**
 * Root application component.
 * Wraps app with providers and sets up React Router.
 */
export function App() {
  return (
    <AppProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AppProvider>
  );
}

export default App;
