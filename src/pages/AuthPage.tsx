import { AuthButton } from "@/components/AuthButton";
import { AuthModal } from "@/components/AuthModal";
import { ForgotPasswordModal } from "@/components/ForgotPasswordModal";
import { useAuthContext } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { Check } from "lucide-react";
import { useState } from "react";
import logoBlack from "../../assets/neosapien-black.svg";
import logoWhite from "../../assets/neosapien-white.svg";

/**
 * Authentication page with sign-in options (Email, Google, Apple).
 * Requires terms agreement before allowing sign-in.
 * Manages modals for email auth and password reset.
 */
export function AuthPage() {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [forgotPasswordModalOpen, setForgotPasswordModalOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState<"google" | "apple" | null>(
    null,
  );
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { signInWithGoogle, signInWithApple } = useAuthContext();
  const { toast } = useToast();

  /**
   * Handles Google OAuth sign-in with loading state and error handling.
   */
  const handleGoogleSignIn = async () => {
    setAuthLoading("google");
    try {
      await signInWithGoogle();
    } catch (error: any) {
      toast({
        title: "Unable to sign in with Google",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setAuthLoading(null);
    }
  };

  /**
   * Handles Apple OAuth sign-in with loading state and error handling.
   */
  const handleAppleSignIn = async () => {
    setAuthLoading("apple");
    try {
      await signInWithApple();
    } catch (error: any) {
      toast({
        title: "Unable to sign in with Apple",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setAuthLoading(null);
    }
  };

  return (
    <div className="theme-auth w-full h-full flex items-center justify-center relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-surface/40 to-transparent" />

      <div className="relative z-10 flex flex-col items-center gap-2 max-w-[420px] w-full px-8 py-10">
        <img
          src={
            document.documentElement.classList.contains("dark")
              ? logoWhite
              : logoBlack
          }
          alt="NeoSapien"
          className="h-32 w-auto transition-opacity"
        />
        <p className="text-sm text-muted font-normal tracking-wide">
          Your Second Brain
        </p>

        <div className="flex flex-col gap-3.5 w-full mt-1">
          <AuthButton
            provider="email"
            onClick={() => setEmailModalOpen(true)}
            disabled={!agreedToTerms}
          />
          <div className="flex items-center gap-4 w-full my-2">
            <span className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted uppercase tracking-wider">
              OR
            </span>
            <span className="flex-1 h-px bg-border" />
          </div>
          <AuthButton
            provider="google"
            onClick={handleGoogleSignIn}
            disabled={authLoading === "google" || !agreedToTerms}
          />
          <AuthButton
            provider="apple"
            onClick={handleAppleSignIn}
            disabled={authLoading === "apple" || !agreedToTerms}
          />
        </div>

        <div className="flex items-start gap-2 w-full mt-4">
          <button
            type="button"
            onClick={() => setAgreedToTerms(!agreedToTerms)}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
              agreedToTerms
                ? "border-[#0f8b54] bg-[#0f8b54]"
                : "border-border bg-surface"
            }`}
          >
            {agreedToTerms && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
          <div className="flex flex-wrap items-center gap-1 text-center">
            <span className="text-xs text-muted">
              By continuing, you agree to our
            </span>
            <a
              href="https://neosapien.xyz/terms-and-conditions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 underline"
            >
              Terms of Service
            </a>
            <span className="text-xs text-muted">and</span>
            <a
              href="https://neosapien.xyz/policies"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:text-primary/80 underline"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>

      {emailModalOpen && (
        <AuthModal
          onClose={() => setEmailModalOpen(false)}
          onForgotPassword={() => {
            setEmailModalOpen(false);
            setForgotPasswordModalOpen(true);
          }}
        />
      )}

      {forgotPasswordModalOpen && (
        <ForgotPasswordModal
          onClose={() => setForgotPasswordModalOpen(false)}
        />
      )}
    </div>
  );
}
