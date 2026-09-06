import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, Tag, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Group {
  /** Header text shown above this group's options. */
  heading: string;
  options: readonly string[];
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Either a flat list of options or grouped sections. Grouped
   *  rendering is preferred when one picker covers multiple class
   *  variants (e.g. trader: static / AI / object). */
  options: readonly string[] | readonly Group[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When truthy, empty value renders an "(any)" badge — used by
   *  fields where the empty string means "no restriction". */
  treatEmptyAsAny?: boolean;
  /** Override the popover footer count text. Defaults to a
   *  per-group breakdown when grouped, total count when flat. */
  footerLabel?: string;
}

function isGrouped(
  o: Props["options"],
): o is readonly Group[] {
  return o.length > 0 && typeof o[0] === "object";
}

/**
 * Generic typeable classname picker. Same UX shape as
 * `FactionPicker`: free typing accepted (mod-forks emit custom
 * classnames), with a popover listing the canonical built-in
 * classes for autocomplete + spelling confidence. Used by
 * `UnitsPicker`, `TraderClassPicker`, `QuestNpcClassPicker`.
 */
export function ClassnamePicker({
  value,
  onChange,
  options,
  placeholder = "classname",
  disabled,
  className,
  treatEmptyAsAny,
  footerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const flatOptions = useMemo<readonly string[]>(() => {
    if (isGrouped(options)) {
      return options.flatMap((g) => g.options);
    }
    return options;
  }, [options]);

  const trimmed = value.trim();
  const isKnown = trimmed.length > 0 && flatOptions.includes(trimmed);

  // Filter inside each group separately so grouped headings still
  // render even when one section has no matches; that way an
  // operator searching "Boris" sees both the Static + AI rows
  // grouped rather than flattened.
  const filteredGroups = useMemo<readonly Group[]>(() => {
    const q = (search || "").toLowerCase();
    const matchOpt = (o: string) => !q || o.toLowerCase().includes(q);
    if (isGrouped(options)) {
      return options
        .map((g) => ({ ...g, options: g.options.filter(matchOpt) }))
        .filter((g) => g.options.length > 0);
    }
    return [{ heading: "", options: options.filter(matchOpt) }];
  }, [options, search]);

  const totalMatches = filteredGroups.reduce(
    (n, g) => n + g.options.length,
    0,
  );
  const totalAll = flatOptions.length;

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
        spellCheck={false}
        className="h-7 min-w-0 flex-1 font-mono text-xs"
      />
      {trimmed.length > 0 ? (
        isKnown ? (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-success/40 px-1 text-[9px] text-severity-success"
            title="Built-in Expansion class"
          >
            <Tag className="mr-0.5 h-2.5 w-2.5" /> known
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="shrink-0 border-severity-warning/40 px-1 text-[9px] text-severity-warning"
            title="Not a built-in class. Accepted for mod-fork customs — double-check the spelling."
          >
            custom
          </Badge>
        )
      ) : treatEmptyAsAny ? (
        <Badge
          variant="outline"
          className="shrink-0 px-1 text-[9px] text-muted-foreground"
          title="No restriction"
        >
          any
        </Badge>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="open class picker"
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
          <div className="max-h-72 overflow-y-auto">
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
            {totalMatches === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">
                No built-in class matches. You can still type a
                custom classname — the tool will accept it.
              </div>
            ) : (
              filteredGroups.map((g, idx) => (
                <div key={`${g.heading}-${idx}`}>
                  {g.heading ? (
                    <div className="border-b border-border/30 bg-muted/30 px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      {g.heading}
                    </div>
                  ) : null}
                  <ul>
                    {g.options.map((name) => {
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
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
            {footerLabel ??
              `${totalAll} built-in class${totalAll === 1 ? "" : "es"}.`}{" "}
            Custom classnames (mod-fork) accepted by free typing.
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
