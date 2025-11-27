import {
  addCustomDictionaryWord,
  deleteCustomDictionaryWord,
  getCustomDictionaryWords,
  type CustomDictionaryWord,
} from "@/api/customDictionary";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { MarkdownText } from "@/components/ui/markdown";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import {
  PRIVACY_POLICY_LIST,
  TERMS_AND_CONDITIONS_LIST,
} from "@/lib/constants";
import { useAuthContext } from "@/providers/AuthProvider";
import { useThemeContext } from "@/providers/ThemeProvider";
import { useToast } from "@/providers/ToastProvider";
import {
  Bug,
  ChevronDown,
  HelpCircle,
  LogOut,
  Mic,
  MonitorSmartphone,
  Pencil,
  Plus,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Comprehensive settings modal with multiple sections:
 * General (preferences, account), Profile, Dictionary, FAQ, Privacy, Terms, Bug Reports.
 * Manages user profile updates, custom dictionary, and app preferences.
 */
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { user, signOut, deleteAccount, updateProfile } = useAuthContext();
  const { theme, toggleTheme, loading: themeLoading } = useThemeContext();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("general");
  const [bugSummary, setBugSummary] = useState("");
  const [bugDetails, setBugDetails] = useState("");
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] =
    useState(true);
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false);
  const [autoLaunchSaving, setAutoLaunchSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [dictionaryWords, setDictionaryWords] = useState<
    CustomDictionaryWord[]
  >([]);
  const [dictionaryError, setDictionaryError] = useState<string | null>(null);
  const [addingWord, setAddingWord] = useState(false);
  const [isAddingWord, setIsAddingWord] = useState(false);
  const [deletingWordId, setDeletingWordId] = useState<string | null>(null);
  const [wordToDelete, setWordToDelete] = useState<CustomDictionaryWord | null>(
    null,
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(() => {
    if (open) {
      onClose();
    }
  });

  useEffect(() => {
    if (open && user?.uid) {
      setLoadingProfile(true);
      const loadUserProfile = async () => {
        try {
          const { getUser } = await import("@/lib/firestore");
          const userData = await getUser(user.uid);

          if (userData) {
            setFullName(userData.name || user.displayName || "");

            if (userData.dob) {
              const dobDate = userData.dob.toDate();
              setDateOfBirth(dobDate);
            } else {
              setDateOfBirth(null);
            }
          } else {
            setFullName(user.displayName || "");
            setDateOfBirth(null);
          }
        } catch (error: any) {
          console.error("Failed to load user profile:", error);
          setFullName(user.displayName || "");
          setDateOfBirth(null);
        } finally {
          setLoadingProfile(false);
        }
      };

      loadUserProfile();
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      setActiveSection("general");
      setBugSummary("");
      setBugDetails("");
      setNewWord("");
      setIsAddingWord(false);
    }
  }, [open]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeSection]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadAutoLaunch = async () => {
      if (!window.electronAPI?.getAutoLaunch) return;
      try {
        const enabled = await window.electronAPI.getAutoLaunch();
        if (!cancelled) {
          setAutoLaunchEnabled(!!enabled);
        }
      } catch (error) {}
    };
    loadAutoLaunch();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open && activeSection === "dictionary") {
      loadDictionaryWords();
    }
  }, [open, activeSection]);

  /**
   * Loads custom dictionary words for transcription corrections.
   */
  const loadDictionaryWords = async () => {
    setDictionaryError(null);
    try {
      const words = await getCustomDictionaryWords();
      setDictionaryWords(words);
    } catch (error: any) {
      setDictionaryError(error?.message || "Failed to load dictionary words");
    }
  };

  /**
   * Adds word to custom dictionary, checking for duplicates first.
   */
  const handleAddWord = async () => {
    const trimmedWord = newWord.trim();
    if (!trimmedWord) {
      return;
    }

    const exists = dictionaryWords.some(
      (w) => w.corrected_phrase.toLowerCase() === trimmedWord.toLowerCase(),
    );
    if (exists) {
      toast({
        title: "Word already exists",
        description: "This word is already in your dictionary.",
        variant: "destructive",
      });
      return;
    }

    setAddingWord(true);
    const wordToAdd = trimmedWord;
    setNewWord("");
    setIsAddingWord(false);

    try {
      const success = await addCustomDictionaryWord(wordToAdd);
      if (success) {
        await loadDictionaryWords();
        toast({
          title: "Word added",
          description: `Congrats! "${wordToAdd}" added to your dictionary.`,
        });
      } else {
        throw new Error("Failed to add word");
      }
    } catch (error: any) {
      setNewWord(wordToAdd);
      setIsAddingWord(true);
      toast({
        title: "Unable to add word",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setAddingWord(false);
    }
  };

  const handleRemoveWordClick = (word: CustomDictionaryWord) => {
    setWordToDelete(word);
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!wordToDelete) return;

    const word = wordToDelete;
    setDeletingWordId(word.id);
    setShowDeleteConfirm(false);

    try {
      const success = await deleteCustomDictionaryWord(word.id);
      if (success) {
        await loadDictionaryWords();
        toast({
          title: "Word removed",
          description: `Poof! "${word.corrected_phrase}" is removed from your dictionary.`,
        });
      } else {
        throw new Error("Failed to delete word");
      }
    } catch (error: any) {
      toast({
        title: "Unable to remove word",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingWordId(null);
      setWordToDelete(null);
    }
  };

  /**
   * Toggles auto-launch on system startup (desktop app only).
   */
  const handleToggleAutoLaunch = async () => {
    const prev = autoLaunchEnabled;
    const next = !prev;
    if (!window.electronAPI?.setAutoLaunch) {
      toast({
        title: "Feature unavailable",
        description: "Auto-launch can only be configured in the desktop app.",
        variant: "destructive",
      });
      return;
    }
    setAutoLaunchSaving(true);
    setAutoLaunchEnabled(next);
    try {
      const applied = await window.electronAPI.setAutoLaunch(next);
      setAutoLaunchEnabled(applied);
      toast({
        title: applied
          ? "Launch at startup enabled"
          : "Launch at startup disabled",
        description: applied
          ? "NeoSapien will start when you sign in."
          : "NeoSapien will no longer auto-start.",
      });
    } catch (error) {
      setAutoLaunchEnabled(prev);
      toast({
        title: "Unable to update auto-launch",
        description: "Try again.",
        variant: "destructive",
      });
    } finally {
      setAutoLaunchSaving(false);
    }
  };

  const handleSaveName = async () => {
    if (!user?.uid) return;

    const trimmedName = fullName.trim();
    if (!trimmedName) {
      toast({
        title: "Name required",
        description: "Please enter your full name.",
        variant: "destructive",
      });
      setFullName(user.displayName || "");
      return;
    }

    if (trimmedName === user.displayName) {
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({ name: trimmedName });
      const { getFirebaseAuth } = await import("@/lib/firebase");
      const auth = getFirebaseAuth();
      if (auth?.currentUser) {
        await auth.currentUser.reload();
      }
      toast({
        title: "Profile updated",
        description: "Your name has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to update name",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
      setFullName(user.displayName || "");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveDateOfBirth = async (selectedDate: Date) => {
    if (!user?.uid) return;

    const currentYear = new Date().getFullYear();
    const selectedYear = selectedDate.getFullYear();
    if (selectedYear < 1900 || selectedYear > currentYear) {
      toast({
        title: "Invalid date",
        description: `Please select a valid date between 1900 and ${currentYear}.`,
        variant: "destructive",
      });
      return;
    }

    const newDob = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    );

    if (
      dateOfBirth &&
      newDob.getFullYear() === dateOfBirth.getFullYear() &&
      newDob.getMonth() === dateOfBirth.getMonth() &&
      newDob.getDate() === dateOfBirth.getDate()
    ) {
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({ dob: newDob });
      setDateOfBirth(newDob);
      toast({
        title: "Profile updated",
        description: "Your date of birth has been updated.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to update date of birth",
        description: error?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const profileDetails = useMemo(
    () => [
      {
        label: "Full name",
        value: fullName || "Add your name",
        hint: fullName ? "" : "Not provided yet",
        editable: true,
      },
      {
        label: "Email address",
        value: user?.email || "Not provided",
        hint: "",
        editable: false,
      },
      {
        label: "Date of birth",
        value: dateOfBirth
          ? dateOfBirth.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "",
        hint: dateOfBirth ? "" : "Select your date of birth",
        editable: true,
      },
    ],
    [fullName, user?.email, dateOfBirth],
  );

  const faqItems = useMemo(
    () => [
      {
        question: "What do the lights on Neo 1 mean?",
        answer:
          "Neo 1's logo light indicates the device's state:\n\n**When not charging**\n\n- White Light → Active Mode\n- No Light → Sleep Mode\n\n**When charging**\n\n- Alternate White and Amber Light → Charging in Active Mode\n- Amber Light → Charging in Sleep Mode\n\nYou can also check the device status in the app.",
      },
      {
        question:
          "How does Neo 1 capture my conversations? Do I need to start or stop recording?",
        answer:
          "Neo 1 is always ON and ready to capture important moments. When in Active Mode (indicated by a white light), it listens and automatically generates transcripts and summaries whenever a conversation happens. You don't need to manually start or stop anything—Neo 1 detects natural pauses and creates a memory when the conversation ends.",
      },
      {
        question: "Why is my Neo 1 disconnecting frequently?",
        answer:
          "Neo 1 may disconnect if the app stops running in the background. To prevent this, enable the following settings:\n\n- iOS → Turn ON Notification permissions\n- Android → Turn ON Notifications & Location permissions, turn OFF Battery optimization and any other permission that stops app from running in the background\n\nIf the issue persists, contact us at support@neosapien.xyz.",
      },
      {
        question: "How do I turn OFF Neo 1?",
        answer:
          "Neo 1 can be sent to Sleep Mode by double-tapping on your Neo 1 below the logo. To activate it, simply double-tap again.",
      },
      {
        question: "Can I get the audio recording of a meeting?",
        answer:
          "No, Neo 1 does not store audio files after processing. However, you can access transcripts and summaries of your past conversations anytime from the app's Memories screen.",
      },
      {
        question: "I recorded a conversation by mistake. How do I delete it?",
        answer:
          "Neo 1 doesn't store audio files after processing, but you can delete the transcript and summary:\n\n1. Go to the Memories screen.\n2. Swipe the memory and tap Delete.\n\nThis will permanently remove all data related to that memory from our servers, and it cannot be restored.",
      },
      {
        question: "What are the subscription charges?",
        answer:
          "- Neo 1 currently has no subscription, with no monthly subscription or hidden fees.\n- You can access every existing feature and receive all updates at no cost.",
      },
      {
        question: "What is the warranty for Neo 1?",
        answer:
          "Neo 1 comes with a 1-year warranty. If you face any issues, email support@neosapien.xyz, and we'll arrange for your device to be shipped to our service center for free repair. If repair isn't possible, we'll replace it at no extra cost.",
      },
      {
        question: "Why do I need to record my voice?",
        answer:
          "Neo 1 personalizes insights by recognizing your voice in conversations. This helps it accurately identify what you say and provide tailored insights on your communication style.",
      },
      {
        question:
          "I was in a meeting. Why don't I see the transcript of everyone's voice?",
        answer:
          "Neo 1's microphone works most effectively within 1-2 meters range. If someone was farther than 2 meters, their voice may not have been captured. High background noise can also affect audio pickup, even with noise cancellation.",
      },
      {
        question: "Can I use Neo 1 without an internet connection?",
        answer:
          "No, Neo 1 requires an internet connection as it works via Bluetooth pairing with the mobile app. Your phone must be online for Neo 1 to function.",
      },
      {
        question: "I spilled water on Neo 1. What should I do?",
        answer:
          "Neo 1 is not water-resistant. If spilled on:\n\n1. Quickly dry it with a clean cloth.\n2. Do not charge immediately.\n3. Wait until it's completely dry before plugging it in.",
      },
    ],
    [],
  );

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      toast({
        title: "Unable to sign out",
        description: "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = () => {
    if (deletingAccount) return;
    if (!window.confirm("Delete your account and all associated data?")) {
      return;
    }
    setDeletingAccount(true);
    deleteAccount()
      .then(() => {
        toast({
          title: "Account deleted",
          description: "Your account has been removed.",
        });
        onClose();
      })
      .catch((error: any) => {
        toast({
          title: "Unable to delete account",
          description: error?.message || "Try again.",
          variant: "destructive",
        });
      })
      .finally(() => setDeletingAccount(false));
  };

  const handleSubmitBug = () => {
    if (!bugSummary.trim()) {
      toast({
        title: "Summary required",
        description: "Add a quick summary to help us route your report.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Thanks for the heads-up",
      description: "We logged your report and will reach out with updates.",
    });
    setBugSummary("");
    setBugDetails("");
  };

  const displayName = useMemo(() => {
    const trimmed = fullName.trim();
    if (trimmed) return trimmed;
    if (user?.displayName?.trim()) return user.displayName.trim();
    if (user?.email) return user.email.split("@")[0];
    return "Unnamed user";
  }, [fullName, user?.displayName, user?.email]);

  const userInitial =
    displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "U";

  const isDarkMode = theme === "dark";
  const isDesktopApp = Boolean(window.electronAPI);
  const deviceInfo = useMemo(() => {
    if (typeof navigator === "undefined") {
      return "Unknown device";
    }

    const platform =
      (navigator as any)?.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      "";
    const ua = (navigator.userAgent || "").toLowerCase();
    const normalizedPlatform = (platform || "").toLowerCase();
    const hint = `${normalizedPlatform} ${ua}`.trim();

    const isMobile =
      /iphone|ipad|android|mobile/.test(hint) ||
      Boolean((navigator as any)?.userAgentData?.mobile);

    const typeLabel = isMobile ? "Mobile" : "Desktop";

    let osLabel = "Unknown OS";
    if (hint.includes("mac") || hint.includes("os x")) {
      osLabel = "macOS";
    } else if (hint.includes("win")) {
      osLabel = "Windows";
    } else if (hint.includes("linux")) {
      osLabel = "Linux";
    } else if (hint.includes("ios")) {
      osLabel = "iOS";
    } else if (hint.includes("android")) {
      osLabel = "Android";
    }

    return `${osLabel} - ${typeLabel}`;
  }, []);

  if (!open) {
    return null;
  }

  const preferenceToggles = [
    {
      id: "appearance",
      label: "Appearance",
      description: isDarkMode
        ? "Night palette with deeper contrast."
        : "Day palette with bright surfaces.",
      value: isDarkMode,
      toggle: toggleTheme,
      disabled: themeLoading,
    },
    {
      id: "desktop-notifications",
      label: "Desktop notifications",
      description: "Get nudges when captures finish processing.",
      value: desktopNotificationsEnabled,
      toggle: () => setDesktopNotificationsEnabled((prev) => !prev),
    },
    {
      id: "auto-launch",
      label: "Launch at startup",
      description: "Open NeoSapien automatically when you sign in.",
      value: autoLaunchEnabled,
      toggle: handleToggleAutoLaunch,
      disabled: autoLaunchSaving || !isDesktopApp,
    },
  ];

  const renderToggle = (on: boolean, toggle: () => void, disabled = false) => (
    <button
      type="button"
      onClick={() => {
        if (!disabled) toggle();
      }}
      disabled={disabled}
      aria-pressed={on}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
        on ? "bg-[#0f8b54]" : "bg-border"
      } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-surface transition ${
          on ? "translate-x-5" : "translate-x-1"
        } ${disabled ? "opacity-90" : ""}`}
      />
    </button>
  );

  const voiceProfileSteps = [
    {
      title: "Ensure you're in a quiet place",
      description:
        "Recording in a quiet space ensures better voice recognition accuracy.",
    },
    {
      title: "Speak clearly, at your natural pace.",
      description: "Talk continuously for 30 seconds for better accuracy.",
    },
  ];

  const sections = [
    {
      id: "general",
      label: "General",
      icon: Settings2,
      content: (
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              Signed in as
            </p>
            <div className="mt-3 flex items-center gap-3">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || user.email || "Profile"}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0f8b54]/10 text-sm font-semibold text-[#0f8b54]">
                  {userInitial}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {displayName}
                </p>
                <p className="text-xs text-muted">{user?.email}</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted">
              Preferences
            </p>
            <div className="mt-3 space-y-3">
              {preferenceToggles.map((pref) => (
                <div
                  key={pref.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface px-4 py-3 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {pref.label}
                    </p>
                    <p className="text-xs text-muted">{pref.description}</p>
                  </div>
                  {renderToggle(pref.value, pref.toggle, pref.disabled)}
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "voiceProfile",
      label: "Voice Profile",
      icon: Mic,
      content: (
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface p-6 shadow-sm space-y-5">
            <div className="space-y-2 text-center">
              <p className="text-sm font-semibold text-[#0f8b54]">
                Setup Voice Profile
              </p>
              <p className="text-xs text-muted">
                Speech samples of your voice will be created to setup the
                profile.
              </p>
            </div>

            <div className="border-t border-dashed border-border/70" />

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#0f8b54] text-center">
                How to setup your profile?
              </p>
              <div className="space-y-3">
                {voiceProfileSteps.map((step) => (
                  <div
                    key={step.title}
                    className="flex gap-3 rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm px-4 py-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0f8b54]/10 text-[#0f8b54]">
                      <Mic className="h-4 w-4" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">
                        {step.title}
                      </p>
                      <p className="text-xs text-muted">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted text-center">
                This might take you 30-60 seconds to complete
              </p>
            </div>

            <button
              type="button"
              className="w-full rounded-full bg-[#0f8b54] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d6b42]"
            >
              Got it! Let's Start
            </button>
          </div>
        </div>
      ),
    },
    {
      id: "profile",
      label: "Personal Details",
      icon: UserRound,
      content: (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Manage your profile information. Some fields are synced from your
            account.
          </p>
          <div className="space-y-3">
            {profileDetails.map((detail) => (
              <div
                key={detail.label}
                className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface p-4 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted">
                    {detail.label}
                  </p>
                  {detail.editable && <Pencil className="h-3 w-3 text-muted" />}
                </div>
                {detail.editable ? (
                  detail.label === "Full name" ? (
                    <div className="relative mt-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          onBlur={handleSaveName}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          disabled={savingProfile || loadingProfile}
                          placeholder="Enter your full name"
                          className="flex-1 border-none bg-transparent text-base font-semibold text-foreground placeholder:text-muted focus:outline-none disabled:opacity-60"
                        />
                        {savingProfile && (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f8b54] border-t-transparent" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="relative mt-2">
                      <input
                        type="date"
                        value={
                          dateOfBirth
                            ? `${dateOfBirth.getFullYear().toString().padStart(4, "0")}-${(
                                dateOfBirth.getMonth() + 1
                              )
                                .toString()
                                .padStart(2, "0")}-${dateOfBirth
                                .getDate()
                                .toString()
                                .padStart(2, "0")}`
                            : ""
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) {
                            setDateOfBirth(null);
                            return;
                          }
                          const picked = new Date(value);
                          if (!Number.isNaN(picked.getTime())) {
                            handleSaveDateOfBirth(picked);
                          }
                        }}
                        disabled={savingProfile || loadingProfile}
                        max={new Date().toISOString().split("T")[0]}
                        className="w-full rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface px-3 py-2 text-base font-semibold text-foreground placeholder:text-muted focus:outline-none focus:border-[#0f8b54] focus:ring-1 focus:ring-[#0f8b54]/20 disabled:opacity-60 shadow-sm"
                        placeholder="Select date of birth"
                      />
                    </div>
                  )
                ) : (
                  <p className="mt-2 text-base font-semibold text-foreground">
                    {detail.value}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">{detail.hint}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "devices",
      label: "Device Details",
      icon: MonitorSmartphone,
      content: (
        <div className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {deviceInfo}
              </p>
              <p className="text-xs text-muted">
                Last active{" "}
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-muted">
              Primary
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "dictionary",
      label: "Custom Dictionary",
      icon: Sparkles,
      content: (
        <div className="space-y-4">
          {dictionaryError ? (
            <div className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm p-8 text-center space-y-4">
              <p className="text-sm font-semibold text-foreground">
                Failed to load dictionary
              </p>
              <p className="text-xs text-muted">{dictionaryError}</p>
              <button
                type="button"
                onClick={loadDictionaryWords}
                className="rounded-lg bg-[#0f8b54] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#0d6b42]"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {isAddingWord && (
                <div className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm p-4 space-y-3">
                  <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAddWord();
                      } else if (e.key === "Escape") {
                        setIsAddingWord(false);
                        setNewWord("");
                      }
                    }}
                    autoFocus
                    placeholder="Enter word or phrase"
                    maxLength={50}
                    className="w-full border-none bg-transparent text-sm font-semibold text-foreground placeholder:text-muted focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingWord(false);
                        setNewWord("");
                      }}
                      className="flex-1 rounded-lg border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface/80"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddWord}
                      disabled={!newWord.trim() || addingWord}
                      className="flex-1 rounded-lg bg-[#0f8b54] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d6b42] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {addingWord ? "Adding..." : "Add"}
                    </button>
                  </div>
                </div>
              )}

              <div
                className={`space-y-0 ${isAddingWord ? "opacity-30 pointer-events-none" : ""}`}
              >
                {dictionaryWords.length > 0 ? (
                  <div className="space-y-0">
                    {dictionaryWords.map((word, index) => (
                      <div key={word.id}>
                        <div className="flex items-center justify-between rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm px-4 py-3">
                          <span className="flex-1 text-sm font-semibold text-foreground">
                            {word.corrected_phrase}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveWordClick(word)}
                            disabled={deletingWordId === word.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-danger transition hover:bg-danger/10 disabled:opacity-60"
                          >
                            {deletingWordId === word.id ? (
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-danger border-t-transparent" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {index < dictionaryWords.length - 1 && (
                          <div className="h-px bg-border/70 my-1" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-surface/95 p-6 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      No custom words yet
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Add brand names, acronyms, or people names to improve
                      transcription accuracy.
                    </p>
                  </div>
                )}
              </div>

              {!isAddingWord && (
                <button
                  type="button"
                  onClick={() => setIsAddingWord(true)}
                  className="w-full rounded-full bg-[#0f8b54] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0d6b42] flex items-center justify-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Word
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
    {
      id: "faq",
      label: "FAQ's",
      icon: HelpCircle,
      content: (
        <div className="space-y-2">
          {faqItems.map((item) => (
            <details
              key={item.question}
              className="group rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm px-4 py-3 text-sm text-foreground"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold list-none">
                <span className="flex-1">{item.question}</span>
                <ChevronDown className="h-4 w-4 text-muted transition-transform duration-200 group-open:rotate-180 flex-shrink-0" />
              </summary>
              <div className="mt-3 text-xs text-muted">
                <MarkdownText content={item.answer} />
              </div>
            </details>
          ))}
        </div>
      ),
    },
    {
      id: "privacy",
      label: "Privacy Policy",
      icon: ShieldCheck,
      content: (
        <div className="space-y-3 text-sm text-foreground leading-relaxed">
          {PRIVACY_POLICY_LIST.map((entry, index) => (
            <div
              key={index}
              className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface p-4 shadow-sm"
            >
              <MarkdownText content={entry} />
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "terms",
      label: "Terms & Conditions",
      icon: ScrollText,
      content: (
        <div className="space-y-3 text-sm text-foreground leading-relaxed">
          {TERMS_AND_CONDITIONS_LIST.map((entry, index) => (
            <div
              key={index}
              className="rounded-2xl border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-sm p-4"
            >
              <MarkdownText content={entry} />
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "bugs",
      label: "Report a Bug",
      icon: Bug,
      onClick: () => {
        window.location.href = "mailto:support@neosapien.xyz";
      },
      content: (
        <div className="space-y-2 text-sm text-muted">
          <p>Opening your email client...</p>
        </div>
      ),
    },
  ];

  const activeSectionData = sections.find(
    (section) => section.id === activeSection,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-[24px] border border-[#d0d0d0] dark:border-[#404040] bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-foreground"
          aria-label="Close settings"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex h-[560px] overflow-hidden rounded-[24px]">
          <aside className="flex w-52 flex-col border-r border-border/60 bg-gradient-to-b from-surface via-background to-surface/60">
            <div className="px-4 pt-4 pb-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted">
                Settings
              </p>
            </div>

            <nav className="flex-1 min-h-0 space-y-0.5 overflow-y-auto px-4 py-2 text-sm">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = section.id === activeSection;
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => {
                      if (section.onClick) {
                        section.onClick();
                        return;
                      }
                      setActiveSection(section.id);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition group ${
                      isActive
                        ? "bg-slate-100/80 text-foreground shadow-sm dark:bg-[#1f1f1f]"
                        : "text-muted hover:bg-slate-100/80 dark:hover:bg-[#1f1f1f]"
                    }`}
                  >
                    <span
                      className={`rounded-md px-1.5 py-1 transition ${
                        isActive
                          ? "bg-slate-200/60 text-foreground dark:bg-[#2a2a2a]"
                          : "text-muted group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-xs font-semibold truncate transition ${
                          isActive
                            ? "text-foreground"
                            : "text-foreground/70 group-hover:text-foreground"
                        }`}
                      >
                        {section.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-border/60 px-4 py-2 space-y-0.5">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition group text-foreground/70 hover:bg-slate-100/80 dark:hover:bg-[#1f1f1f]"
              >
                <span className="rounded-md px-1.5 py-1 text-muted transition group-hover:text-foreground">
                  <LogOut className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold truncate transition group-hover:text-foreground">
                    Logout
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition group text-danger hover:bg-danger/10 disabled:opacity-60"
                disabled={deletingAccount}
              >
                <span className="rounded-md px-1.5 py-1 text-danger/70 transition group-hover:text-danger">
                  <X className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-danger truncate transition group-hover:text-danger">
                    {deletingAccount ? "Deleting..." : "Delete account"}
                  </span>
                </span>
              </button>
            </div>
          </aside>

          <section
            ref={contentRef}
            className="flex-1 overflow-y-auto bg-surface px-6 py-5"
          >
            {activeSectionData && (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                      {activeSectionData.label}
                    </p>
                  </div>
                </div>
                <div>{activeSectionData.content}</div>
              </div>
            )}
          </section>
        </div>
      </div>

      <ConfirmationModal
        open={showDeleteConfirm}
        onClose={() => {
          if (!deletingWordId) {
            setShowDeleteConfirm(false);
            setWordToDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Delete this word?"
        description={`Are you sure you want to delete "${wordToDelete?.corrected_phrase}" from your custom dictionary?`}
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={deletingWordId !== null}
      />
    </div>
  );
}
