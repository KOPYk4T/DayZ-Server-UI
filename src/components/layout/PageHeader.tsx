import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared page header. Every top-level page in the app uses this so
 * the top strip reads the same regardless of which editor is open:
 *
 *   [Icon] [Title] [Badges] [Path] ────────── [Right actions]
 *
 * Slots:
 *   - `icon`     — leading lucide icon (required)
 *   - `title`    — page name (required)
 *   - `badges`   — small pill-style status markers (unsaved, mode,
 *                  validation, etc.). Rendered inline after the title.
 *   - `path`     — monospace relative-path hint. On by default when
 *                  the page edits a single on-disk file. Hides on
 *                  narrow widths.
 *   - `description` — one-sentence blurb rendered below the title.
 *   - `actions`  — right-aligned action buttons (Save, Revert,
 *                  Refresh, etc.).
 *
 * Keep the page-level container using `flex h-full min-h-0 flex-col`
 * so the header sits on top and the body scrolls below it. The
 * `bodyPadding` prop toggles whether the header adds bottom padding
 * on narrow pages (default true).
 */

export interface PageHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  badges?: ReactNode;
  path?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  badges,
  path,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        // `bg-card` is a hair lighter than the body, so the strip reads
        // as its own horizontal band. Added drop shadow + visible border
        // both signal "this is sticky" vs the scrolling body below.
        "relative z-10 flex flex-wrap items-start justify-between gap-3",
        "border-b border-border bg-card px-6 py-3 shadow-sticky",
        className,
      )}
    >
      {/* Thin rust accent bar on the left edge — the brandbook's
          section-header cue. Pure decoration but it anchors the strip. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-brand-rust/80"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Icon className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="font-display truncate text-xl font-semibold tracking-[0.04em] text-foreground">
            {title}
          </h1>
          {badges ? (
            <div className="flex items-center gap-1">{badges}</div>
          ) : null}
          {path ? (
            <code
              className="hidden max-w-[28rem] truncate font-mono text-[10px] text-brand-olive-mid md:inline"
              title={path}
            >
              {path}
            </code>
          ) : null}
        </div>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
