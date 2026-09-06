import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  /** Bold tagline at the top, if present. */
  tagline?: string;
  /** Main body (1-3 sentences). */
  children: React.ReactNode;
  /** Extra class for the trigger icon. */
  className?: string;
  /** Side of the label to show on. Defaults to top for most labels. */
  side?: "top" | "right" | "bottom" | "left";
  /** Max width of the tooltip. Defaults to ~320px which fits most copy. */
  maxWidth?: string;
}

/**
 * Small "?" / "i" icon that pops a shadcn tooltip on hover/focus. Use
 * alongside labels whenever a field has non-obvious semantics. Keep the
 * tooltip body short — multi-paragraph prose belongs in the README.
 */
export function InfoTooltip({
  tagline,
  children,
  className,
  side = "top",
  maxWidth = "20rem",
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          tabIndex={0}
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground",
            className,
          )}
          aria-label="more info"
        >
          <Info className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        style={{ maxWidth }}
        className="space-y-1 px-3 py-2 text-xs leading-relaxed"
      >
        {tagline ? <p className="font-medium">{tagline}</p> : null}
        <p className="opacity-85">{children}</p>
      </TooltipContent>
    </Tooltip>
  );
}
