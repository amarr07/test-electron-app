import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface MarkdownTextProps {
  content?: string;
  className?: string;
}

/**
 * Renders markdown text with support for headings, lists, bold, and italic.
 * Parses markdown syntax and converts to React elements.
 */
export function MarkdownText({ content = "", className }: MarkdownTextProps) {
  const nodes = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className={cn("space-y-3 text-muted text-sm", className)}>{nodes}</div>
  );
}

/**
 * Parses markdown text into React elements.
 * Handles headings (#, ##, ###), lists (-, *), and inline formatting (**bold**, *italic*).
 */
function parseMarkdown(text: string) {
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listBuffer: React.ReactNode[] = [];
  let listKey = 0;

  /**
   * Flushes accumulated list items into a <ul> element.
   */
  const flushList = () => {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${listKey++}`} className="list-disc pl-5 space-y-1">
          {listBuffer}
        </ul>,
      );
      listBuffer = [];
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    if (/^[-*] /.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*]\s+/, "");
      listBuffer.push(
        <li key={`li-${idx}`} className="text-sm text-muted">
          {formatInline(itemText, idx)}
        </li>,
      );
      return;
    }

    flushList();

    if (/^### /.test(trimmed)) {
      blocks.push(
        <h3 key={`h3-${idx}`} className="text-sm font-semibold text-foreground">
          {formatInline(trimmed.replace(/^###\s+/, ""), idx)}
        </h3>,
      );
      return;
    }

    if (/^## /.test(trimmed)) {
      blocks.push(
        <h2
          key={`h2-${idx}`}
          className="text-base font-semibold text-foreground"
        >
          {formatInline(trimmed.replace(/^##\s+/, ""), idx)}
        </h2>,
      );
      return;
    }

    if (/^# /.test(trimmed)) {
      blocks.push(
        <h1 key={`h1-${idx}`} className="text-lg font-semibold text-foreground">
          {formatInline(trimmed.replace(/^#\s+/, ""), idx)}
        </h1>,
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="leading-relaxed">
        {formatInline(trimmed, idx)}
      </p>,
    );
  });

  flushList();

  return blocks;
}

/**
 * Formats inline markdown (bold **text**, italic *text*) within text blocks.
 */
function formatInline(text: string, key: number) {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return segments.map((segment, idx) => {
    if (segment.startsWith("**") && segment.endsWith("**")) {
      return (
        <strong key={`b-${key}-${idx}`} className="text-foreground">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    if (segment.startsWith("*") && segment.endsWith("*")) {
      return (
        <em key={`i-${key}-${idx}`} className="text-muted">
          {segment.slice(1, -1)}
        </em>
      );
    }
    return <span key={`t-${key}-${idx}`}>{segment}</span>;
  });
}
