import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ClipboardList,
  Loader2,
  Plus,
  Save,
  Search,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ClassnamePicker } from "@/components/ClassnamePicker";
import { TokenInput } from "@/components/TokenInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { FactionPicker } from "@/features/mods/expansion/pickers/FactionPicker";
import { LoadoutPicker } from "@/features/mods/expansion/pickers/LoadoutPicker";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { useItemsSnapshot } from "@/hooks/useItems";
import { cn, errorMessage } from "@/lib/utils";

import { OBJECTIVE_TYPE_FOLDER, OBJECTIVE_TYPE_LABELS } from "../types";
import {
  useObjective,
  useObjectiveCreate,
  useObjectiveSave,
  useObjectivesIndex,
} from "./useObjectivesData";
import type {
  AICampObjective,
  AIPatrolObjective,
  AISpawnBlock,
  AIVIPObjective,
  ActionObjective,
  CollectionItem,
  CollectionObjective,
  CraftingObjective,
  DeliveryObjective,
  Objective,
  TargetObjective,
  TravelObjective,
  TreasureHuntObjective,
  Vec3,
} from "./types";

/**
 * Master/detail editor for every quest objective file under
 * `profiles/ExpansionMod/Quests/Objectives/`. The left rail groups
 * files by their type folder; the right pane renders a typed form
 * for the well-understood types (Travel / Target / Collection /
 * Delivery / AIVIP / Action / Crafting) and a raw-JSON fallback for
 * the complex ones (AI Patrol / AI Camp / Treasure Hunt). Every
 * save round-trips unknown fields unchanged.
 */
export function ObjectivesPage() {
  const { entries, isLoading } = useObjectivesIndex();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [rawMode, setRawMode] = useState<"form" | "raw">("form");
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: `?path=<relativePath>` selects that file. Takes
  // precedence over the default-first-entry behaviour and also wins
  // over a user's current manual selection so follow-ups from the
  // Quest editor always land on the right objective. Param is
  // cleared once consumed so subsequent navigation within the page
  // doesn't fight the URL.
  useEffect(() => {
    const pathParam = searchParams.get("path");
    if (!pathParam) return;
    // Wait until the index has the target entry before selecting.
    if (!entries.some((e) => e.relativePath === pathParam)) return;
    setSelected(pathParam);
    setRawMode("form");
    const next = new URLSearchParams(searchParams);
    next.delete("path");
    setSearchParams(next, { replace: true });
  }, [searchParams, entries, setSearchParams]);

  // Default-select the first entry once the index resolves, when no
  // `?path=` deep-link is waiting to take over.
  useEffect(() => {
    if (selected || entries.length === 0) return;
    if (searchParams.get("path")) return;
    setSelected(entries[0].relativePath);
  }, [entries, selected, searchParams]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.fileName.toLowerCase().includes(q) ||
        e.typeFolder.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filteredEntries>();
    for (const e of filteredEntries) {
      const bucket = m.get(e.typeFolder) ?? [];
      bucket.push(e);
      m.set(e.typeFolder, bucket);
    }
    return m;
  }, [filteredEntries]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 px-4 py-2 text-sm">
        <Link
          to="/app/mods/expansion"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Mods › Expansion
        </Link>
        <span className="text-muted-foreground">›</span>
        <span className="font-medium">Quest objectives</span>
        <span className="hidden text-xs text-muted-foreground md:inline">
          The task definitions (kill, collect, deliver, …) quests
          point at by ID.
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} objective{entries.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-[340px] flex-col border-r border-border/60">
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter by filename / type"
              className="flex-1 bg-transparent text-xs outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto text-sm">
            {isLoading && entries.length === 0 ? (
              <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : entries.length === 0 ? (
              <div className="p-4 text-xs text-muted-foreground">
                No objectives found under{" "}
                <code>ExpansionMod/Quests/Objectives/</code>. Use
                <strong> New objective</strong> to create one.
              </div>
            ) : (
              [...grouped.entries()].map(([folder, files]) => (
                <div key={folder} className="border-b border-border/30">
                  <div className="flex items-center gap-1 bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{folder}</span>
                    <Badge variant="secondary" className="ml-auto h-4 text-[10px]">
                      {files.length}
                    </Badge>
                  </div>
                  <ul>
                    {files.map((f) => (
                      <li key={f.relativePath}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(f.relativePath);
                            setRawMode("form");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/40",
                            selected === f.relativePath && "bg-muted/70",
                          )}
                        >
                          <Target className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate font-mono">{f.fileName}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
          <NewObjectiveButton existingIds={indexIdsByType(entries)} />
        </aside>
        <main className="flex-1 overflow-y-auto">
          {selected ? (
            <ObjectiveEditor
              key={selected}
              path={selected}
              mode={rawMode}
              onModeChange={setRawMode}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Pick an objective from the left.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function indexIdsByType(
  entries: Array<{ objectiveType: number | null; fileName: string }>,
): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const e of entries) {
    if (e.objectiveType === null) continue;
    const match = e.fileName.match(/_(\d+)\.json$/);
    if (!match) continue;
    const id = parseInt(match[1], 10);
    const set = out.get(e.objectiveType) ?? new Set<number>();
    set.add(id);
    out.set(e.objectiveType, set);
  }
  return out;
}

// ---------- New-objective flow ----------

function NewObjectiveButton({
  existingIds,
}: {
  existingIds: Map<number, Set<number>>;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<number>(3);
  const create = useObjectiveCreate();

  const nextId = useMemo(() => {
    const taken = existingIds.get(type) ?? new Set<number>();
    let id = 1;
    while (taken.has(id)) id += 1;
    return id;
  }, [existingIds, type]);

  if (!open) {
    return (
      <div className="border-t border-border/60 p-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          onClick={() => setOpen(true)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> New objective
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 border-t border-border/60 p-2 text-xs">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        New objective
      </Label>
      <Select
        value={String(type)}
        onValueChange={(v) => setType(Number(v))}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(OBJECTIVE_TYPE_LABELS).map(([k, label]) => (
            <SelectItem key={k} value={k}>
              {k} · {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">
        Folder: <code>{OBJECTIVE_TYPE_FOLDER[type]}</code> · Next ID:{" "}
        <code>{nextId}</code>
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-7 flex-1 text-xs"
          disabled={create.isPending}
          onClick={() => {
            create.mutate(
              { objectiveType: type, id: nextId },
              {
                onSuccess: () => {
                  toast.success("objective created");
                  setOpen(false);
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            );
          }}
        >
          {create.isPending ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1 h-3.5 w-3.5" />
          )}
          Create
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------- Per-objective editor ----------

function ObjectiveEditor({
  path,
  mode,
  onModeChange,
}: {
  path: string;
  mode: "form" | "raw";
  onModeChange: (mode: "form" | "raw") => void;
}) {
  const query = useObjective(path);
  const save = useObjectiveSave();
  const [draft, setDraft] = useState<Objective | null>(null);
  const [rawDraft, setRawDraft] = useState<string>("");

  useEffect(() => {
    if (query.data) {
      setDraft(query.data);
      setRawDraft(JSON.stringify(query.data, null, 4));
    }
  }, [query.data]);

  if (query.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  }

  const onSave = () => {
    if (mode === "raw") {
      try {
        const parsed = JSON.parse(rawDraft) as Objective;
        save.mutate(
          { path, data: parsed },
          {
            onSuccess: () => toast.success("objective saved"),
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      } catch (err) {
        toast.error(`JSON invalid: ${errorMessage(err)}`);
      }
      return;
    }
    save.mutate(
      { path, data: draft },
      {
        onSuccess: () => toast.success("objective saved"),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const label =
    OBJECTIVE_TYPE_LABELS[draft.ObjectiveType] ??
    `Type ${draft.ObjectiveType}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 text-xs">
        <ClipboardList className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono">{path.split("/").slice(-1)[0]}</span>
        <Badge variant="secondary" className="text-[10px]">
          type {draft.ObjectiveType} · {label}
        </Badge>
        <span className="ml-auto flex items-center gap-2">
          <Tabs value={mode} onValueChange={(v) => onModeChange(v as typeof mode)}>
            <TabsList className="h-7">
              <TabsTrigger value="form" className="h-6 text-[11px]">
                Form
              </TabsTrigger>
              <TabsTrigger value="raw" className="h-6 text-[11px]">
                Raw JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={onSave}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {mode === "raw" ? (
          <Textarea
            value={rawDraft}
            onChange={(e) => setRawDraft(e.target.value)}
            className="h-full min-h-[400px] font-mono text-xs"
            spellCheck={false}
          />
        ) : (
          <TypedForm
            obj={draft}
            onChange={(next) => {
              setDraft(next);
              setRawDraft(JSON.stringify(next, null, 4));
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Typed form ----------

function TypedForm({
  obj,
  onChange,
}: {
  obj: Objective;
  onChange: (next: Objective) => void;
}) {
  return (
    <div className="space-y-4">
      <CommonFields obj={obj} onChange={onChange} />
      <TypeSpecificFields obj={obj} onChange={onChange} />
      {obj.ObjectiveType === 7 || obj.ObjectiveType === 8 ? (
        <Alert>
          <AlertDescription className="text-xs">
            The typed form covers the common AI-spawn knobs. For
            per-unit overrides not listed here (formation details,
            loot-drop tables, threat-distance sub-fields) switch to
            the <strong>Raw JSON</strong> tab. Unknown fields round-
            trip unchanged on save.
          </AlertDescription>
        </Alert>
      ) : null}
      {obj.ObjectiveType === 6 ? (
        <Alert>
          <AlertDescription className="text-xs">
            Treasure Hunt container + dig flags edit here. The{" "}
            <strong>Loot</strong> array (with Attachments / Variants
            per entry) stays on the Raw JSON tab — loot tables mirror
            DayZ's nested shape and need the raw editor. All unknown
            fields round-trip unchanged on save.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function CommonFields({
  obj,
  onChange,
}: {
  obj: Objective;
  onChange: (next: Objective) => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[1fr_120px_120px_80px]">
      <div className="space-y-1.5">
        <Label>Objective text</Label>
        <Input
          value={obj.ObjectiveText}
          onChange={(e) =>
            onChange({ ...obj, ObjectiveText: e.target.value })
          }
          className="h-8 text-xs"
        />
      </div>
      <NumberField
        label="ID"
        value={obj.ID}
        onChange={(n) => onChange({ ...obj, ID: n })}
      />
      <NumberField
        label="Time limit (s)"
        value={obj.TimeLimit}
        onChange={(n) => onChange({ ...obj, TimeLimit: n })}
        hint="-1 = none"
      />
      <div className="space-y-1.5">
        <Label className="text-[10px]">Active</Label>
        <Switch
          checked={obj.Active === 1}
          onCheckedChange={(c) =>
            onChange({ ...obj, Active: c ? 1 : 0 })
          }
        />
      </div>
    </section>
  );
}

function TypeSpecificFields({
  obj,
  onChange,
}: {
  obj: Objective;
  onChange: (next: Objective) => void;
}) {
  switch (obj.ObjectiveType) {
    case 3:
      return <TravelFields obj={obj} onChange={onChange} />;
    case 2:
      return <TargetFields obj={obj} onChange={onChange} />;
    case 4:
      return (
        <CollectionFieldsCore
          title="Items to collect"
          obj={obj}
          onChange={onChange}
          includePosition={false}
        />
      );
    case 5:
      return (
        <CollectionFieldsCore
          title="Items to deliver"
          obj={obj}
          onChange={onChange}
          includePosition
        />
      );
    case 6:
      return <TreasureHuntFields obj={obj} onChange={onChange} />;
    case 7:
      return <AIPatrolFields obj={obj} onChange={onChange} />;
    case 8:
      return <AICampFields obj={obj} onChange={onChange} />;
    case 9:
      return <AIVIPFields obj={obj} onChange={onChange} />;
    case 10:
      return <ActionFields obj={obj} onChange={onChange} />;
    case 11:
      return <CraftingFields obj={obj} onChange={onChange} />;
    default:
      return null;
  }
}

// ---------- Travel (3) ----------

function TravelFields({
  obj,
  onChange,
}: {
  obj: TravelObjective;
  onChange: (next: Objective) => void;
}) {
  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Travel destination
      </Label>
      <Vec3Field
        label="Position"
        value={obj.Position}
        onChange={(v) => onChange({ ...obj, Position: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Max distance (m)"
          value={obj.MaxDistance}
          onChange={(n) => onChange({ ...obj, MaxDistance: n })}
        />
        <div className="space-y-1.5">
          <Label>Marker name</Label>
          <Input
            value={obj.MarkerName}
            onChange={(e) =>
              onChange({ ...obj, MarkerName: e.target.value })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="flex gap-4">
        <FlagField
          label="Show distance"
          value={obj.ShowDistance}
          onChange={(v) => onChange({ ...obj, ShowDistance: v })}
        />
        <FlagField
          label="Trigger on enter"
          value={obj.TriggerOnEnter}
          onChange={(v) => onChange({ ...obj, TriggerOnEnter: v })}
        />
        <FlagField
          label="Trigger on exit"
          value={obj.TriggerOnExit}
          onChange={(v) => onChange({ ...obj, TriggerOnExit: v })}
        />
      </div>
    </section>
  );
}

// ---------- Target (2) ----------

function TargetFields({
  obj,
  onChange,
}: {
  obj: TargetObjective;
  onChange: (next: Objective) => void;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );

  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Target (kill) parameters
      </Label>
      <Vec3Field
        label="Position"
        value={obj.Position}
        onChange={(v) => onChange({ ...obj, Position: v })}
      />
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Max distance"
          value={obj.MaxDistance}
          onChange={(n) => onChange({ ...obj, MaxDistance: n })}
        />
        <NumberField
          label="Min distance"
          value={obj.MinDistance}
          onChange={(n) => onChange({ ...obj, MinDistance: n })}
          hint="-1 = none"
        />
        <NumberField
          label="Amount"
          value={obj.Amount}
          onChange={(n) => onChange({ ...obj, Amount: n })}
        />
      </div>
      <LabeledTokens
        label="Target classnames (empty = any)"
        value={obj.ClassNames}
        onChange={(v) => onChange({ ...obj, ClassNames: v })}
        suggestions={knownClassnames}
      />
      <LabeledTokens
        label="Excluded classnames"
        value={obj.ExcludedClassNames}
        onChange={(v) => onChange({ ...obj, ExcludedClassNames: v })}
        suggestions={knownClassnames}
      />
      <LabeledTokens
        label="Allowed weapons"
        value={obj.AllowedWeapons}
        onChange={(v) => onChange({ ...obj, AllowedWeapons: v })}
        suggestions={knownClassnames}
      />
      <LabeledTokens
        label="Allowed damage zones"
        value={obj.AllowedDamageZones}
        onChange={(v) => onChange({ ...obj, AllowedDamageZones: v })}
      />
      <LabeledTokens
        label="Allowed target factions"
        value={obj.AllowedTargetFactions}
        onChange={(v) => onChange({ ...obj, AllowedTargetFactions: v })}
      />
      <div className="flex gap-4">
        <FlagField
          label="Count self-kill"
          value={obj.CountSelfKill}
          onChange={(v) => onChange({ ...obj, CountSelfKill: v })}
        />
        <FlagField
          label="Count AI players"
          value={obj.CountAIPlayers}
          onChange={(v) => onChange({ ...obj, CountAIPlayers: v })}
        />
      </div>
    </section>
  );
}

// ---------- Collection (4) / Delivery (5) — shared shape ----------

function CollectionFieldsCore({
  title,
  obj,
  onChange,
  includePosition,
}: {
  title: string;
  obj: CollectionObjective | DeliveryObjective;
  onChange: (next: Objective) => void;
  includePosition: boolean;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );
  const getMutedState = useMutedClassnameReason();

  const updateCollection = (idx: number, patch: Partial<CollectionItem>) => {
    const next = [...obj.Collections];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...obj, Collections: next });
  };
  const addCollection = () =>
    onChange({
      ...obj,
      Collections: [
        ...obj.Collections,
        {
          Amount: 1,
          ClassName: "",
          QuantityPercent: -1,
          MinQuantityPercent: -1,
        },
      ],
    });
  const removeCollection = (idx: number) =>
    onChange({
      ...obj,
      Collections: obj.Collections.filter((_, i) => i !== idx),
    });

  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </Label>
      <div className="space-y-2">
        {obj.Collections.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No items configured yet. Add one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {obj.Collections.map((c, idx) => (
              <li
                key={idx}
                className="grid grid-cols-[1fr_80px_100px_100px_auto] items-end gap-2 rounded-md border border-border/40 p-2 text-xs"
              >
                <div className="space-y-0.5">
                  <Label className="text-[10px]">Classname</Label>
                  <ClassnamePicker
                    value={c.ClassName}
                    onChange={(v) => updateCollection(idx, { ClassName: v })}
                    known={knownClassnames}
                    getMutedState={getMutedState}
                  />
                </div>
                <NumberField
                  label="Amount"
                  value={c.Amount}
                  onChange={(n) => updateCollection(idx, { Amount: n })}
                />
                <NumberField
                  label="Qty %"
                  value={c.QuantityPercent}
                  onChange={(n) =>
                    updateCollection(idx, { QuantityPercent: n })
                  }
                  hint="-1 = ignore"
                />
                <NumberField
                  label="Min qty %"
                  value={c.MinQuantityPercent}
                  onChange={(n) =>
                    updateCollection(idx, { MinQuantityPercent: n })
                  }
                  hint="-1 = ignore"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeCollection(idx)}
                >
                  <Trash2 className="h-3 w-3 text-severity-error" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={addCollection}
        >
          <Plus className="mr-1 h-3 w-3" /> Add item
        </Button>
      </div>

      {includePosition ? (
        <>
          <NumberField
            label="Max distance to target"
            value={(obj as DeliveryObjective).MaxDistance}
            onChange={(n) =>
              onChange({ ...obj, MaxDistance: n } as DeliveryObjective)
            }
          />
          <div className="space-y-1.5">
            <Label>Marker name</Label>
            <Input
              value={(obj as DeliveryObjective).MarkerName}
              onChange={(e) =>
                onChange({
                  ...obj,
                  MarkerName: e.target.value,
                } as DeliveryObjective)
              }
              className="h-8 text-xs"
            />
          </div>
        </>
      ) : (
        <FlagField
          label="Any collection completes"
          value={(obj as CollectionObjective).NeedAnyCollection}
          onChange={(v) =>
            onChange({
              ...obj,
              NeedAnyCollection: v,
            } as CollectionObjective)
          }
        />
      )}
      <div className="flex gap-4">
        <FlagField
          label="Show distance"
          value={obj.ShowDistance}
          onChange={(v) => onChange({ ...obj, ShowDistance: v })}
        />
        <FlagField
          label="Add leftovers to market zone"
          value={obj.AddItemsToNearbyMarketZone}
          onChange={(v) =>
            onChange({ ...obj, AddItemsToNearbyMarketZone: v })
          }
        />
      </div>
    </section>
  );
}

// ---------- AI VIP (9) ----------

function AIVIPFields({
  obj,
  onChange,
}: {
  obj: AIVIPObjective;
  onChange: (next: Objective) => void;
}) {
  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Escort / VIP
      </Label>
      <Vec3Field
        label="Escort destination"
        value={obj.Position}
        onChange={(v) => onChange({ ...obj, Position: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Max distance"
          value={obj.MaxDistance}
          onChange={(n) => onChange({ ...obj, MaxDistance: n })}
        />
        <div className="space-y-1.5">
          <Label>Marker name</Label>
          <Input
            value={obj.MarkerName}
            onChange={(e) => onChange({ ...obj, MarkerName: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>NPC classname</Label>
          <Input
            value={obj.NPCClassName}
            onChange={(e) =>
              onChange({ ...obj, NPCClassName: e.target.value })
            }
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label>NPC name</Label>
          <Input
            value={obj.NPCName}
            onChange={(e) => onChange({ ...obj, NPCName: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>NPC loadout file</Label>
        <LoadoutPicker
          value={obj.NPCLoadoutFile}
          onChange={(v) => onChange({ ...obj, NPCLoadoutFile: v })}
        />
      </div>
      <div className="flex gap-4">
        <FlagField
          label="Show distance"
          value={obj.ShowDistance}
          onChange={(v) => onChange({ ...obj, ShowDistance: v })}
        />
        <FlagField
          label="Loot AI after kill"
          value={obj.CanLootAI}
          onChange={(v) => onChange({ ...obj, CanLootAI: v })}
        />
      </div>
    </section>
  );
}

// ---------- Action (10) ----------

function ActionFields({
  obj,
  onChange,
}: {
  obj: ActionObjective;
  onChange: (next: Objective) => void;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );
  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Action
      </Label>
      <LabeledTokens
        label="Action names"
        value={obj.ActionNames}
        onChange={(v) => onChange({ ...obj, ActionNames: v })}
      />
      <LabeledTokens
        label="Allowed target classnames"
        value={obj.AllowedClassNames}
        onChange={(v) => onChange({ ...obj, AllowedClassNames: v })}
        suggestions={knownClassnames}
      />
      <LabeledTokens
        label="Excluded target classnames"
        value={obj.ExcludedClassNames}
        onChange={(v) => onChange({ ...obj, ExcludedClassNames: v })}
        suggestions={knownClassnames}
      />
      <NumberField
        label="Execution amount"
        value={obj.ExecutionAmount}
        onChange={(n) => onChange({ ...obj, ExecutionAmount: n })}
      />
    </section>
  );
}

// ---------- Crafting (11) ----------

function CraftingFields({
  obj,
  onChange,
}: {
  obj: CraftingObjective;
  onChange: (next: Objective) => void;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );
  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Crafting
      </Label>
      <LabeledTokens
        label="Item classnames to craft"
        value={obj.ItemNames}
        onChange={(v) => onChange({ ...obj, ItemNames: v })}
        suggestions={knownClassnames}
      />
      <NumberField
        label="Amount to craft"
        value={obj.ExecutionAmount}
        onChange={(n) => onChange({ ...obj, ExecutionAmount: n })}
      />
    </section>
  );
}

// ---------- TreasureHunt (6) ----------

const MARKER_VISIBILITY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "0 · hidden" },
  { value: 2, label: "2 · world only" },
  { value: 4, label: "4 · map only" },
  { value: 6, label: "6 · world + map" },
];

function TreasureHuntFields({
  obj,
  onChange,
}: {
  obj: TreasureHuntObjective;
  onChange: (next: Objective) => void;
}) {
  const updatePosition = (idx: number, next: Vec3) => {
    const positions = [...obj.Positions];
    positions[idx] = next;
    onChange({ ...obj, Positions: positions });
  };
  const addPosition = () =>
    onChange({ ...obj, Positions: [...obj.Positions, [0, 0, 0]] });
  const removePosition = (idx: number) =>
    onChange({ ...obj, Positions: obj.Positions.filter((_, i) => i !== idx) });

  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Treasure hunt
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Container classname</Label>
          <Input
            value={obj.ContainerName}
            onChange={(e) =>
              onChange({ ...obj, ContainerName: e.target.value })
            }
            placeholder="ExpansionQuestSeaChest"
            className="h-8 font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Must inherit <code>ExpansionQuestContainerBase</code>.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Marker name</Label>
          <Input
            value={obj.MarkerName}
            onChange={(e) => onChange({ ...obj, MarkerName: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Max distance (m)"
          value={obj.MaxDistance}
          onChange={(n) => onChange({ ...obj, MaxDistance: n })}
        />
        <NumberField
          label="Loot items amount"
          value={obj.LootItemsAmount}
          onChange={(n) => onChange({ ...obj, LootItemsAmount: n })}
          hint="0 = use full Loot[]"
        />
        <div className="space-y-1.5">
          <Label>Marker visibility</Label>
          <Select
            value={String(obj.MarkerVisibility)}
            onValueChange={(v) =>
              onChange({ ...obj, MarkerVisibility: Number(v) })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MARKER_VISIBILITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-4">
        <FlagField
          label="Show distance"
          value={obj.ShowDistance}
          onChange={(v) => onChange({ ...obj, ShowDistance: v })}
        />
        <FlagField
          label="Dig as underground stash"
          value={obj.DigInStash}
          onChange={(v) => onChange({ ...obj, DigInStash: v })}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Label>Candidate positions ({obj.Positions.length})</Label>
          <p className="text-[10px] text-muted-foreground">
            Expansion picks one at quest start — supply several for
            randomised hunts.
          </p>
        </div>
        {obj.Positions.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No positions yet. Add one below.
          </p>
        ) : (
          <ul className="space-y-1">
            {obj.Positions.map((p, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded-md border border-border/40 px-2 py-1 text-xs"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  #{idx + 1}
                </span>
                <div className="flex-1">
                  <Vec3Field
                    label=""
                    value={p}
                    onChange={(next) => updatePosition(idx, next)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removePosition(idx)}
                >
                  <Trash2 className="h-3 w-3 text-severity-error" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={addPosition}
        >
          <Plus className="mr-1 h-3 w-3" /> Add position
        </Button>
      </div>
    </section>
  );
}

// ---------- AI Patrol (7) ----------

function AIPatrolFields({
  obj,
  onChange,
}: {
  obj: AIPatrolObjective;
  onChange: (next: Objective) => void;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );
  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        AI patrol
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Max distance"
          value={obj.MaxDistance}
          onChange={(n) => onChange({ ...obj, MaxDistance: n })}
          hint="-1 = any"
        />
        <NumberField
          label="Min distance"
          value={obj.MinDistance}
          onChange={(n) => onChange({ ...obj, MinDistance: n })}
          hint="-1 = any"
        />
      </div>
      <LabeledTokens
        label="Allowed weapons (empty = any)"
        value={obj.AllowedWeapons}
        onChange={(v) => onChange({ ...obj, AllowedWeapons: v })}
        suggestions={knownClassnames}
      />
      <LabeledTokens
        label="Allowed damage zones"
        value={obj.AllowedDamageZones}
        onChange={(v) => onChange({ ...obj, AllowedDamageZones: v })}
      />
      <AISpawnSubForm
        title="Patrol group"
        spawn={obj.AISpawn}
        onChange={(next) => onChange({ ...obj, AISpawn: next })}
      />
    </section>
  );
}

// ---------- AI Camp (8) ----------

function AICampFields({
  obj,
  onChange,
}: {
  obj: AICampObjective;
  onChange: (next: Objective) => void;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );

  const updateSpawn = (idx: number, next: AISpawnBlock) => {
    const list = [...obj.AISpawns];
    list[idx] = next;
    onChange({ ...obj, AISpawns: list });
  };
  const addSpawn = () =>
    onChange({
      ...obj,
      AISpawns: [...obj.AISpawns, emptySpawn()],
    });
  const removeSpawn = (idx: number) =>
    onChange({
      ...obj,
      AISpawns: obj.AISpawns.filter((_, i) => i !== idx),
    });

  return (
    <section className="space-y-3 rounded-md border border-border/60 p-3">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        AI camp
      </Label>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Max distance"
          value={obj.MaxDistance}
          onChange={(n) => onChange({ ...obj, MaxDistance: n })}
          hint="-1 = any"
        />
        <NumberField
          label="Min distance"
          value={obj.MinDistance}
          onChange={(n) => onChange({ ...obj, MinDistance: n })}
          hint="-1 = any"
        />
        <NumberField
          label="Infected cleanup radius"
          value={obj.InfectedDeletionRadius}
          onChange={(n) => onChange({ ...obj, InfectedDeletionRadius: n })}
          hint="0 = none"
        />
      </div>
      <LabeledTokens
        label="Allowed weapons (empty = any)"
        value={obj.AllowedWeapons}
        onChange={(v) => onChange({ ...obj, AllowedWeapons: v })}
        suggestions={knownClassnames}
      />
      <LabeledTokens
        label="Allowed damage zones"
        value={obj.AllowedDamageZones}
        onChange={(v) => onChange({ ...obj, AllowedDamageZones: v })}
      />
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Spawn groups ({obj.AISpawns.length})</Label>
          <p className="text-[10px] text-muted-foreground">
            Each group is one patrol/squad within the camp.
          </p>
        </div>
        {obj.AISpawns.length === 0 ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            No spawn groups yet. Camps need at least one.
          </p>
        ) : (
          <ul className="space-y-2">
            {obj.AISpawns.map((s, idx) => (
              <li key={idx} className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 z-10 h-6 w-6"
                  onClick={() => removeSpawn(idx)}
                  title="Remove this spawn group"
                >
                  <Trash2 className="h-3 w-3 text-severity-error" />
                </Button>
                <AISpawnSubForm
                  title={`Group #${idx + 1}`}
                  spawn={s}
                  onChange={(next) => updateSpawn(idx, next)}
                />
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={addSpawn}
        >
          <Plus className="mr-1 h-3 w-3" /> Add spawn group
        </Button>
      </div>
    </section>
  );
}

function emptySpawn(): AISpawnBlock {
  return {
    Name: "",
    Persist: 0,
    Faction: "",
    Formation: "Vee",
    FormationScale: 1.5,
    FormationLooseness: 0,
    Loadout: "",
    Units: [],
    NumberOfAI: 1,
    Behaviour: "HALT",
    Speed: "WALK",
    UnderThreatSpeed: "SPRINT",
    CanBeLooted: 1,
    UnlimitedReload: 0,
    MinAccuracy: 0.2,
    MaxAccuracy: 0.4,
    ThreatDistanceLimit: 300,
    DamageMultiplier: 1,
    DamageReceivedMultiplier: 1,
    SniperProneDistanceThreshold: 60,
    RespawnTime: -1,
    DespawnTime: -1,
    MinDistanceRadius: 10,
    MaxDistanceRadius: 200,
    DespawnRadius: 600,
    Waypoints: [],
  };
}

// ---------- Shared AI spawn block sub-form ----------

const AI_BEHAVIOURS = [
  "HALT",
  "ONCE",
  "LOOP",
  "ALTERNATE",
  "LOOP_OR_ALTERNATE",
  "HALT_OR_ALTERNATE",
  "HALT_OR_LOOP",
  "ROAMING",
  "ROAMING_LOCAL",
] as const;
const AI_SPEEDS = [
  "STATIC",
  "WALK",
  "JOG",
  "SPRINT",
  "RANDOM",
  "RANDOM_NONSTATIC",
] as const;
const AI_FORMATIONS = [
  "Vee",
  "Column",
  "Line",
  "File",
  "Wedge",
  "Diamond",
  "RANDOM",
] as const;

function AISpawnSubForm({
  title,
  spawn,
  onChange,
}: {
  title: string;
  spawn: AISpawnBlock;
  onChange: (next: AISpawnBlock) => void;
}) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name),
    [items.data?.items],
  );
  const patch = <K extends keyof AISpawnBlock>(
    key: K,
    value: AISpawnBlock[K],
  ) => onChange({ ...spawn, [key]: value });

  return (
    <div className="space-y-3 rounded-md border border-border/40 bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {title}
        </Label>
        {spawn.Waypoints.length > 0 ? (
          <Badge variant="secondary" className="text-[10px]">
            {spawn.Waypoints.length} waypoint
            {spawn.Waypoints.length === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={spawn.Name}
            onChange={(e) => patch("Name", e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <NumberField
          label="Number of AI"
          value={spawn.NumberOfAI}
          onChange={(n) => patch("NumberOfAI", n)}
          hint="negative = random 1..|N|"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Faction</Label>
          <FactionPicker
            value={spawn.Faction}
            onChange={(v) => patch("Faction", v)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Loadout</Label>
          <LoadoutPicker
            value={spawn.Loadout}
            onChange={(v) => patch("Loadout", v)}
          />
        </div>
      </div>
      <LabeledTokens
        label="Unit classnames (empty = random from faction)"
        value={spawn.Units}
        onChange={(v) => patch("Units", v)}
        suggestions={knownClassnames}
      />
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Behaviour</Label>
          <Select
            value={spawn.Behaviour}
            onValueChange={(v) => patch("Behaviour", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_BEHAVIOURS.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Speed</Label>
          <Select
            value={spawn.Speed}
            onValueChange={(v) => patch("Speed", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_SPEEDS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Under threat speed</Label>
          <Select
            value={spawn.UnderThreatSpeed}
            onValueChange={(v) => patch("UnderThreatSpeed", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_SPEEDS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Formation</Label>
          <Select
            value={spawn.Formation}
            onValueChange={(v) => patch("Formation", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_FORMATIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <NumberField
          label="Formation scale"
          value={spawn.FormationScale}
          onChange={(n) => patch("FormationScale", n)}
        />
        <NumberField
          label="Formation looseness"
          value={spawn.FormationLooseness}
          onChange={(n) => patch("FormationLooseness", n)}
        />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <NumberField
          label="Min accuracy"
          value={spawn.MinAccuracy}
          onChange={(n) => patch("MinAccuracy", n)}
        />
        <NumberField
          label="Max accuracy"
          value={spawn.MaxAccuracy}
          onChange={(n) => patch("MaxAccuracy", n)}
        />
        <NumberField
          label="Damage ×"
          value={spawn.DamageMultiplier}
          onChange={(n) => patch("DamageMultiplier", n)}
        />
        <NumberField
          label="Received ×"
          value={spawn.DamageReceivedMultiplier}
          onChange={(n) => patch("DamageReceivedMultiplier", n)}
        />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <NumberField
          label="Threat distance"
          value={spawn.ThreatDistanceLimit}
          onChange={(n) => patch("ThreatDistanceLimit", n)}
        />
        <NumberField
          label="Min dist radius"
          value={spawn.MinDistanceRadius}
          onChange={(n) => patch("MinDistanceRadius", n)}
        />
        <NumberField
          label="Max dist radius"
          value={spawn.MaxDistanceRadius}
          onChange={(n) => patch("MaxDistanceRadius", n)}
        />
        <NumberField
          label="Despawn radius"
          value={spawn.DespawnRadius}
          onChange={(n) => patch("DespawnRadius", n)}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Respawn time (s)"
          value={spawn.RespawnTime}
          onChange={(n) => patch("RespawnTime", n)}
          hint="-1 = no respawn"
        />
        <NumberField
          label="Despawn time (s)"
          value={spawn.DespawnTime}
          onChange={(n) => patch("DespawnTime", n)}
          hint="-1 = never"
        />
        <NumberField
          label="Prone sniper threshold"
          value={spawn.SniperProneDistanceThreshold}
          onChange={(n) => patch("SniperProneDistanceThreshold", n)}
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <FlagField
          label="Can be looted"
          value={spawn.CanBeLooted}
          onChange={(v) => patch("CanBeLooted", v)}
        />
        <FlagField
          label="Unlimited reload"
          value={spawn.UnlimitedReload}
          onChange={(v) => patch("UnlimitedReload", v)}
        />
        <FlagField
          label="Persist"
          value={spawn.Persist}
          onChange={(v) => patch("Persist", v)}
        />
      </div>
      <p className="rounded-md border border-dashed px-3 py-1.5 text-[10px] text-muted-foreground">
        Waypoint coordinates live on the{" "}
        <strong>Raw JSON</strong> tab — visual waypoint editing comes
        as part of the AI-patrol map layer in a later slice. Unknown
        fields round-trip unchanged.
      </p>
    </div>
  );
}

// ---------- Shared field helpers ----------

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="h-8 font-mono text-xs"
      />
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function FlagField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <Switch
        checked={value === 1}
        onCheckedChange={(c) => onChange(c ? 1 : 0)}
      />
      {label}
    </label>
  );
}

function LabeledTokens({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <TokenInput
        value={value}
        onChange={onChange}
        suggestions={suggestions}
      />
    </div>
  );
}

function Vec3Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {(["X", "Y", "Z"] as const).map((axis, i) => (
          <Input
            key={axis}
            type="number"
            value={value[i]}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (!Number.isFinite(n)) return;
              const next: Vec3 = [...value] as Vec3;
              next[i] = n;
              onChange(next);
            }}
            placeholder={axis}
            className="h-8 font-mono text-xs"
          />
        ))}
      </div>
    </div>
  );
}
