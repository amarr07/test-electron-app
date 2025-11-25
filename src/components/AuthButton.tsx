import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

interface AuthButtonProps {
  provider: "email" | "google" | "apple";
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Button component for authentication providers (Email, Google, Apple).
 * Renders provider-specific icon and text.
 */
export function AuthButton({ provider, onClick, disabled }: AuthButtonProps) {
  const getContent = () => {
    switch (provider) {
      case "email":
        return {
          icon: <Mail className="w-5 h-5" />,
          text: "Continue With Email",
        };
      case "google":
        return {
          icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          ),
          text: "Continue with Google",
        };
      case "apple":
        return {
          icon: (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#000000">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
          ),
          text: "Continue with Apple",
        };
    }
  };

  const content = getContent();
  const isEmail = provider === "email";

  return (
    <Button
      variant={isEmail ? "default" : "ghost"}
      className={`w-full h-12 rounded-lg flex items-center justify-center gap-3 text-base font-medium transition-all ${
        isEmail
          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_6px_14px_rgba(0,0,0,0.18)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.24)]"
          : "bg-surface text-foreground border border-border shadow-[0_4px_10px_rgba(0,0,0,0.08)] hover:bg-surface/80 hover:shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
        {content.icon}
      </span>
      <span>{content.text}</span>
    </Button>
  );
}
