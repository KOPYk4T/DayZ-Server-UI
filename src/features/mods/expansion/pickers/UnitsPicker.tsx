import { useMemo, useState } from "react";
import { Plus, Search, Tag, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { EXPANSION_AI_PREFABS } from "./expansion-classes";

interface Props {
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Multi-value picker for the AI patrol `Units[]` array. Renders
 * the current selection as removable chips with a "+ Add unit"
 * popover that lists every built-in eAI prefab classname. Free
 * typing accepted — operators can paste mod-fork classnames
 * directly into the picker's input field at the bottom of the
 * popover.
 *
 * Order is preserved: appended classes go to the end of the
 * array, mirroring how the JSON file reads chronologically.
 * Duplicates are silently rejected — eAI's roll-from-list logic
 * picks uniformly from the array so duplicates would just bias
 * the spawn distribution, which is almost always a bug.
 */
export function UnitsPicker({
  value,
  onChange,
  disabled,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customDraft, setCustomDraft] = useState("");

  const valueSet = useMemo(() => new Set(value), [value]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return EXPANSION_AI_PREFABS.filter((p) => {
      if (!q) return true;
      return p.toLowerCase().includes(q);
    });
  }, [search]);

  const add = (cls: string) => {
    const trimmed = cls.trim();
    if (!trimmed) return;
    if (valueSet.has(trimmed)) return;
    onChange([...value, trimmed]);
  };
  const remove = (cls: string) => {
    onChange(value.filter((v) => v !== cls));
  };
  const clear = () => onChange([]);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {value.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">
            No units — eAI will roll from the global defaults at
            spawn.
          </span>
        ) : (
          value.map((cls) => {
            const known = EXPANSION_AI_PREFABS.includes(cls);
            return (
              <Badge
                key={cls}
                variant="outline"
                className={cn(
                  "h-5 gap-1 pl-2 pr-1 font-mono text-[10px]",
                  known
                    ? "border-primary/40 text-foreground"
                    : "border-severity-warning/40 text-severity-warning",
                )}
                title={
                  known
                    ? "Built-in eAI prefab"
                    : "Not a built-in eAI prefab — accepted for mod-fork customs"
                }
              >
                {known ? (
                  <Tag className="h-2.5 w-2.5 opacity-70" />
                ) : null}
                {cls}
                <button
                  type="button"
                  onClick={() => remove(cls)}
                  disabled={disabled}
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`remove ${cls}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })
        )}
      </div>

      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              disabled={disabled}
            >
              <Plus className="h-3 w-3" /> Add unit
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <div className="flex items-center gap-2 border-b border-border/60 p-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter eAI prefabs"
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
                  No built-in prefab matches. Type a custom
                  classname below.
                </div>
              ) : (
                <ul>
                  {matches.map((p) => {
                    const already = valueSet.has(p);
                    return (
                      <li key={p}>
                        <button
                          type="button"
                          onClick={() => {
                            if (already) return;
                            add(p);
                            setSearch("");
                          }}
                          disabled={already}
                          className={cn(
                            "flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs hover:bg-accent/50",
                            already && "opacity-50",
                          )}
                        >
                          <span className="truncate">{p}</span>
                          {already ? (
                            <span className="text-[10px] text-muted-foreground">
                              added
                            </span>
                          ) : (
                            <Plus className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-1 border-t border-border/60 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Custom classname
              </div>
              <div className="flex gap-1">
                <Input
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      add(customDraft);
                      setCustomDraft("");
                    }
                  }}
                  placeholder="MyMod_AI_Soldier"
                  spellCheck={false}
                  className="h-6 flex-1 font-mono text-[11px]"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-[11px]"
                  disabled={!customDraft.trim()}
                  onClick={() => {
                    add(customDraft);
                    setCustomDraft("");
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        {value.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={clear}
            disabled={disabled}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
