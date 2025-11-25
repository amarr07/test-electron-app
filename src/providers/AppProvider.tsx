import { ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { ChatProvider } from "./ChatProvider";
import { NotificationProvider } from "./NotificationProvider";
import { ThemeProvider } from "./ThemeProvider";
import { ToastProvider } from "./ToastProvider";

/**
 * Root provider that wraps all context providers.
 * Provider order: Toast -> Notification -> Auth -> Chat -> Theme.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <NotificationProvider>
        <AuthProvider>
          <ChatProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </ChatProvider>
        </AuthProvider>
      </NotificationProvider>
    </ToastProvider>
  );
}
