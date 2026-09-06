import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useItemsUpsert } from "@/hooks/useItems";
import { errorMessage } from "@/lib/utils";
import type { ItemFlags, ItemType } from "@/types/ipc";

// ---------- Patch model ----------

type NumFieldKey =
  | "nominal"
  | "min"
  | "lifetime"
  | "restock"
  | "quantmin"
  | "quantmax"
  | "cost";

type FlagKey = keyof ItemFlags;

type TriState = "keep" | "on" | "off";

const NUM_FIELDS: {
  key: NumFieldKey;
  label: string;
  hint: string;
  min?: number;
  step?: number;
}[] = [
  { key: "nominal", label: "Nominal", hint: "Target count on the map", min: 0 },
  { key: "min", label: "Min", hint: "Minimum count before restock", min: 0 },
  {
    key: "lifetime",
    label: "Lifetime (s)",
    hint: "Seconds before untouched items despawn",
    min: 0,
  },
  {
    key: "restock",
    label: "Restock (s)",
    hint: "Delay before CE refills to nominal",
    min: 0,
  },
  {
    key: "quantmin",
    label: "Quant min %",
    hint: "Lower bound of quantity / charge (or -1)",
    step: 1,
  },
  {
    key: "quantmax",
    label: "Quant max %",
    hint: "Upper bound of quantity / charge (or -1)",
    step: 1,
  },
  { key: "cost", label: "Cost", hint: "Despawn priority; higher = last out" },
];

const FLAGS: { key: FlagKey; label: string; hint: string }[] = [
  {
    key: "count_in_cargo",
    label: "count_in_cargo",
    hint: "Counted if inside backpacks / containers on the ground",
  },
  {
    key: "count_in_hoarder",
    label: "count_in_hoarder",
    hint: "Counted if inside tents / stashes / barrels",
  },
  {
    key: "count_in_map",
    label: "count_in_map",
    hint: "Counted as spawned in the world",
  },
  {
    key: "count_in_player",
    label: "count_in_player",
    hint: "Counted if held in a player's inventory",
  },
  { key: "crafted", label: "crafted", hint: "Exempt from CE counts (crafted item)" },
  { key: "deloot", label: "deloot", hint: "Dynamic event loot — CE-spawned by events" },
];

interface NumPatch {
  change: boolean;
  value: number;
}

interface BulkPatch {
  numeric: Record<NumFieldKey, NumPatch>;
  flags: Record<FlagKey, TriState>;
  categoryChange: boolean;
  category: string | null;
  usageOp: "ignore" | "add" | "remove";
  usageValue: string;
  valueOp: "ignore" | "add" | "remove";
  valueValue: string;
  tagOp: "ignore" | "add" | "remove";
  tagValue: string;
}

function defaultPatch(): BulkPatch {
  const numeric = {} as Record<NumFieldKey, NumPatch>;
  NUM_FIELDS.forEach((f) => (numeric[f.key] = { change: false, value: 0 }));
  const flags = {} as Record<FlagKey, TriState>;
  FLAGS.forEach((f) => (flags[f.key] = "keep"));
  return {
    numeric,
    flags,
    categoryChange: false,
    category: null,
    usageOp: "ignore",
    usageValue: "",
    valueOp: "ignore",
    valueValue: "",
    tagOp: "ignore",
    tagValue: "",
  };
}

function applyPatch(it: ItemType, p: BulkPatch): ItemType {
  const next: ItemType = {
    ...it,
    flags: { ...it.flags },
    usage: it.usage.slice(),
    value: it.value.slice(),
    tags: it.tags.slice(),
  };

  NUM_FIELDS.forEach((f) => {
    if (p.numeric[f.key].change) {
      next[f.key] = p.numeric[f.key].value;
    }
  });

  FLAGS.forEach((f) => {
    if (p.flags[f.key] === "on") next.flags[f.key] = 1;
    else if (p.flags[f.key] === "off") next.flags[f.key] = 0;
  });

  if (p.categoryChange) {
    next.category = p.category && p.category.length > 0 ? p.category : null;
  }

  const applyListOp = (
    list: string[],
    op: "ignore" | "add" | "remove",
    val: string,
  ) => {
    if (op === "ignore" || !val.trim()) return list;
    const v = val.trim();
    if (op === "add") return list.includes(v) ? list : [...list, v];
    return list.filter((x) => x !== v);
  };

  next.usage = applyListOp(next.usage, p.usageOp, p.usageValue);
  next.value = applyListOp(next.value, p.valueOp, p.valueValue);
  next.tags = applyListOp(next.tags, p.tagOp, p.tagValue);

  return next;
}

function patchIsEmpty(p: BulkPatch): boolean {
  if (NUM_FIELDS.some((f) => p.numeric[f.key].change)) return false;
  if (FLAGS.some((f) => p.flags[f.key] !== "keep")) return false;
  if (p.categoryChange) return false;
  if (p.usageOp !== "ignore" && p.usageValue.trim()) return false;
  if (p.valueOp !== "ignore" && p.valueValue.trim()) return false;
  if (p.tagOp !== "ignore" && p.tagValue.trim()) return false;
  return true;
}

// ---------- Dialog ----------

export function BulkEditDialog({
  open,
  onOpenChange,
  selection,
  categories,
  usages,
  values,
  tags,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The actual selected items (not just names) so we can preview. */
  selection: ItemType[];
  categories: string[];
  usages: string[];
  values: string[];
  tags: string[];
  /** Fired after a successful save so the caller can clear selection. */
  onDone?: () => void;
}) {
  const [patch, setPatch] = useState<BulkPatch>(defaultPatch);
  const upsert = useItemsUpsert();

  useEffect(() => {
    if (open) setPatch(defaultPatch());
  }, [open]);

  const empty = useMemo(() => patchIsEmpty(patch), [patch]);

  const apply = () => {
    if (empty || selection.length === 0) return;
    const updated = selection.map((it) => applyPatch(it, patch));
    upsert.mutate(updated, {
      onSuccess: () => {
        toast.success(`Bulk edit applied`, {
          description: `Updated ${updated.length} item${updated.length === 1 ? "" : "s"}.`,
        });
        onOpenChange(false);
        onDone?.();
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk edit {selection.length} item{selection.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription className="text-xs">
            Only the fields you tick will be applied. Vanilla items get
            custom overrides; existing custom items are updated in-place.
            One commit per apply.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-2">
          {/* ---- Numeric fields ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Numeric fields
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {NUM_FIELDS.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-2"
                >
                  <Checkbox
                    id={`bulk-${f.key}`}
                    checked={patch.numeric[f.key].change}
                    onCheckedChange={(v) =>
                      setPatch((p) => ({
                        ...p,
                        numeric: {
                          ...p.numeric,
                          [f.key]: {
                            ...p.numeric[f.key],
                            change: v === true,
                          },
                        },
                      }))
                    }
                  />
                  <Label
                    htmlFor={`bulk-${f.key}`}
                    className="flex-1 cursor-pointer text-xs font-normal"
                    title={f.hint}
                  >
                    {f.label}
                  </Label>
                  <Input
                    type="number"
                    step={f.step ?? 1}
                    min={f.min}
                    value={patch.numeric[f.key].value}
                    onChange={(e) =>
                      setPatch((p) => ({
                        ...p,
                        numeric: {
                          ...p.numeric,
                          [f.key]: {
                            change: true,
                            value: Number(e.target.value) || 0,
                          },
                        },
                      }))
                    }
                    className="h-7 w-24 text-xs tabular-nums"
                    disabled={!patch.numeric[f.key].change}
                  />
                </div>
              ))}
            </div>
          </section>

          {/* ---- Flags ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Flags
            </h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {FLAGS.map((f) => (
                <div
                  key={f.key}
                  className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-1.5"
                >
                  <Label
                    className="flex-1 cursor-help font-mono text-[11px] font-normal"
                    title={f.hint}
                  >
                    {f.label}
                  </Label>
                  <Select
                    value={patch.flags[f.key]}
                    onValueChange={(v) =>
                      setPatch((p) => ({
                        ...p,
                        flags: { ...p.flags, [f.key]: v as TriState },
                      }))
                    }
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep</SelectItem>
                      <SelectItem value="on">Set ON</SelectItem>
                      <SelectItem value="off">Set OFF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </section>

          {/* ---- Category ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </h3>
            <div className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
              <Checkbox
                id="bulk-category"
                checked={patch.categoryChange}
                onCheckedChange={(v) =>
                  setPatch((p) => ({
                    ...p,
                    categoryChange: v === true,
                  }))
                }
              />
              <Label
                htmlFor="bulk-category"
                className="flex-1 cursor-pointer text-xs font-normal"
              >
                Change category to
              </Label>
              <Select
                value={patch.category ?? "__clear__"}
                onValueChange={(v) =>
                  setPatch((p) => ({
                    ...p,
                    categoryChange: true,
                    category: v === "__clear__" ? null : v,
                  }))
                }
                disabled={!patch.categoryChange}
              >
                <SelectTrigger className="h-7 w-48 text-xs">
                  <SelectValue placeholder="Pick category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__clear__">(clear category)</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {/* ---- List ops ---- */}
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Usage / Tier / Tag lists
            </h3>
            <div className="space-y-2">
              <ListOpRow
                label="Usage"
                op={patch.usageOp}
                value={patch.usageValue}
                options={usages}
                onOpChange={(op) => setPatch((p) => ({ ...p, usageOp: op }))}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, usageValue: v }))
                }
              />
              <ListOpRow
                label="Value (tier)"
                op={patch.valueOp}
                value={patch.valueValue}
                options={values}
                onOpChange={(op) => setPatch((p) => ({ ...p, valueOp: op }))}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, valueValue: v }))
                }
              />
              <ListOpRow
                label="Tag"
                op={patch.tagOp}
                value={patch.tagValue}
                options={tags}
                onOpChange={(op) => setPatch((p) => ({ ...p, tagOp: op }))}
                onValueChange={(v) =>
                  setPatch((p) => ({ ...p, tagValue: v }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                Add = append if not already present. Remove = drop every
                occurrence. Blank value = ignored.
              </p>
            </div>
          </section>

          {/* ---- Affected rows preview ---- */}
          <section className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="font-semibold">Affected items</span>
              <Badge variant="outline">{selection.length}</Badge>
            </div>
            <div className="max-h-24 overflow-y-auto font-mono text-[11px] text-muted-foreground">
              {selection.slice(0, 40).map((it) => (
                <div key={it.name}>{it.name}</div>
              ))}
              {selection.length > 40 ? (
                <div className="italic">
                  …and {selection.length - 40} more.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={apply}
            disabled={empty || upsert.isPending || selection.length === 0}
          >
            {upsert.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Apply to {selection.length} item{selection.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListOpRow({
  label,
  op,
  value,
  options,
  onOpChange,
  onValueChange,
}: {
  label: string;
  op: "ignore" | "add" | "remove";
  value: string;
  options: string[];
  onOpChange: (op: "ignore" | "add" | "remove") => void;
  onValueChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
      <Label className="w-24 text-xs font-normal">{label}</Label>
      <Select value={op} onValueChange={(v) => onOpChange(v as typeof op)}>
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ignore">Ignore</SelectItem>
          <SelectItem value="add">Add</SelectItem>
          <SelectItem value="remove">Remove</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={value || "__none__"}
        onValueChange={(v) => onValueChange(v === "__none__" ? "" : v)}
        disabled={op === "ignore"}
      >
        <SelectTrigger className="h-7 flex-1 text-xs">
          <SelectValue placeholder="(pick value)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(none)</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
