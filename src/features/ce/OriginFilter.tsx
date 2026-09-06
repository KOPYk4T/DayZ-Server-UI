import { Filter, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { originTint, type RecordWithOrigin } from "./origin";
import { useOriginFilter } from "./useOriginFilter";

interface Props<T extends RecordWithOrigin> {
  /** All records the editor knows about — including ones the rest
   *  of the toolbar may filter out. We compute origin counts off the
   *  full set so the chip counts stay stable while text searches /
   *  source filters narrow the visible list separately. */
  records: ReadonlyArray<T>;
  /** Same prefix the host's `useOriginFilter` call uses. Lets two
   *  filter rows on the same page (e.g. Loadouts → Spawnables vs
   *  Presets) keep their state separate in the URL. */
  paramPrefix?: string;
  /** Optional override label — defaults to "Mod source". */
  label?: string;
  className?: string;
}

/**
 * Top-of-list filter row. Two layers:
 *
 *   Layer A — mod chips: every distinct origin with a count badge.
 *             Click toggles selection (multi-select via Ctrl/Cmd).
 *   Layer B — file chips: appears only when exactly one mod origin
 *             is active, listing every XML inside that mod with
 *             counts. Clicking a chip narrows further.
 *
 * Both layers use `useOriginFilter`, so the URL stays in sync and
 * the host's record list re-derives via the same hook. Keeping the
 * filter row stateless about its own filtering is intentional: it's
 * read-only against `useOriginFilter`'s state and only mutates via
 * the toggles it provides.
 */
export function OriginFilter<T extends RecordWithOrigin>({
  records,
  paramPrefix,
  label = "Mod source",
  className,
}: Props<T>) {
  const f = useOriginFilter({ records, paramPrefix });

  if (f.origins.length <= 1) {
    // Only vanilla (or only one mod) — the filter row would just be
    // a single dead chip. Hide it so toolbars don't waste height.
    return null;
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <Filter className="h-3 w-3" /> {label}
        </span>
        <button
          type="button"
          onClick={() => f.clearAll()}
          className={cn(
            "rounded border px-2 py-0.5 text-[11px] transition",
            !f.isFiltered
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground hover:bg-muted/40",
          )}
          title="Show records from every source"
        >
          All
          <span className="ml-1 text-[10px] opacity-70">
            {records.length.toLocaleString()}
          </span>
        </button>
        {f.origins.map((o) => {
          const tint = originTint(o.id);
          const active = f.selectedOrigins.has(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) {
                  f.toggleOrigin(o.id);
                } else if (active && f.selectedOrigins.size === 1) {
                  // Plain click on the only-active chip → clear.
                  f.clearAll();
                } else {
                  f.setOnlyOrigin(o.id);
                }
              }}
              className={cn(
                "rounded border px-2 py-0.5 text-[11px] transition",
                active ? "" : "opacity-70 hover:opacity-100",
              )}
              style={{
                backgroundColor: active ? tint.bg : "transparent",
                borderColor: tint.border,
                color: tint.fg,
              }}
              title={
                active
                  ? `Showing ${o.label} only — click to clear, Ctrl-click to toggle`
                  : `Show only ${o.label} (Ctrl-click to add to selection)`
              }
            >
              <span className="font-medium">{o.label}</span>
              <span className="ml-1 text-[10px] opacity-80">
                {o.count.toLocaleString()}
              </span>
            </button>
          );
        })}
        {f.isFiltered ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-6 px-2 text-[11px] text-muted-foreground"
            onClick={() => f.clearAll()}
          >
            <X className="mr-1 h-3 w-3" /> Clear filter
          </Button>
        ) : null}
      </div>

      {f.filesForSelectedOrigin.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-4">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            File
          </span>
          <button
            type="button"
            onClick={() => f.setFile(null)}
            className={cn(
              "rounded border px-2 py-0.5 text-[10px]",
              !f.selectedFile
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:bg-muted/40",
            )}
          >
            All
          </button>
          {f.filesForSelectedOrigin.map((row) => {
            const active = f.selectedFile === row.file;
            return (
              <button
                key={row.file}
                type="button"
                onClick={() => f.setFile(active ? null : row.file)}
                title={row.file}
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] transition",
                  active
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:bg-muted/40",
                )}
              >
                {row.basename}
                <Badge
                  variant="secondary"
                  className="ml-1 h-3.5 px-1 text-[9px]"
                >
                  {row.count.toLocaleString()}
                </Badge>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Re-export for ergonomic imports — sites typically need both the
 *  filter UI and the filtered record list, so they can pull both
 *  from the same module path. */
export { useOriginFilter } from "./useOriginFilter";
export { OriginChip } from "./OriginChip";
