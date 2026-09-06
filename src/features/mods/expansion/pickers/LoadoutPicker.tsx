import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FileJson2, Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useLoadoutFileList } from "./useLoadoutFileList";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Caller-supplied list. When omitted, the picker fetches the
   *  loadout list itself via `useLoadoutFileList()`. The prop
   *  escape hatch lets tests and storybook-style callers inject
   *  their own fixture without hitting the backend. */
  knownOverride?: string[];
}

/**
 * Picker for an AI loadout filename stem (from
 * `profiles/ExpansionMod/Loadouts/*.json`). Typeable — custom /
 * not-yet-authored loadouts are accepted (the file will be created
 * by the operator outside this app). When the typed value doesn't
 * match an on-disk loadout, a `missing` badge appears so the
 * operator knows to create the file before the server boot.
 */
export function LoadoutPicker({
  value,
  onChange,
  placeholder = "loadout file stem",
  disabled,
  className,
  knownOverride,
}: Props) {
  const fetched = useLoadoutFileList();
  const known = knownOverride ?? fetched;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = value.trim();
  const isKnown = trimmed.length > 0 && known.includes(trimmed);

  const matches = useMemo(() => {
    const q = (search || trimmed).toLowerCase();
    if (!q) return known.slice(0, 50);
    return known.filter((n) => n.toLowerCase().includes(q)).slice(0, 50);
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
            title="Loadout file exists in ExpansionMod/Loadouts/"
          >
            <FileJson2 className="mr-0.5 h-2.5 w-2.5" /> found
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-warning/40 px-1 text-[9px] text-severity-warning"
            title="No matching file in ExpansionMod/Loadouts/ — the server will fall back to defaults at runtime. Create the file before boot."
          >
            missing
          </Badge>
        )
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="open loadout picker"
            disabled={disabled}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="end">
          <div className="flex items-center gap-2 border-b border-border/60 p-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter loadouts"
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
            {known.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No loadouts found under{" "}
                <code>ExpansionMod/Loadouts/</code>. Author a JSON
                file there, or type the filename you plan to create —
                the tool will accept it.
              </div>
            ) : matches.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No matches. You can still type a new loadout stem —
                it'll be flagged <strong>missing</strong> until the
                file is authored.
              </div>
            ) : (
              <ul>
                {matches.map((name) => {
                  const selected = name === trimmed;
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(name);
                          setOpen(false);
                          setSearch("");
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs hover:bg-accent/50",
                          selected && "bg-accent/70",
                        )}
                      >
                        {selected ? (
                          <Check className="h-3 w-3 text-severity-success" />
                        ) : (
                          <span className="h-3 w-3" />
                        )}
                        <span className="truncate">{name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
            {known.length} loadout{known.length === 1 ? "" : "s"} in{" "}
            <code>ExpansionMod/Loadouts/</code>.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
