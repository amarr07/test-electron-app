import { useAuthContext } from "@/providers/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import {
  CheckSquare,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onOpenSettings?: () => void;
}

/**
 * Sidebar navigation component with section switching and user profile menu.
 */
export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  activeSection,
  onSectionChange,
  onOpenSettings,
}: SidebarProps) {
  const { user, signOut } = useAuthContext();
  const { toast } = useToast();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [pendingMenuOpen, setPendingMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const navItems = [
    { id: "home", label: "Home", icon: Home },
    { id: "ask-neo", label: "Ask Neo", icon: MessageSquare },
    { id: "memories", label: "Memories", icon: Sparkles },
    { id: "reminders", label: "Reminders", icon: CheckSquare },
  ];

  const renderAvatar = () => {
    if (!user) return null;
    if (user.photoURL) {
      return (
        <img
          src={user.photoURL}
          alt={user.displayName || user.email || "Profile photo"}
          className="w-8 h-8 rounded-full object-cover flex-shrink-0"
        />
      );
    }
    const initial =
      user.displayName?.[0]?.toUpperCase() ||
      user.email?.[0]?.toUpperCase() ||
      "U";
    return (
      <div className="w-8 h-8 rounded-full bg-slate-100/60 dark:bg-[#1f1f1f] flex items-center justify-center flex-shrink-0 border border-slate-300/30 dark:border-[#2a2a2a]">
        <span className="text-xs font-medium text-foreground">{initial}</span>
      </div>
    );
  };

  const profileOptions = [
    {
      id: "settings",
      label: "Settings",
      description: "Preferences & account",
      icon: Settings,
      action: () => {
        setProfileMenuOpen(false);
        onOpenSettings?.();
      },
    },
    {
      id: "logout",
      label: "Logout",
      description: "Sign out of NeoSapien",
      icon: LogOut,
      variant: "danger" as const,
      action: async () => {
        setProfileMenuOpen(false);
        try {
          await signOut();
        } catch (error) {
          toast({
            title: "Unable to sign out",
            description: "Try again.",
            variant: "destructive",
          });
        }
      },
    },
  ];

  const handleProfileClick = () => {
    if (isCollapsed) {
      setPendingMenuOpen(true);
      onToggleCollapse();
    } else {
      setProfileMenuOpen((prev) => !prev);
    }
  };

  useEffect(() => {
    if (pendingMenuOpen && !isCollapsed) {
      setProfileMenuOpen(true);
      setPendingMenuOpen(false);
    }
  }, [isCollapsed, pendingMenuOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false);
        setPendingMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [profileMenuOpen]);

  const profileCard = user ? (
    <div className="relative" ref={profileMenuRef}>
      <button
        type="button"
        onClick={handleProfileClick}
        className={`w-full rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface/95 shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] flex items-center ${
          isCollapsed ? "justify-center px-0 py-3" : "gap-3 px-3 py-2.5"
        } transition-all hover:border-[#b0b0b0] dark:hover:border-[#505050] hover:shadow-[0_14px_38px_rgba(0,0,0,0.16)] dark:hover:shadow-[0_14px_38px_rgba(0,0,0,0.4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50`}
      >
        {renderAvatar()}
        {!isCollapsed && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-foreground truncate">
              {user.displayName || "User"}
            </p>
            <p className="text-[11px] text-muted truncate">{user.email}</p>
          </div>
        )}
      </button>
      {profileMenuOpen && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 right-0 w-full rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-[0_12px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_30px_rgba(0,0,0,0.35)] p-1.5 space-y-1 z-50">
          {profileOptions.map((option) => {
            const Icon = option.icon;
            const isDanger = option.variant === "danger";
            return (
              <button
                key={option.id}
                type="button"
                onClick={option.action}
                className={`w-full flex items-start gap-2.5 rounded-xl px-3 py-2 transition group ${
                  isDanger
                    ? "hover:bg-danger/10"
                    : "hover:bg-slate-100/80 dark:hover:bg-[#1f1f1f]"
                }`}
              >
                <span className="mt-0.5">
                  <Icon
                    className={`w-4 h-4 transition ${
                      isDanger
                        ? "text-danger group-hover:text-danger"
                        : "text-muted group-hover:text-foreground"
                    }`}
                  />
                </span>
                <span className="text-left">
                  <span
                    className={`text-sm font-semibold block transition ${
                      isDanger
                        ? "text-danger group-hover:text-danger"
                        : "text-foreground group-hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </span>
                  <span
                    className={`text-[11px] transition ${
                      isDanger
                        ? "text-danger/70 group-hover:text-danger/90"
                        : "text-muted group-hover:text-foreground/80"
                    }`}
                  >
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div
      className={`h-full bg-surface border-r border-border/50 flex flex-col transition-all duration-300 ${
        isCollapsed ? "w-16" : "w-56"
      }`}
    >
      <div className="h-14 flex items-center gap-2 px-3 border-b border-border/50">
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-md text-foreground/70"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-4 h-4" />
        </button>
        {!isCollapsed && (
          <span className="text-xs font-medium text-foreground/80 tracking-tight">
            NeoSapien
          </span>
        )}
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center ${
                isCollapsed ? "justify-center px-0" : "gap-3 px-4"
              } py-2.5 rounded-2xl border transition-all duration-200 ${
                isActive
                  ? "bg-slate-100/80 border-slate-300/60 text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-[#1f1f1f] dark:border-[#2a2a2a] dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                  : "border-transparent text-foreground/70 hover:text-foreground hover:bg-surface/70"
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 ${
                  isActive ? "text-foreground" : "text-foreground/65"
                }`}
              />
              {!isCollapsed && (
                <span
                  className={`text-sm font-medium tracking-tight ${
                    isActive ? "text-foreground" : "text-foreground/70"
                  }`}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-transparent px-3 pb-4">
          {profileCard}
        </div>
      )}
    </div>
  );
}
