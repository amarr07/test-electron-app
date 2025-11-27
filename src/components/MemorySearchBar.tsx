import {
  getMemorySearchAutosuggestions,
  MemoryRecord,
  searchMemories,
} from "@/api/memories";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface MemorySearchBarProps {
  onSearch: (query: string, results: MemoryRecord[]) => void;
  onClear: () => void;
  submittedQuery: string;
}

/**
 * Custom search bar for Memories screen with autocomplete suggestions.
 * Features: debounced autocomplete, suggestion acceptance via Tab/ArrowRight,
 * dynamic positioning of suggestion text, and search execution.
 */
export function MemorySearchBar({
  onSearch,
  onClear,
  submittedQuery,
}: MemorySearchBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [autocompleteSuggestion, setAutocompleteSuggestion] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isSearchingState, setIsSearchingState] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRequestIdRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousTextRef = useRef("");
  const lastTextLengthRef = useRef(0);
  const isActive = isFocused || submittedQuery.length > 0 || isSearchingState;

  /**
   * Fetches autocomplete suggestions and finds best match.
   * Uses request ID to ignore stale responses.
   */
  const generateAutocompleteSuggestion = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 3) {
        setAutocompleteSuggestion("");
        return;
      }

      const requestId = ++autocompleteRequestIdRef.current;
      const queryAtRequestTime = trimmedQuery;

      try {
        const suggestions =
          await getMemorySearchAutosuggestions(queryAtRequestTime);

        if (requestId !== autocompleteRequestIdRef.current) {
          return;
        }

        const currentText = inputRef.current?.value || searchQuery;
        const currentTextTrimmed = currentText.trim();

        if (
          currentTextTrimmed.length === 0 ||
          currentTextTrimmed.length < queryAtRequestTime.length
        ) {
          setAutocompleteSuggestion("");
          return;
        }

        const currentLower = currentTextTrimmed.toLowerCase();
        const queryLower = queryAtRequestTime.toLowerCase();

        if (!currentLower.startsWith(queryLower)) {
          setAutocompleteSuggestion("");
          return;
        }

        if (suggestions.length > 0) {
          let bestMatch: string | null = null;

          for (const suggestion of suggestions) {
            const suggestionLower = suggestion.toLowerCase();

            if (
              suggestionLower.startsWith(currentLower) &&
              suggestion.length > currentTextTrimmed.length
            ) {
              const remainingText = suggestion.substring(
                currentTextTrimmed.length,
              );
              if (remainingText.length > 0) {
                bestMatch = remainingText;
                break;
              }
            }
          }

          if (bestMatch) {
            setAutocompleteSuggestion(bestMatch);
          } else {
            setAutocompleteSuggestion("");
          }
        } else {
          setAutocompleteSuggestion("");
        }
      } catch (error) {
        if (requestId === autocompleteRequestIdRef.current) {
          setAutocompleteSuggestion("");
        }
      }
    },
    [searchQuery],
  );

  /**
   * Handles input changes with autocomplete integration.
   * Manages deletion (clears suggestion), insertion (updates suggestion),
   * and debounced autocomplete fetching.
   */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const previousLength = lastTextLengthRef.current;
      const isDeletion = value.length < previousLength;
      const isInsertion = value.length > previousLength;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (isDeletion && autocompleteSuggestion.length > 0) {
        setAutocompleteSuggestion("");
      }

      if (isInsertion && autocompleteSuggestion.length > 0) {
        const insertedText = value.substring(previousLength);
        if (insertedText.length > 0) {
          const suggestionLower = autocompleteSuggestion.toLowerCase();
          const insertedLower = insertedText.toLowerCase();
          if (
            suggestionLower.startsWith(insertedLower) &&
            autocompleteSuggestion.length >= insertedText.length
          ) {
            const remainingSuggestion = autocompleteSuggestion.substring(
              insertedText.length,
            );
            if (remainingSuggestion.length === 0) {
              setAutocompleteSuggestion("");
            } else {
              setAutocompleteSuggestion(remainingSuggestion);
            }
          } else {
            setAutocompleteSuggestion("");
          }
        }
      }

      setSearchQuery(value);
      previousTextRef.current = value;
      lastTextLengthRef.current = value.length;

      if (value.trim().length >= 3) {
        debounceTimerRef.current = setTimeout(() => {
          generateAutocompleteSuggestion(value);
        }, 150);
      } else {
        setAutocompleteSuggestion("");
      }
    },
    [autocompleteSuggestion, generateAutocompleteSuggestion],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery.length < 2) {
        return;
      }

      setIsSearchingState(true);
      setAutocompleteSuggestion("");

      try {
        const results = await searchMemories(trimmedQuery);
        onSearch(trimmedQuery, results);
      } catch (error) {
        console.error("Search failed:", error);
        onSearch(trimmedQuery, []);
      } finally {
        setIsSearchingState(false);
      }
    },
    [onSearch],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (autocompleteSuggestion.length > 0) {
        const newText = searchQuery + autocompleteSuggestion;
        setSearchQuery(newText);
        previousTextRef.current = newText;
        lastTextLengthRef.current = newText.length;
        setAutocompleteSuggestion("");
        setTimeout(() => {
          handleSearch(newText);
        }, 50);
      } else {
        handleSearch(searchQuery);
      }
      inputRef.current?.blur();
    },
    [searchQuery, autocompleteSuggestion, handleSearch],
  );

  const handleClear = useCallback(() => {
    setSearchQuery("");
    setAutocompleteSuggestion("");
    previousTextRef.current = "";
    lastTextLengthRef.current = 0;
    setIsSearchingState(false);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    inputRef.current?.blur();
    onClear();
  }, [onClear]);

  /**
   * Accepts autocomplete suggestion by appending to search query.
   */
  const acceptAutocomplete = useCallback(() => {
    if (autocompleteSuggestion.length > 0) {
      const newText = searchQuery + autocompleteSuggestion;
      setSearchQuery(newText);
      previousTextRef.current = newText;
      lastTextLengthRef.current = newText.length;
      setAutocompleteSuggestion("");
      if (inputRef.current) {
        inputRef.current.value = newText;
        inputRef.current.setSelectionRange(newText.length, newText.length);
      }
    }
  }, [searchQuery, autocompleteSuggestion]);

  const handleInputClick = useCallback(() => {
    acceptAutocomplete();
  }, [acceptAutocomplete]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        (e.key === "ArrowRight" || e.key === "Tab") &&
        autocompleteSuggestion.length > 0
      ) {
        e.preventDefault();
        acceptAutocomplete();
        if (e.key === "Tab") {
          setTimeout(() => {
            inputRef.current?.blur();
          }, 0);
        }
      }
    },
    [autocompleteSuggestion, acceptAutocomplete],
  );

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const [inputWidth, setInputWidth] = useState(0);
  const measureRef = useRef<HTMLSpanElement>(null);

  /**
   * Measures typed text width using hidden span to position autocomplete suggestion.
   */
  useEffect(() => {
    if (measureRef.current && inputRef.current) {
      const measure = measureRef.current;
      const inputStyle = window.getComputedStyle(inputRef.current);
      measure.style.font = inputStyle.font;
      measure.style.fontSize = inputStyle.fontSize;
      measure.style.fontFamily = inputStyle.fontFamily;
      measure.style.fontWeight = inputStyle.fontWeight;
      measure.style.letterSpacing = inputStyle.letterSpacing;
      measure.textContent = searchQuery;
      setInputWidth(measure.offsetWidth);
    }
  }, [searchQuery]);

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={handleInputChange}
            onClick={handleInputClick}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`w-full bg-surface border border-[#d0d0d0] dark:border-[#404040] rounded-full pl-9 py-2 text-xs text-foreground placeholder-muted/60 focus:outline-none focus:border-[#0f8b54] focus:shadow-[0_0_0_1px_rgba(15,139,84,0.35)] focus:bg-surface transition-colors duration-150 shadow-sm ${
              isActive ? "pr-9" : "pr-4"
            }`}
          />
          {isActive && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleClear();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center text-muted hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span
            ref={measureRef}
            className="absolute invisible whitespace-pre text-xs"
            style={{
              visibility: "hidden",
              position: "absolute",
              top: "-9999px",
              left: "-9999px",
            }}
          />
          {autocompleteSuggestion.length > 0 && searchQuery.length > 0 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-xs text-muted/60"
              style={{
                left: `${36 + inputWidth}px`,
              }}
            >
              {autocompleteSuggestion}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
