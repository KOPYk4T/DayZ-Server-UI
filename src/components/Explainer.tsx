import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Collapsible "How X works" panel used by every editor page. Default
 * is **collapsed** — opens on click, and the open/closed state is
 * persisted per page in localStorage so reopening the app lands on
 * the user's most recent choice.
 *
 * Visually distinct from the page surface so it reads as a secondary
 * explainer rather than primary content: dark-3 panel colour +
 * dashed bottom border.
 */

interface Props {
  /** Bold lead — e.g. "How globals.xml works". */
  title: string;
  /** Inline description rendered next to the title (same row). */
  subtitle?: React.ReactNode;
  /** Unique key for the open/closed state — stored in localStorage. */
  storageKey: string;
  /** Collapsed panel body. */
  children: React.ReactNode;
}

export function Explainer({ title, subtitle, storageKey, children }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Opt-in: only open when the user explicitly expanded it before.
    return window.localStorage.getItem(storageKey) === "true";
  });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, String(next));
    } catch {
      // ignore localStorage write failures
    }
  };
  // Slightly recessed — darker than the page canvas so it reads as
  // an inset "manual" strip rather than a lifted surface. Dashed
  // bottom border keeps the brandbook's section-divider feel.
  return (
    <div className="border-b-dashed bg-muted/40">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-6 py-2 text-left text-xs transition-colors hover:bg-muted/70"
      >
        <BookOpen className="h-3.5 w-3.5 text-brand-rust" />
        <span className="font-medium text-foreground">{title}</span>
        {subtitle ? (
          <span className="text-muted-foreground">— {subtitle}</span>
        ) : null}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-2 px-6 pb-4 pt-1 text-xs leading-relaxed text-muted-foreground">
          {children}
        </div>
      ) : null}
    </div>
  );
}
