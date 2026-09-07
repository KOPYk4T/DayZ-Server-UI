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
        "relative z-10 flex flex-wrap items-start justify-between gap-4",
        "border-b border-border bg-card px-6 py-5 shadow-sticky",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="type-page truncate">{title}</h1>
          {badges ? (
            <div className="flex items-center gap-1">{badges}</div>
          ) : null}
          {path ? (
            <code className="type-mono hidden max-w-[28rem] truncate md:inline" title={path}>
              {path}
            </code>
          ) : null}
        </div>
        {description ? (
          <p className="type-hint mt-2 max-w-[65ch]">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
