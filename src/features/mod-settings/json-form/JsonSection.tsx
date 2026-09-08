import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  countLabel?: string;
  hint?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}

/**
 * Named slab inside the shared inspector card. Not a second Card:
 * groups and loose fields sit on the same panel.
 */
export function JsonSection({
  title,
  countLabel,
  hint,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="col-span-full border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <button
        type="button"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full select-none items-center gap-2 rounded-sm py-1.5 text-left outline-none transition-colors duration-150 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        <span className="type-section min-w-0 flex-1 truncate">{title}</span>
        {countLabel ? (
          <Badge variant="secondary" className="font-normal">
            {countLabel}
          </Badge>
        ) : null}
        {hint ? <span className="type-hint shrink-0">{hint}</span> : null}
      </button>
      {open && children ? (
        <div className="animate-in fade-in-0 slide-in-from-top-1 mt-3 duration-200 motion-reduce:animate-none">
          {children}
        </div>
      ) : null}
    </div>
  );
}
