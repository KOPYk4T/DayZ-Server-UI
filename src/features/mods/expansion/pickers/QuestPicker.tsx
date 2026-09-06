import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Scroll, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useQuestIndex, type QuestIndexEntry } from "./useQuestIndex";

interface Props {
  /** Integer quest ID. `null` / `0` / `-1` all surface as "none" per
   *  Expansion semantics. Use -1 for `FollowUpQuest` (= no follow-up)
   *  and 0 for reward `QuestID` (= vanilla placeholder). */
  value: number;
  onChange: (next: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Value that means "none / not set". Expansion uses -1 for
   *  FollowUpQuest and 0 for some reward fields. Rendered as a
   *  dedicated "(none)" row in the popover. */
  noneValue?: number;
}

/**
 * Picker for a quest ID. Input accepts raw integers (matches the
 * Expansion file shape) + a popover showing every quest in the
 * workspace by ID and title, resolved live from
 * `ExpansionMod/Quests/Quests/*.json`.
 *
 * Used for `FollowUpQuest`, `PreQuestIDs[]` entries, trader
 * `RequiredCompletedQuestID`, and quest reward `QuestID`. The
 * resolution gives operators a friendly title inline instead of a
 * bare integer.
 */
export function QuestPicker({
  value,
  onChange,
  placeholder = "quest id",
  disabled,
  className,
  noneValue,
}: Props) {
  const { entries, byId, isLoading } = useQuestIndex();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [raw, setRaw] = useState(String(value));

  // Sync raw buffer when the outer value changes (e.g. from the
  // picker selection or a parent reset).
  useEffect(() => {
    setRaw(String(value));
  }, [value]);

  const current: QuestIndexEntry | undefined = byId.get(value);
  const isNone = noneValue !== undefined && value === noneValue;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries.slice(0, 80);
    return entries
      .filter((e) => {
        if (String(e.id) === q) return true;
        return e.title.toLowerCase().includes(q);
      })
      .slice(0, 80);
  }, [search, entries]);

  const commitRaw = () => {
    const n = Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n)) {
      onChange(n);
    } else {
      setRaw(String(value));
    }
  };

  return (
    <div className={cn("flex w-full items-center gap-1", className)}>
      <Input
        type="number"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commitRaw}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-7 w-24 font-mono text-xs"
      />
      <div className="min-w-0 flex-1 truncate text-[11px]">
        {isNone ? (
          <span className="italic text-muted-foreground">(none)</span>
        ) : current ? (
          <span className="inline-flex items-center gap-1">
            <Scroll className="h-3 w-3 shrink-0 text-severity-success" />
            <span className="truncate">{current.title}</span>
          </span>
        ) : value > 0 ? (
          <span className="text-severity-warning" title="Quest ID not found in the workspace — the file may be missing or the ID was typed manually.">
            unknown quest
          </span>
        ) : null}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="open quest picker"
            disabled={disabled}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[360px] p-0" align="end">
          <div className="flex items-center gap-2 border-b border-border/60 p-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter by id or title"
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
            {noneValue !== undefined ? (
              <button
                type="button"
                onClick={() => {
                  onChange(noneValue);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left text-xs italic hover:bg-accent/50",
                  isNone && "bg-accent/70",
                )}
              >
                {isNone ? (
                  <Check className="h-3 w-3 text-severity-success" />
                ) : (
                  <span className="h-3 w-3" />
                )}
                (none) — id {noneValue}
              </button>
            ) : null}
            {isLoading && entries.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                Loading quest index…
              </div>
            ) : entries.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No quests found under{" "}
                <code>Quests/Quests/</code>. Type an id manually if
                needed — the picker will flag it as{" "}
                <strong>unknown</strong> until the quest file exists.
              </div>
            ) : matches.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No quests match. Type an id manually if needed.
              </div>
            ) : (
              <ul>
                {matches.map((q) => {
                  const selected = q.id === value;
                  return (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(q.id);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50",
                          selected && "bg-accent/70",
                        )}
                      >
                        {selected ? (
                          <Check className="h-3 w-3 shrink-0 text-severity-success" />
                        ) : (
                          <span className="h-3 w-3 shrink-0" />
                        )}
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[10px]"
                        >
                          #{q.id}
                        </Badge>
                        <span className="truncate">{q.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
            {entries.length} quest{entries.length === 1 ? "" : "s"} in
            the workspace.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
