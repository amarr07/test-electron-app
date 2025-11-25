import { CalendarEvents } from "@/components/CalendarEvents";
import type { RecordingState } from "@/hooks/useRecorder";

interface HomeSectionProps {
  searchQuery: string;
  refreshToken: number;
  onLoadingChange: (loading: boolean) => void;
  recorderStatus: RecordingState;
}

/**
 * Home section component displaying calendar events.
 * Wraps CalendarEvents component with search and refresh capabilities.
 */
export function HomeSection({
  searchQuery,
  refreshToken,
  onLoadingChange,
  recorderStatus,
}: HomeSectionProps) {
  return (
    <div className="flex h-full w-full flex-col pt-0 pb-4">
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col min-h-0">
        <div className="flex-1 min-h-0">
          <CalendarEvents
            searchQuery={searchQuery}
            externalRefreshToken={refreshToken}
            onLoadingChange={onLoadingChange}
            recorderStatus={recorderStatus}
          />
        </div>
      </div>
    </div>
  );
}
