import React from "react";

interface HighlightMatch {
  start: number;
  end: number;
}

/**
 * Finds all word matches in text, expanding to word boundaries and merging overlaps.
 * Returns sorted, non-overlapping match ranges.
 */
function findMatches(text: string, query: string): HighlightMatch[] {
  const lower = text.toLowerCase();
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);

  if (queryWords.length === 0) {
    return [];
  }

  const matches: HighlightMatch[] = [];

  for (const word of queryWords) {
    let searchStart = 0;
    while (true) {
      const index = lower.indexOf(word, searchStart);
      if (index < 0) break;

      const expandedStart = expandMatchStart(text, index);
      const expandedEnd = expandMatchEnd(text, index + word.length);
      matches.push({ start: expandedStart, end: expandedEnd });
      searchStart = index + 1;
    }
  }

  matches.sort((a, b) => a.start - b.start);
  const mergedMatches: HighlightMatch[] = [];
  for (const match of matches) {
    if (mergedMatches.length === 0) {
      mergedMatches.push(match);
    } else {
      const last = mergedMatches[mergedMatches.length - 1];
      if (match.start <= last.end) {
        mergedMatches[mergedMatches.length - 1] = {
          start: last.start,
          end: Math.max(last.end, match.end),
        };
      } else {
        const gapText = text.substring(last.end, match.start);
        if (gapText.trim().length === 0) {
          mergedMatches[mergedMatches.length - 1] = {
            start: last.start,
            end: match.end,
          };
        } else {
          mergedMatches.push(match);
        }
      }
    }
  }

  return mergedMatches;
}

function isWordCharacter(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

/**
 * Expands match start to word boundary (beginning of word).
 */
function expandMatchStart(text: string, start: number): number {
  let newStart = start;
  while (newStart > 0 && isWordCharacter(text[newStart - 1])) {
    newStart--;
  }
  return newStart;
}

/**
 * Expands match end to word boundary (end of word).
 */
function expandMatchEnd(text: string, end: number): number {
  let newEnd = end;
  while (newEnd < text.length && isWordCharacter(text[newEnd])) {
    newEnd++;
  }
  return newEnd;
}

/**
 * Highlights matching words in text based on query.
 * Returns React element with highlighted spans styled with purple background.
 */
export function highlightText(
  text: string,
  query: string,
  className?: string,
): React.ReactElement {
  if (!query || query.trim().length === 0) {
    return <span className={className}>{text}</span>;
  }

  const matches = findMatches(text, query);
  if (matches.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let currentPos = 0;

  for (const match of matches) {
    if (match.start > currentPos) {
      parts.push(
        <span key={`text-${currentPos}`} className={className}>
          {text.substring(currentPos, match.start)}
        </span>,
      );
    }

    const matchText = text.substring(match.start, match.end);
    parts.push(
      <span
        key={`highlight-${match.start}`}
        className="inline-block px-1 py-0.5 rounded bg-[#5F4396] text-white font-normal"
      >
        {matchText}
      </span>,
    );

    currentPos = match.end;
  }

  if (currentPos < text.length) {
    parts.push(
      <span key={`text-${currentPos}`} className={className}>
        {text.substring(currentPos)}
      </span>,
    );
  }

  return <span>{parts}</span>;
}
