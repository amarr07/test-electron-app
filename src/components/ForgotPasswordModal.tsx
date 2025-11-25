import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useAuthContext } from "@/providers/AuthProvider";
import { Mail, X } from "lucide-react";
import React, { useState } from "react";

interface ForgotPasswordModalProps {
  onClose: () => void;
}

/**
 * Modal for password reset via email.
 * Auto-closes after successful submission.
 */
export function ForgotPasswordModal({ onClose }: ForgotPasswordModalProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const { sendPasswordResetEmail } = useAuthContext();

  useEscapeKey(onClose);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await sendPasswordResetEmail(email.trim());
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err: any) {
      setError(
        err.message || "Failed to send password reset email. Try again.",
      );
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
              Reset password
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your email and we'll send you a reset link.
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
              disabled={success}
            />
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 text-muted-foreground text-sm">
            <svg
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              We'll email you a secure link to reset your password.
              <br />
              Check your spam folder if you don't see it in your inbox.
            </div>
          </div>

          {success && (
            <div className="p-3 rounded-lg bg-primary/10 text-primary text-sm border border-primary/20">
              Password reset email sent! Please check your inbox.
            </div>
          )}

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
              disabled={loading || success}
            >
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
