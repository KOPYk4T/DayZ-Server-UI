import { useMemo, useState } from "react";
import { Library, Plus, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GlobalVar } from "@/types/ipc";

import {
  GLOBAL_CATALOG,
  GLOBAL_GROUPS,
  type GlobalGroup,
} from "./catalog";

/**
 * Library picker for globals.xml. Surfaces every known vanilla /
 * community var with its description, grouped. Already-present vars
 * are shown disabled so the user can see what they already have
 * without adding a duplicate. A free-text "Create custom" row at
 * the bottom lets operators add a var that isn't in the catalog —
 * same shape as the old "Add var" button but retained here so
 * there's a single entry point.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingNames: Set<string>;
  onAdd: (v: GlobalVar) => void;
}

export function GlobalsLibraryDialog({
  open,
  onOpenChange,
  existingNames,
  onAdd,
}: Props) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"all" | GlobalGroup>("all");

  const entries = useMemo(() => {
    const all = Object.entries(GLOBAL_CATALOG).map(([name, info]) => ({
      name,
      info,
    }));
    const q = search.trim().toLowerCase();
    return all
      .filter((e) => group === "all" || e.info.group === group)
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.info.summary.toLowerCase().includes(q) ||
          (e.info.detail ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, group]);

  const pick = (name: string) => {
    const info = GLOBAL_CATALOG[name];
    onAdd({
      name,
      varType: info?.defaultType ?? "integer",
      value: info?.defaultValue ?? "",
    });
    onOpenChange(false);
  };

  const createCustom = () => {
    const name = search.trim();
    onAdd({
      name,
      varType: "integer",
      value: "",
    });
    setSearch("");
    onOpenChange(false);
  };

  const customMatchesNothing =
    search.trim().length > 0 &&
    entries.length === 0 &&
    !existingNames.has(search.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full !max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Library className="h-4 w-4" /> Globals library
          </DialogTitle>
          <DialogDescription className="text-xs">
            Pick a known DayZ var to insert with sensible defaults.
            Click through any entry to see what it does.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or description…"
              className="h-8 pl-7 pr-7 text-xs"
              autoFocus
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                aria-label="clear"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1 overflow-x-auto">
            <GroupChip
              active={group === "all"}
              onClick={() => setGroup("all")}
              label="All"
            />
            {GLOBAL_GROUPS.map((g) => (
              <GroupChip
                key={g.id}
                active={group === g.id}
                onClick={() => setGroup(g.id)}
                label={g.label}
              />
            ))}
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-2 py-1.5">
          {entries.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No library entries match. Use the custom-var row below
              to add one anyway.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {entries.map(({ name, info }) => {
                const already = existingNames.has(name);
                return (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => !already && pick(name)}
                      disabled={already}
                      className={cn(
                        "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                        already
                          ? "cursor-default opacity-50"
                          : "hover:bg-muted/40",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <code className="font-mono text-xs">{name}</code>
                          <Badge
                            variant="outline"
                            className="text-[9px]"
                          >
                            {
                              GLOBAL_GROUPS.find((g) => g.id === info.group)
                                ?.label
                            }
                          </Badge>
                          {already ? (
                            <Badge
                              variant="outline"
                              className="border-severity-info/40 text-[9px] text-severity-info"
                            >
                              already added
                            </Badge>
                          ) : null}
                          {info.unit ? (
                            <span className="font-mono text-[9px] text-muted-foreground">
                              {info.unit}
                            </span>
                          ) : null}
                          {info.defaultValue ? (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              default: {info.defaultValue}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {info.summary}
                        </p>
                        {info.detail ? (
                          <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                            {info.detail}
                          </p>
                        ) : null}
                      </div>
                      {!already ? (
                        <Plus className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {customMatchesNothing ? (
          <div className="border-t border-border/60 bg-muted/20 px-5 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={createCustom}
              className="w-full justify-start"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              Create custom var:{" "}
              <code className="ml-1 font-mono">{search.trim()}</code>
            </Button>
          </div>
        ) : (
          <div className="border-t border-border/60 bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground">
            Tip: type a name that isn't in the library to create a
            custom var.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GroupChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 text-muted-foreground hover:bg-muted/40",
      )}
    >
      {label}
    </button>
  );
}
