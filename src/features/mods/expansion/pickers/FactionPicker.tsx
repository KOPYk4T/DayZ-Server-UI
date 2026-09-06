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

import { EXPANSION_FACTIONS } from "./factions";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When truthy, empty value is rendered as "(any)" and the input
   *  placeholder hints that an empty string means "no restriction".
   *  Used by Quest RequiredFaction / Trader RequiredFaction etc. */
  treatEmptyAsAny?: boolean;
}

/**
 * Picker for an Expansion faction name. Typeable, with the known
 * built-in enum in the popover. Custom faction names from script
 * mods still work — anything the operator types is accepted; the
 * popover just helps with spelling + discoverability.
 */
export function FactionPicker({
  value,
  onChange,
  placeholder = "faction",
  disabled,
  className,
  treatEmptyAsAny,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = value.trim();
  const isKnown = trimmed.length > 0 && EXPANSION_FACTIONS.includes(trimmed);

  const matches = useMemo(() => {
    const q = (search || trimmed).toLowerCase();
    if (!q) return EXPANSION_FACTIONS;
    return EXPANSION_FACTIONS.filter((f) => f.toLowerCase().includes(q));
  }, [search, trimmed]);

  return (
    <div className={cn("flex w-full items-center gap-1", className)}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={
          treatEmptyAsAny ? `${placeholder} (empty = any)` : placeholder
        }
        disabled={disabled}
        className="h-7 min-w-0 flex-1 font-mono text-xs"
      />
      {trimmed.length > 0 ? (
        isKnown ? (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-success/40 px-1 text-[9px] text-severity-success"
            title="Built-in Expansion faction"
          >
            <Shield className="mr-0.5 h-2.5 w-2.5" /> known
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-warning/40 px-1 text-[9px] text-severity-warning"
            title="Not a built-in Expansion faction. Accepted for custom script-added factions — double-check the spelling."
          >
            custom
          </Badge>
        )
      ) : treatEmptyAsAny ? (
        <Badge
          variant="outline"
          className="shrink-0 px-1 text-[9px] text-muted-foreground"
          title="No faction restriction"
        >
          any
        </Badge>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="open faction picker"
            disabled={disabled}
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[240px] p-0" align="end">
          <div className="flex items-center gap-2 border-b border-border/60 p-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter factions"
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
            {treatEmptyAsAny ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border/40 px-3 py-1.5 text-left text-xs italic hover:bg-accent/50",
                  trimmed === "" && "bg-accent/70",
                )}
              >
                {trimmed === "" ? (
                  <Check className="h-3 w-3 text-severity-success" />
                ) : (
                  <span className="h-3 w-3" />
                )}
                (any — no restriction)
              </button>
            ) : null}
            {matches.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No built-in faction matches. You can still type a
                custom faction name — the tool will accept it.
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
            {EXPANSION_FACTIONS.length} built-in factions. Custom
            factions (script mods) accepted by free typing.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
