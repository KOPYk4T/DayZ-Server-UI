import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, Shield, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Exact classnames known to exist (items registry). */
  known: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Optional muted-entry hook. Called per rendered classname row
   *  in the popover. When `muted` is true, the row is dimmed and
   *  the `reason` (if present) becomes its tooltip. Used to flag
   *  classnames contributed by a mod the operator has toggled off
   *  on the Mods page — they still render (the operator may still
   *  want to reference them) but visually demote. No behaviour
   *  change when the prop isn't provided. */
  getMutedState?: (name: string) => {
    muted: boolean;
    reason?: string;
    modLabel?: string;
  };
}

/**
 * Free-typing classname input with an autocomplete popover backed by
 * the merged items registry. Typing is allowed even when nothing
 * matches — that's the valid case for mod items without a CE entry.
 * The trigger shows a shield badge when the typed value is known.
 */
export function ClassnamePicker({
  value,
  onChange,
  known,
  placeholder = "classname",
  disabled,
  className,
  getMutedState,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = value.trim();
  const isKnown = trimmed.length > 0 && known.includes(trimmed);
  const valueMuted = trimmed.length > 0 ? getMutedState?.(trimmed) : undefined;

  const matches = useMemo(() => {
    const q = (search || trimmed).toLowerCase();
    if (!q) return known.slice(0, 40);
    return known
      .filter((k) => k.toLowerCase().includes(q))
      .slice(0, 40);
  }, [search, trimmed, known]);

  return (
    <div className={cn("flex w-full items-center gap-1", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-7 min-w-0 flex-1 font-mono text-xs"
      />
      {trimmed.length > 0 ? (
        isKnown ? (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-success/40 px-1 text-[9px] text-severity-success"
            title="classname found in the items registry"
          >
            <Shield className="mr-0.5 h-2.5 w-2.5" /> known
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-warning/40 px-1 text-[9px] text-severity-warning"
            title="classname not in any loaded types.xml — may be a mod class without CE metadata (see README)"
          >
            unknown
          </Badge>
        )
      ) : null}
      {valueMuted?.muted ? (
        <Badge
          variant="outline"
          className="shrink-0 border-muted-foreground/40 px-1 text-[9px] text-muted-foreground"
          title={valueMuted.reason ?? "owning mod is toggled off"}
        >
          off-mod
        </Badge>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="open classname picker"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="end">
          <div className="flex items-center gap-2 border-b border-border/60 p-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter classnames"
              className="flex-1 bg-transparent text-xs outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {matches.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No matches in the loaded registry. You can still type the
                classname directly in the input — the tool will accept it.
              </div>
            ) : (
              <ul>
                {matches.map((name) => {
                  const selected = name === trimmed;
                  const mutedState = getMutedState?.(name);
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(name);
                          setOpen(false);
                          setSearch("");
                        }}
                        title={mutedState?.muted ? mutedState.reason : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-accent/50",
                          selected && "bg-accent/70",
                          mutedState?.muted && "opacity-50",
                        )}
                      >
                        {selected ? (
                          <Check className="h-3 w-3 text-severity-success" />
                        ) : (
                          <span className="h-3 w-3" />
                        )}
                        <span className="truncate">{name}</span>
                        {mutedState?.muted && mutedState.modLabel ? (
                          <span className="ml-auto shrink-0 text-[9px] uppercase text-muted-foreground">
                            {mutedState.modLabel} · off
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
            {known.length} classname{known.length === 1 ? "" : "s"} in the
            loaded registry.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
