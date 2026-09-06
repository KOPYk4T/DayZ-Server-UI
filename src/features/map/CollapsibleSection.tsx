import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface CollapsibleSectionProps {
  icon: ReactNode;
  title: string;
  /** Optional right-side content (layer visibility toggle, badges…)
   *  that sits alongside the title but does NOT participate in the
   *  collapse click. Wrap interactive elements with
   *  `stopPropagation` when they sit inside this slot. */
  rightSlot?: ReactNode;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  children: ReactNode;
}

/** Sidebar section with a collapse chevron on the left of its title.
 *  Clicking the title row toggles collapse; the `rightSlot` is
 *  reserved for per-section controls that shouldn't be consumed by
 *  the collapse handler. */
export function CollapsibleSection({
  icon,
  title,
  rightSlot,
  collapsed,
  onToggleCollapsed,
  children,
}: CollapsibleSectionProps) {
  return (
    <section>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm py-1 text-left text-xs font-semibold tracking-tight hover:text-foreground"
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{title}</span>
        </button>
        {rightSlot}
      </div>
      {!collapsed ? <div>{children}</div> : null}
    </section>
  );
}
