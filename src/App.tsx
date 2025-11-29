import { Loader } from "@/components/ui/loader";
import { AuthPage } from "@/pages/AuthPage";
import { HomePage } from "@/pages/HomePage";
import { AppProvider } from "@/providers/AppProvider";
import { useAuthContext } from "@/providers/AuthProvider";
import React from "react";
import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from "react-router-dom";

/**
 * Route wrapper that requires authentication.
 * Redirects to /auth if not authenticated.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Loader label="Initializing..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

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
