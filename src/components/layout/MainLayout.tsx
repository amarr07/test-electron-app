import { MemoryRecord } from "@/api/memories";
import { MemorySearchBar } from "@/components/MemorySearchBar";
import { RecordingDock } from "@/components/RecordingDock";
import { SettingsModal } from "@/components/SettingsModal";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { useRecorder } from "@/hooks/useRecorder";
import { useTimer } from "@/hooks/useTimer";
import { AskNeoSection } from "@/pages/AskNeo";
import { HomeSection } from "@/pages/Home";
import { MemoriesView } from "@/pages/Memories";
import { RemindersSection } from "@/pages/Reminders";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Main application layout orchestrator.
 * Manages: section navigation, recording state, auto-refresh, search state,
 * and coordinates between Sidebar, TopBar, and content sections.
 */
export function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [memoriesRefreshCounter, setMemoriesRefreshCounter] = useState(0);
  const [remindersRefreshCounter, setRemindersRefreshCounter] = useState(0);
  const [isHomeRefreshing, setIsHomeRefreshing] = useState(false);
  const [isMemoriesRefreshing, setIsMemoriesRefreshing] = useState(false);
  const [isRemindersRefreshing, setIsRemindersRefreshing] = useState(false);
  const [dockMessage, setDockMessage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryToOpen, setMemoryToOpen] = useState<string | null>(null);
  const clearMessageTimeout = useRef<NodeJS.Timeout | null>(null);
  const {
    status: recorderStatus,
    start: startRecording,
    pause: pauseRecording,
    resume: resumeRecording,
    stop: stopRecording,
  } = useRecorder();
  const { elapsed: dockElapsed, reset: resetDockTimer } = useTimer(
    recorderStatus === "recording",
  );

  useEffect(() => {
    if (recorderStatus === "idle") {
      resetDockTimer();
    }
  }, [recorderStatus, resetDockTimer]);

  const handleHomeLoadingChange = useCallback((loading: boolean) => {
    setIsHomeRefreshing(loading);
  }, []);

  const handleMemoriesLoadingChange = useCallback((loading: boolean) => {
    setIsMemoriesRefreshing(loading);
  }, []);

  const handleRemindersLoadingChange = useCallback((loading: boolean) => {
    setIsRemindersRefreshing(loading);
  }, []);

  useEffect(() => {
    return () => {
      if (clearMessageTimeout.current) {
        clearTimeout(clearMessageTimeout.current);
      }
    };
  }, []);

  const showDockMessage = useCallback((message: string) => {
    setDockMessage(message);
    if (clearMessageTimeout.current) {
      clearTimeout(clearMessageTimeout.current);
    }
    clearMessageTimeout.current = setTimeout(() => {
      setDockMessage(null);
    }, 3000);
  }, []);

  const handleStart = useCallback(async () => {
    setDockMessage(null);
    await startRecording();
  }, [startRecording]);

  const handlePause = useCallback(async () => {
    setDockMessage(null);
    await pauseRecording();
  }, [pauseRecording]);

  const handleResume = useCallback(async () => {
    setDockMessage(null);
    await resumeRecording();
  }, [resumeRecording]);

  const handleStop = useCallback(async () => {
    await stopRecording();
    resetDockTimer();
    showDockMessage("Saved to your memories!");
  }, [resetDockTimer, showDockMessage, stopRecording]);

  /**
   * Triggers refresh of a specific section by incrementing refresh counter.
   */
  const triggerSectionRefresh = useCallback(
    (section: "home" | "memories" | "reminders") => {
      if (section === "home") {
        setIsHomeRefreshing(true);
        setRefreshCounter((prev) => prev + 1);
      } else if (section === "memories") {
        setIsMemoriesRefreshing(true);
        setMemoriesRefreshCounter((prev) => prev + 1);
      } else if (section === "reminders") {
        setIsRemindersRefreshing(true);
        setRemindersRefreshCounter((prev) => prev + 1);
      }
    },
    [],
  );

  /**
   * Auto-refreshes active section every 60s when tab is visible and online.
   * Also refreshes on window focus and visibility change.
   */
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL_MS = 60_000;
    const refreshIfNeeded = () => {
      if (document.hidden || !navigator.onLine) return;
      if (activeSection === "home" && !isHomeRefreshing) {
        triggerSectionRefresh("home");
      } else if (activeSection === "memories" && !isMemoriesRefreshing) {
        triggerSectionRefresh("memories");
      } else if (activeSection === "reminders" && !isRemindersRefreshing) {
        triggerSectionRefresh("reminders");
      }
    };

    const intervalId = setInterval(refreshIfNeeded, AUTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfNeeded);
    document.addEventListener("visibilitychange", refreshIfNeeded);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", refreshIfNeeded);
      document.removeEventListener("visibilitychange", refreshIfNeeded);
    };
  }, [
    activeSection,
    triggerSectionRefresh,
    isHomeRefreshing,
    isMemoriesRefreshing,
    isRemindersRefreshing,
  ]);

  const [isMemoryDetailOpen, setIsMemoryDetailOpen] = useState(false);
  const memoryDetailCloseRef = useRef<(() => void) | null>(null);
  const [memoriesSearchResults, setMemoriesSearchResults] = useState<
    MemoryRecord[]
  >([]);
  const [memoriesSubmittedQuery, setMemoriesSubmittedQuery] = useState("");

  const handleBack = useCallback(() => {
    if (isMemoryDetailOpen && memoryDetailCloseRef.current) {
      memoryDetailCloseRef.current();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    setActiveSection("home");
  }, [isMemoryDetailOpen]);

  const compactSections = new Set(["home", "memories", "reminders", "ask-neo"]);

  const handleTopSearchMemorySelect = useCallback((memoryId: string) => {
    setMemoryToOpen(memoryId);
    setActiveSection("memories");
  }, []);

  const handleTopSearchReminderSelect = useCallback(() => {
    setActiveSection("reminders");
  }, []);

  const [sessionToOpen, setSessionToOpen] = useState<string | null>(null);

  const handleTopSearchSessionSelect = useCallback((sessionId: string) => {
    setSessionToOpen(sessionId);
    setActiveSection("ask-neo");
  }, []);

  return (
    <>
      <div className="h-full w-full flex bg-background overflow-hidden">
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <TopBar
            onSearch={() => {}}
            onBack={
              isMemoryDetailOpen || activeSection !== "home"
                ? handleBack
                : undefined
            }
            hideSearch={activeSection === "memories"}
            customSearchBar={
              activeSection === "memories" ? (
                <MemorySearchBar
                  onSearch={(query, results) => {
                    setMemoriesSubmittedQuery(query);
                    setMemoriesSearchResults(results);
                  }}
                  onClear={() => {
                    setMemoriesSubmittedQuery("");
                    setMemoriesSearchResults([]);
                  }}
                  submittedQuery={memoriesSubmittedQuery}
                />
              ) : undefined
            }
            onSelectMemory={handleTopSearchMemorySelect}
            onSelectReminder={handleTopSearchReminderSelect}
            onSelectSession={handleTopSearchSessionSelect}
          />

          <div className="flex-1 flex flex-col bg-background min-h-0">
            <div className="flex-1 overflow-y-auto min-h-0">
              <div
                className={`w-full px-8 pb-1 h-full ${
                  compactSections.has(activeSection) ? "pt-2" : "pt-8"
                }`}
              >
                {activeSection === "home" && (
                  <HomeSection
                    searchQuery=""
                    refreshToken={refreshCounter}
                    onLoadingChange={handleHomeLoadingChange}
                    recorderStatus={recorderStatus}
                  />
                )}
                <div
                  className={
                    activeSection === "ask-neo"
                      ? "block h-full"
                      : "hidden h-0 overflow-hidden"
                  }
                >
                  <AskNeoSection
                    onOpenMemory={(memoryId) => {
                      setMemoryToOpen(memoryId);
                      setActiveSection("memories");
                    }}
                    sessionToOpen={sessionToOpen}
                    onSessionOpened={() => setSessionToOpen(null)}
                  />
                </div>
                {activeSection === "memories" && (
                  <MemoriesView
                    searchQuery={memoriesSubmittedQuery}
                    searchResults={memoriesSearchResults}
                    refreshToken={memoriesRefreshCounter}
                    onLoadingChange={handleMemoriesLoadingChange}
                    onMemoryDetailChange={(
                      isOpen: boolean,
                      onClose: () => void,
                    ) => {
                      setIsMemoryDetailOpen(isOpen);
                      memoryDetailCloseRef.current = onClose;
                    }}
                    memoryToOpen={memoryToOpen}
                    onMemoryOpened={() => setMemoryToOpen(null)}
                  />
                )}
                {activeSection === "reminders" && (
                  <RemindersSection
                    refreshToken={remindersRefreshCounter}
                    onLoadingChange={handleRemindersLoadingChange}
                  />
                )}
              </div>
            </div>

            {activeSection === "home" && (
              <RecordingDock
                status={recorderStatus}
                elapsed={dockElapsed}
                message={dockMessage ?? undefined}
                onStart={handleStart}
                onPause={handlePause}
                onResume={handleResume}
                onStop={handleStop}
              />
            )}
          </div>
        </div>
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}
