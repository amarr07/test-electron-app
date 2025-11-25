import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useAuthContext } from "@/providers/AuthProvider";
import { Eye, EyeOff, Lock, Mail, X } from "lucide-react";
import React, { useState } from "react";

interface AuthModalProps {
  onClose: () => void;
  onForgotPassword: () => void;
}

/**
 * Modal for email/password authentication.
 * Includes password visibility toggle and forgot password link.
 */
export function AuthModal({ onClose, onForgotPassword }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { signInWithEmail } = useAuthContext();

  useEscapeKey(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmail(email.trim(), password);
      onClose();
    } catch (err: any) {
      setError(err.message || "Authentication failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl p-6 w-[90%] max-w-[440px] shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-foreground mb-1">
              Sign in
            </h2>
            <p className="text-sm text-muted-foreground">
              Access your NeoSapien workspace with your email and password.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              <Mail className="w-5 h-5" />
            </span>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-12"
              required
              autoFocus
            />
          </div>

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              <Lock className="w-5 h-5" />
            </span>
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-12 pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>

          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onForgotPassword();
            }}
            className="block text-right text-sm text-foreground hover:text-primary transition-colors -mt-2"
          >
            Forgot password?
          </a>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              className="flex-1"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
