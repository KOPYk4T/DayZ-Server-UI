import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FileJson2,
  Heart,
  Layers,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shirt,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassnamePicker } from "@/components/ClassnamePicker";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useModsScan } from "@/hooks/useMods";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

import {
  COMMON_SLOT_NAMES,
  DEFAULT_LOADOUT,
  DEFAULT_LOADOUT_ITEM,
  countDeepItems,
  summariseItem,
  type Loadout,
  type LoadoutAttachmentSlot,
  type LoadoutHealthRange,
  type LoadoutItem,
} from "./types";

/** Limit for recursive typed rendering — past this depth the UI
 *  hides nested sub-editors and points at the "Raw JSON" toggle
 *  instead. Keeps the DOM footprint bounded on pathologically deep
 *  loadouts. */
const MAX_TYPED_DEPTH = 4;

/** Common DayZ body zones used in `Health[].Zone`. Operators can
 *  still type a custom one for mod-added zones. */
const COMMON_HEALTH_ZONES: string[] = [
  "",
  "GlobalHealth",
  "Head",
  "Torso",
  "LeftArm",
  "RightArm",
  "LeftLeg",
  "RightLeg",
  "LeftHand",
  "RightHand",
  "LeftFoot",
  "RightFoot",
];

export function LoadoutsPage() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();
  const modsScan = useModsScan();
  const inv = modsScan.data?.expansion ?? null;
  const items = useItemsSnapshot();

  const loadoutsDir = inv
    ? inv.dataFolders.find((d) => d.name === "Loadouts")?.relativePath
    : null;

  const list = useQuery({
    queryKey:
      profileId && loadoutsDir
        ? ["expansion-loadout-list", profileId]
        : ["none"],
    queryFn: () => tauri.expansionListDir(profileId!, loadoutsDir!),
    enabled: !!(profileId && loadoutsDir),
    staleTime: 5_000,
  });

  const createLoadout = useMutation({
    mutationFn: async (slug: string) => {
      if (!profileId || !loadoutsDir) throw new Error("no folder");
      const path = `${loadoutsDir}/${slug}.json`;
      await tauri.expansionSettingsWrite(
        profileId,
        path,
        JSON.stringify(DEFAULT_LOADOUT, null, 4),
      );
      return path;
    },
    onSuccess: (path) => {
      qc.invalidateQueries({
        queryKey: ["expansion-loadout-list", profileId],
      });
      setSelectedPath(path);
      toast.success("loadout created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const loadoutFiles = useMemo(
    () =>
      (list.data?.entries ?? [])
        .filter((e) => !e.isDir && e.extension === "json")
        .sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        ),
    [list.data],
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (selectedPath || loadoutFiles.length === 0) return;
    setSelectedPath(loadoutFiles[0].relativePath);
  }, [selectedPath, loadoutFiles]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return loadoutFiles;
    return loadoutFiles.filter((e) => e.name.toLowerCase().includes(q));
  }, [loadoutFiles, filter]);

  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );

  if (!inv) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Breadcrumb />
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            DayZ Expansion isn't detected in this workspace.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Breadcrumb />
      <header className="flex items-center gap-2">
        <Shirt className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">AI loadouts</h1>
        <Badge variant="secondary">{loadoutFiles.length}</Badge>
      </header>
      <p className="text-xs text-muted-foreground">
        Gear presets for Expansion AI units — what a bot spawns
        wearing and carrying, including nested attachments and cargo.
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr] gap-4">
        <aside className="flex min-h-0 flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter loadouts"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {list.isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {filtered.map((f) => {
                const stem = f.name.replace(/\.json$/i, "");
                return (
                  <li key={f.relativePath}>
                    <button
                      type="button"
                      onClick={() => setSelectedPath(f.relativePath)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                        selectedPath === f.relativePath
                          ? "bg-primary/10 font-semibold text-primary"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <Shirt className="h-3 w-3 shrink-0" />
                      <span className="truncate">{stem}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 h-8 text-xs"
            disabled={!loadoutsDir || createLoadout.isPending}
            onClick={() => {
              const raw = prompt(
                "New loadout filename (without .json). Alphanumeric + underscore only.",
              );
              if (!raw) return;
              const slug = raw.replace(/[^A-Za-z0-9_]/g, "").trim();
              if (!slug) {
                toast.error("invalid name");
                return;
              }
              createLoadout.mutate(slug);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> New loadout
          </Button>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {selectedPath ? (
            <LoadoutEditor
              path={selectedPath}
              knownClassnames={knownClassnames}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a loadout on the left.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link to="/app/mods" className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60">
        <ArrowLeft className="h-3 w-3" /> Mods
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <Link to="/app/mods/expansion" className="hover:underline">
        Expansion
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">Loadouts</span>
    </nav>
  );
}

function LoadoutEditor({
  path,
  knownClassnames,
}: {
  path: string;
  knownClassnames: string[];
}) {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: profileId ? ["expansion-loadout", profileId, path] : ["none"],
    queryFn: async () => {
      const raw = await tauri.expansionSettingsRead(profileId!, path);
      return JSON.parse(raw) as Loadout;
    },
    enabled: !!profileId,
    staleTime: 0,
  });

  const save = useMutation({
    mutationFn: async (data: Loadout) => {
      if (!profileId) throw new Error("no profile");
      await tauri.expansionSettingsWrite(
        profileId,
        path,
        JSON.stringify(data, null, 4),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["expansion-loadout", profileId, path],
      });
      toast.success("saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [draft, setDraft] = useState<Loadout | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data, path]);

  if (query.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{errorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const stem = path.split("/").pop()!.replace(/\.json$/i, "");
  const dirty =
    query.data != null && JSON.stringify(draft) !== JSON.stringify(query.data);
  const totalItems = countDeepItems(draft);

  const updateSlot = (idx: number, patch: Partial<LoadoutAttachmentSlot>) => {
    const next = [...draft.InventoryAttachments];
    next[idx] = { ...next[idx], ...patch };
    setDraft({ ...draft, InventoryAttachments: next });
  };

  const addSlot = (slotName: string) => {
    const slot: LoadoutAttachmentSlot = {
      SlotName: slotName,
      Items: [],
    };
    setDraft({
      ...draft,
      InventoryAttachments: [...draft.InventoryAttachments, slot],
    });
  };

  const removeSlot = (idx: number) => {
    setDraft({
      ...draft,
      InventoryAttachments: draft.InventoryAttachments.filter(
        (_, i) => i !== idx,
      ),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>{stem}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {draft.InventoryAttachments.length} slot
              {draft.InventoryAttachments.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {totalItems} total item{totalItems === 1 ? "" : "s"}
              {totalItems > 50 ? " (deep)" : ""}
            </Badge>
            {dirty ? (
              <Badge
                variant="secondary"
                className="border-severity-warning/40 text-severity-warning"
              >
                unsaved
              </Badge>
            ) : null}
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => query.data && setDraft(query.data)}
                disabled={!dirty || save.isPending}
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Revert
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => save.mutate(draft)}
                disabled={!dirty || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="border-muted-foreground/30">
            <Layers className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Typed editor covers attachment slots, cargo, pick-one
              sets, health ranges, and construction parts — at the
              root and for every nested item. Expand the chevron on a
              row to edit that item's sub-contents. Anything
              mod-specific the typed editor doesn't model round-trips
              on save; reach it via the per-row Raw JSON toggle.
            </AlertDescription>
          </Alert>

          <AddSlotControl
            existingSlots={draft.InventoryAttachments.map((s) => s.SlotName)}
            onAdd={addSlot}
          />

          {draft.InventoryAttachments.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No attachment slots yet. Add a slot above — typical AI
              loadouts cover Body / Vest / Legs / Feet / Back and a
              melee / weapon slot.
            </p>
          ) : (
            <ul className="space-y-3">
              {draft.InventoryAttachments.map((slot, idx) => (
                <li key={idx}>
                  <SlotEditor
                    slot={slot}
                    onChange={(patch) => updateSlot(idx, patch)}
                    onRemove={() => removeSlot(idx)}
                    knownClassnames={knownClassnames}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
            <CargoEditor
              value={draft.InventoryCargo ?? []}
              onChange={(v) => setDraft({ ...draft, InventoryCargo: v })}
              knownClassnames={knownClassnames}
              depth={1}
            />
            <SetsEditor
              value={draft.Sets ?? []}
              onChange={(v) => setDraft({ ...draft, Sets: v })}
              knownClassnames={knownClassnames}
              depth={1}
            />
            <HealthRangesEditor
              value={draft.Health ?? []}
              onChange={(v) => setDraft({ ...draft, Health: v })}
            />
            <ConstructionPartsEditor
              value={draft.ConstructionPartsBuilt ?? []}
              onChange={(v) =>
                setDraft({ ...draft, ConstructionPartsBuilt: v })
              }
              knownClassnames={knownClassnames}
            />
          </div>

          <p className="text-[10px] text-muted-foreground">
            Reference:{" "}
            <a
              href="https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Expansion AI wiki
            </a>
            . Mod-added fields that the typed editor doesn't model
            round-trip on save — use the per-item Raw JSON toggle to
            edit them in place.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AddSlotControl({
  existingSlots,
  onAdd,
}: {
  existingSlots: string[];
  onAdd: (name: string) => void;
}) {
  const [custom, setCustom] = useState("");
  const used = new Set(existingSlots.map((s) => s.toLowerCase()));
  const suggestions = COMMON_SLOT_NAMES.filter(
    (s) => !used.has(s.toLowerCase()),
  );
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-muted/30 p-2">
      <div className="min-w-[160px] space-y-1">
        <Label className="text-[11px]">Add slot (quick)</Label>
        <Select
          value=""
          onValueChange={(v) => v && onAdd(v)}
          disabled={suggestions.length === 0}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue
              placeholder={
                suggestions.length === 0 ? "all common slots used" : "choose…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {suggestions.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[200px] flex-1 space-y-1">
        <Label className="text-[11px]">Custom slot name</Label>
        <div className="flex gap-1">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. TacticalShirt (mod slot)"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                onAdd(custom.trim());
                setCustom("");
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={!custom.trim()}
            onClick={() => {
              onAdd(custom.trim());
              setCustom("");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SlotEditor({
  slot,
  onChange,
  onRemove,
  knownClassnames,
  depth = 0,
}: {
  slot: LoadoutAttachmentSlot;
  onChange: (patch: Partial<LoadoutAttachmentSlot>) => void;
  onRemove: () => void;
  knownClassnames: string[];
  depth?: number;
}) {
  const updateItem = (idx: number, next: LoadoutItem) => {
    const items = [...slot.Items];
    items[idx] = next;
    onChange({ Items: items });
  };
  const removeItem = (idx: number) => {
    onChange({ Items: slot.Items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    onChange({ Items: [...slot.Items, { ...DEFAULT_LOADOUT_ITEM }] });
  };

  return (
    <div className="rounded-md border border-border/60 bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/30 p-2">
        <Shirt className="h-3.5 w-3.5 shrink-0 text-primary" />
        <Input
          value={slot.SlotName}
          onChange={(e) => onChange({ SlotName: e.target.value })}
          className="h-7 w-40 text-xs font-semibold"
        />
        <Badge variant="outline" className="text-[10px]">
          {slot.Items.length} item{slot.Items.length === 1 ? "" : "s"}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
          onClick={addItem}
        >
          <Plus className="mr-1 h-3 w-3" /> Add item
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-severity-error"
          onClick={onRemove}
          title="Remove slot"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {slot.Items.length === 0 ? (
        <p className="p-3 text-center text-xs text-muted-foreground">
          Empty slot — the AI wears nothing here with certainty. The
          slot will still render if Expansion picks a default; usually
          you want at least one item with <code>Chance: 1.0</code>.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {slot.Items.map((it, idx) => (
            <li key={idx}>
              <ItemRow
                item={it}
                onChange={(next) => updateItem(idx, next)}
                onRemove={() => removeItem(idx)}
                knownClassnames={knownClassnames}
                depth={depth + 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onChange,
  onRemove,
  knownClassnames,
  depth,
}: {
  item: LoadoutItem;
  /** Receives the next full item so nested sub-editors can commit
   *  multi-field changes in one go. Caller replaces the array slot
   *  with `next`. */
  onChange: (next: LoadoutItem) => void;
  onRemove: () => void;
  knownClassnames: string[];
  depth: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const summary = summariseItem(item);
  const getMutedState = useMutedClassnameReason();
  const attachmentCount = item.InventoryAttachments?.length ?? 0;
  const cargoCount = item.InventoryCargo?.length ?? 0;
  const setsCount = item.Sets?.length ?? 0;
  const healthCount = item.Health?.length ?? 0;
  const partsCount = item.ConstructionPartsBuilt?.length ?? 0;
  const hasDeep =
    attachmentCount + cargoCount + setsCount + healthCount + partsCount > 0;
  const overDepth = depth >= MAX_TYPED_DEPTH;
  // One-shot helper so sub-editors can patch a single field without
  // manually rebuilding the full LoadoutItem at every call site.
  const patch = (p: Partial<LoadoutItem>) => onChange({ ...item, ...p });

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      <div className="grid grid-cols-[auto_1fr_70px_70px_70px_70px_auto] items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 self-center"
          onClick={() => setExpanded((v) => !v)}
          title={expanded ? "Collapse nested contents" : "Expand nested contents"}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Classname</Label>
          <ClassnamePicker
            value={item.ClassName}
            onChange={(v) => patch({ ClassName: v })}
            known={knownClassnames}
            getMutedState={getMutedState}
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Chance</Label>
          <Input
            type="number"
            step="0.1"
            min={0}
            max={1}
            value={item.Chance}
            onChange={(e) => patch({ Chance: Number(e.target.value) })}
            className="h-7 text-right text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Qty min</Label>
          <Input
            type="number"
            value={item.Quantity.Min}
            onChange={(e) =>
              patch({
                Quantity: {
                  ...item.Quantity,
                  Min: Number(e.target.value) || 0,
                },
              })
            }
            className="h-7 text-right text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Qty max</Label>
          <Input
            type="number"
            value={item.Quantity.Max}
            onChange={(e) =>
              patch({
                Quantity: {
                  ...item.Quantity,
                  Max: Number(e.target.value) || 0,
                },
              })
            }
            className="h-7 text-right text-xs"
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px]">Include</Label>
          <Input
            value={item.Include}
            onChange={(e) => patch({ Include: e.target.value })}
            placeholder="empty"
            className="h-7 text-xs"
            title="Reference another Loadouts/<name>.json to splice in"
          />
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setJsonOpen((v) => !v)}
            title="Advanced — edit as raw JSON (covers mod-added fields the typed editor doesn't model)"
          >
            <FileJson2 className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3 text-severity-error" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-8">
        <Badge variant="outline" className="text-[10px]">
          contents · {summary}
        </Badge>
        {hasDeep && !expanded ? (
          <Badge
            variant="outline"
            className="border-severity-info/40 text-[10px] text-severity-info"
            title="Click the chevron to expand the typed nested editor."
          >
            nested contents
          </Badge>
        ) : null}
      </div>

      {expanded ? (
        overDepth ? (
          <div className="ml-8 rounded-md border border-severity-warning/40 bg-severity-warning/5 p-2 text-[10px] text-severity-warning">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Nesting deeper than {MAX_TYPED_DEPTH} levels — use the
            Raw JSON toggle to edit from here. The save path still
            round-trips everything.
          </div>
        ) : (
          <div className="ml-8 space-y-3 rounded-md border border-border/60 bg-muted/20 p-2">
            <SubAttachmentsEditor
              value={item.InventoryAttachments ?? []}
              onChange={(v) => patch({ InventoryAttachments: v })}
              knownClassnames={knownClassnames}
              depth={depth + 1}
            />
            <CargoEditor
              value={item.InventoryCargo ?? []}
              onChange={(v) => patch({ InventoryCargo: v })}
              knownClassnames={knownClassnames}
              depth={depth + 1}
            />
            <SetsEditor
              value={item.Sets ?? []}
              onChange={(v) => patch({ Sets: v })}
              knownClassnames={knownClassnames}
              depth={depth + 1}
            />
            <HealthRangesEditor
              value={item.Health ?? []}
              onChange={(v) => patch({ Health: v })}
            />
            <ConstructionPartsEditor
              value={item.ConstructionPartsBuilt ?? []}
              onChange={(v) => patch({ ConstructionPartsBuilt: v })}
              knownClassnames={knownClassnames}
            />
          </div>
        )
      ) : null}

      {jsonOpen ? (
        <NestedJsonEditor
          value={item}
          onChange={(next) => onChange(next)}
          onClose={() => setJsonOpen(false)}
        />
      ) : null}
    </div>
  );
}

// ---------- Nested typed sub-editors ----------

function SectionHeader({
  icon: Icon,
  title,
  count,
  onAdd,
  addLabel,
}: {
  icon: typeof Layers;
  title: string;
  count: number;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <Badge variant="outline" className="text-[10px]">
        {count}
      </Badge>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="ml-auto h-6 px-1.5 text-[10px]"
        onClick={onAdd}
        title={addLabel}
      >
        <Plus className="mr-0.5 h-3 w-3" /> {addLabel}
      </Button>
    </div>
  );
}

function SubAttachmentsEditor({
  value,
  onChange,
  knownClassnames,
  depth,
}: {
  value: LoadoutAttachmentSlot[];
  onChange: (next: LoadoutAttachmentSlot[]) => void;
  knownClassnames: string[];
  depth: number;
}) {
  const addSlot = () => {
    onChange([...value, { SlotName: "", Items: [] }]);
  };
  if (value.length === 0) {
    return (
      <div className="space-y-1">
        <SectionHeader
          icon={Layers}
          title="Sub-attachments"
          count={0}
          onAdd={addSlot}
          addLabel="Add slot"
        />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <SectionHeader
        icon={Layers}
        title="Sub-attachments"
        count={value.length}
        onAdd={addSlot}
        addLabel="Add slot"
      />
      <ul className="space-y-2">
        {value.map((slot, idx) => (
          <li key={idx}>
            <SlotEditor
              slot={slot}
              onChange={(patch) => {
                const next = [...value];
                next[idx] = { ...next[idx], ...patch };
                onChange(next);
              }}
              onRemove={() => onChange(value.filter((_, i) => i !== idx))}
              knownClassnames={knownClassnames}
              depth={depth}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CargoEditor({
  value,
  onChange,
  knownClassnames,
  depth,
}: {
  value: LoadoutItem[];
  onChange: (next: LoadoutItem[]) => void;
  knownClassnames: string[];
  depth: number;
}) {
  const addItem = () =>
    onChange([...value, { ...DEFAULT_LOADOUT_ITEM }]);
  return (
    <div className="space-y-1">
      <SectionHeader
        icon={Package}
        title="Cargo"
        count={value.length}
        onAdd={addItem}
        addLabel="Add item"
      />
      {value.length === 0 ? null : (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60 bg-background">
          {value.map((it, idx) => (
            <li key={idx}>
              <ItemRow
                item={it}
                onChange={(next) => {
                  const arr = [...value];
                  arr[idx] = next;
                  onChange(arr);
                }}
                onRemove={() =>
                  onChange(value.filter((_, i) => i !== idx))
                }
                knownClassnames={knownClassnames}
                depth={depth}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SetsEditor({
  value,
  onChange,
  knownClassnames,
  depth,
}: {
  value: LoadoutItem[];
  onChange: (next: LoadoutItem[]) => void;
  knownClassnames: string[];
  depth: number;
}) {
  const addItem = () =>
    onChange([...value, { ...DEFAULT_LOADOUT_ITEM }]);
  return (
    <div className="space-y-1">
      <SectionHeader
        icon={Shirt}
        title="Sets (pick-one alternatives)"
        count={value.length}
        onAdd={addItem}
        addLabel="Add alternative"
      />
      {value.length === 0 ? null : (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60 bg-background">
          {value.map((it, idx) => (
            <li key={idx}>
              <ItemRow
                item={it}
                onChange={(next) => {
                  const arr = [...value];
                  arr[idx] = next;
                  onChange(arr);
                }}
                onRemove={() =>
                  onChange(value.filter((_, i) => i !== idx))
                }
                knownClassnames={knownClassnames}
                depth={depth}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HealthRangesEditor({
  value,
  onChange,
}: {
  value: LoadoutHealthRange[];
  onChange: (next: LoadoutHealthRange[]) => void;
}) {
  const addRange = () =>
    onChange([...value, { Min: 1, Max: 1, Zone: "GlobalHealth" }]);
  const updateRange = (idx: number, patch: Partial<LoadoutHealthRange>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  return (
    <div className="space-y-1">
      <SectionHeader
        icon={Heart}
        title="Health ranges"
        count={value.length}
        onAdd={addRange}
        addLabel="Add range"
      />
      {value.length === 0 ? null : (
        <ul className="space-y-1">
          {value.map((r, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              <Label className="w-12 text-[10px]">Min</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={r.Min}
                onChange={(e) =>
                  updateRange(idx, { Min: Number(e.target.value) })
                }
                className="h-7 w-20 text-right text-xs"
              />
              <Label className="w-12 text-[10px]">Max</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={r.Max}
                onChange={(e) =>
                  updateRange(idx, { Max: Number(e.target.value) })
                }
                className="h-7 w-20 text-right text-xs"
              />
              <Label className="w-12 text-[10px]">Zone</Label>
              <Select
                value={r.Zone || ""}
                onValueChange={(v) =>
                  updateRange(idx, { Zone: v === "__custom__" ? "" : v })
                }
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue placeholder="choose…" />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_HEALTH_ZONES.map((z) => (
                    <SelectItem key={z || "__empty__"} value={z || "__empty__"}>
                      {z || "(empty — whole item)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!COMMON_HEALTH_ZONES.includes(r.Zone) ? (
                <Input
                  value={r.Zone}
                  onChange={(e) =>
                    updateRange(idx, { Zone: e.target.value })
                  }
                  placeholder="custom zone"
                  className="h-7 w-32 text-xs"
                />
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() =>
                  onChange(value.filter((_, i) => i !== idx))
                }
              >
                <Trash2 className="h-3 w-3 text-severity-error" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConstructionPartsEditor({
  value,
  onChange,
  knownClassnames,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  knownClassnames: string[];
}) {
  const getMutedState = useMutedClassnameReason();
  const addPart = () => onChange([...value, ""]);
  return (
    <div className="space-y-1">
      <SectionHeader
        icon={Wrench}
        title="Construction parts built"
        count={value.length}
        onAdd={addPart}
        addLabel="Add part"
      />
      {value.length === 0 ? null : (
        <ul className="space-y-1">
          {value.map((p, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              <ClassnamePicker
                value={p}
                onChange={(v) => {
                  const next = [...value];
                  next[idx] = v;
                  onChange(next);
                }}
                known={knownClassnames}
                placeholder="e.g. Wall_Metal"
                className="flex-1"
                getMutedState={getMutedState}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() =>
                  onChange(value.filter((_, i) => i !== idx))
                }
              >
                <Trash2 className="h-3 w-3 text-severity-error" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NestedJsonEditor({
  value,
  onChange,
  onClose,
}: {
  value: LoadoutItem;
  onChange: (next: LoadoutItem) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(value, null, 2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Raw JSON · advanced escape hatch
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Use this when you need to edit a mod-added field the typed
        editor doesn't model. Typed nested editing handles attachments,
        cargo, sets, health, and construction parts — prefer those.
      </p>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setErr(null);
        }}
        spellCheck={false}
        className="h-40 w-full resize-y rounded-md border border-border/60 bg-background p-2 font-mono text-[10px]"
      />
      {err ? (
        <p className="text-[10px] text-severity-error">{err}</p>
      ) : null}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={() => {
            try {
              const parsed = JSON.parse(draft);
              if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                setErr("item must be an object");
                return;
              }
              onChange(parsed as LoadoutItem);
              onClose();
            } catch (e) {
              setErr(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
