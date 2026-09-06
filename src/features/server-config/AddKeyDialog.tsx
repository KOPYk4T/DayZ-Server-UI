import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { CfgSegment } from "@/types/ipc";

import { CFG_GROUPS, CFG_KEY_CATALOG, type CfgGroup } from "./catalog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Keys currently present in the cfg (scalars + arrays). The dialog
   *  hides catalog entries already in use so users don't accidentally
   *  add a duplicate. */
  existingKeys: Set<string>;
  /** Called with the new segment to append. Kind is picked based on
   *  the catalog `shape` field (scalar vs array). Custom keys always
   *  land as string scalars — user retypes if needed. */
  onAdd: (seg: CfgSegment) => void;
}

/** Dialog lists catalog keys not yet in the file, each with its
 *  description + group. Clicking Add creates a segment pre-typed per
 *  the catalog hint. A free-text "Add custom key" row at the bottom
 *  handles mod-authored keys the catalog doesn't know about. */
export function AddKeyDialog({
  open,
  onOpenChange,
  existingKeys,
  onAdd,
}: Props) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"all" | CfgGroup>("all");
  const [customName, setCustomName] = useState("");

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(CFG_KEY_CATALOG)
      .filter(([key]) => !existingKeys.has(key))
      .filter(([, info]) => group === "all" || info.group === group)
      .filter(([key, info]) => {
        if (!q) return true;
        return (
          key.toLowerCase().includes(q) ||
          info.summary.toLowerCase().includes(q) ||
          (info.detail ?? "").toLowerCase().includes(q)
        );
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [search, group, existingKeys]);

  const handleAddCatalog = (
    key: string,
    info: (typeof CFG_KEY_CATALOG)[string],
  ) => {
    const shape = info.shape ?? "string";
    const seg: CfgSegment =
      shape === "array"
        ? {
            kind: "array",
            key,
            elements: [],
            leadingComments: [],
            trailingComment: null,
          }
        : {
            kind: "scalar",
            key,
            rawValue:
              shape === "string" ? "\"\"" : shape === "float" ? "0.0" : "0",
            valueKind: shape,
            leadingComments: [],
            trailingComment: null,
          };
    onAdd(seg);
    onOpenChange(false);
  };

  const handleAddCustom = () => {
    const name = customName.trim();
    if (!name) return;
    const seg: CfgSegment = {
      kind: "scalar",
      key: name,
      rawValue: "\"\"",
      valueKind: "string",
      leadingComments: [],
      trailingComment: null,
    };
    onAdd(seg);
    setCustomName("");
    onOpenChange(false);
  };

  // Reset local UI state when the dialog closes so a reopen starts fresh.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("");
      setGroup("all");
      setCustomName("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add key to serverDZ.cfg</DialogTitle>
          <DialogDescription className="text-xs">
            Pick a catalogued key (keys already in the file are
            hidden), or type a custom key for mod-authored settings.
            The chosen shape (string / integer / float / array) is
            pre-typed; edit the value in the table afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name / description"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-72 pl-7 text-xs"
            />
          </div>
          <Select
            value={group}
            onValueChange={(v) => setGroup(v as typeof group)}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {CFG_GROUPS.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="ml-auto text-muted-foreground">
            {entries.length} unused key{entries.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="max-h-[48vh] overflow-y-auto rounded-md border border-border/50">
          {entries.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              {existingKeys.size > 0
                ? "Every catalogued key in this group is already in the file. Try another group or add a custom key below."
                : "No catalogued keys match."}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {entries.map(([key, info]) => {
                const groupLabel =
                  CFG_GROUPS.find((g) => g.id === info.group)?.label ?? "";
                const shape = info.shape ?? "string";
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[1fr_120px_72px] items-start gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="truncate font-mono text-foreground">
                          {key}
                        </code>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {shape}
                        </Badge>
                        {info.unit ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {info.unit}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {info.summary}
                      </p>
                      {info.detail ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                          {info.detail}
                        </p>
                      ) : null}
                    </div>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {groupLabel}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleAddCatalog(key, info)}
                      className="h-7"
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-md border border-dashed border-border/60 p-3">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Add a custom key (mod-authored / not catalogued)
          </Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="myModSetting"
              className={cn("h-8 flex-1 font-mono text-xs")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleAddCustom}
              disabled={
                !customName.trim() ||
                existingKeys.has(customName.trim()) ||
                // Also guard against adding a catalogued name via the
                // custom path — it would come through as a plain
                // string scalar and lose the catalog hint. Nudge the
                // user to the catalogued row instead.
                !!CFG_KEY_CATALOG[customName.trim()]
              }
              title={
                existingKeys.has(customName.trim())
                  ? "Key already exists in the file"
                  : CFG_KEY_CATALOG[customName.trim()]
                    ? "Catalogued key — add via the row above for proper type hints"
                    : "Add as string scalar"
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add custom
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
