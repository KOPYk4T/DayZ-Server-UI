import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Heart,
  Info,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Save,
  Shirt,
  Sparkles,
  Trash2,
  Users,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LoadoutPicker } from "@/features/mods/expansion/pickers/LoadoutPicker";
import { useItemsSnapshot } from "@/hooks/useItems";
import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import { cn, errorMessage } from "@/lib/utils";

import {
  DEFAULT_SPAWN_SETTINGS,
  EMPTY_CLOTHING,
  EMPTY_STARTING_GEAR,
  defaultGearItem,
  isGearItemSet,
  parseSpawnSettings,
  serializeSpawnSettings,
  type SpawnClothing,
  type SpawnGearItem,
  type SpawnLoadoutRef,
  type SpawnSettings,
  type SpawnStartingGear,
} from "../spawnselection/types";

/**
 * Player spawn gear editor — typed view over every non-location
 * field in `SpawnSettings.json`. Covers the three player-gear
 * layers:
 *   1. Custom clothing (11 per-slot classname pools).
 *   2. Starting gear (4 pool tables + primary / secondary weapon).
 *   3. Loadouts mode — when `UseLoadouts: 1`, the clothing / gear
 *      arrays are ignored and Expansion picks from
 *      `MaleLoadouts[]` / `FemaleLoadouts[]` (refs into
 *      `ExpansionMod/Loadouts/*.json`, shared with AI).
 *
 * Spawn locations still live on the Map editor's Spawn Selection
 * layer; this page never touches `SpawnLocations[]`.
 */

const CLOTHING_SLOTS: Array<{ key: keyof SpawnClothing; label: string }> = [
  { key: "Headgear", label: "Headgear" },
  { key: "Glasses", label: "Glasses" },
  { key: "Masks", label: "Masks" },
  { key: "Tops", label: "Tops" },
  { key: "Vests", label: "Vests" },
  { key: "Gloves", label: "Gloves" },
  { key: "Pants", label: "Pants" },
  { key: "Belts", label: "Belts" },
  { key: "Shoes", label: "Shoes" },
  { key: "Armbands", label: "Armbands" },
  { key: "Backpacks", label: "Backpacks" },
];

const GEAR_POOLS: Array<{
  key: keyof Pick<
    SpawnStartingGear,
    "UpperGear" | "PantsGear" | "BackpackGear" | "VestGear"
  >;
  label: string;
  hint: string;
}> = [
  { key: "UpperGear", label: "Upper gear", hint: "Top / jacket pockets." },
  { key: "PantsGear", label: "Pants gear", hint: "Pants pockets." },
  { key: "BackpackGear", label: "Backpack gear", hint: "Goes in the backpack cargo." },
  { key: "VestGear", label: "Vest gear", hint: "Goes in the vest cargo." },
];

export function PlayerSpawnGearPage() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const filePath = useMemo(() => {
    const mpRel = active?.paths.mpmissionsRelative.replace(/\/$/, "");
    return mpRel ? `${mpRel}/expansion/settings/SpawnSettings.json` : null;
  }, [active?.paths.mpmissionsRelative]);

  const query = useQuery<SpawnSettings | null>({
    queryKey:
      profileId && filePath
        ? ["spawn-settings", profileId, filePath]
        : ["none"],
    queryFn: async () => {
      try {
        const raw = await tauri.expansionMissionRead(profileId!, filePath!);
        return parseSpawnSettings(raw);
      } catch {
        return null;
      }
    },
    enabled: !!(profileId && filePath),
    staleTime: 5_000,
  });

  const save = useMutation({
    mutationFn: async (next: SpawnSettings) => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeSpawnSettings(next),
      );
    },
    onSuccess: (_r, next) => {
      if (!profileId || !filePath) return;
      qc.setQueryData(["spawn-settings", profileId, filePath], next);
      toast.success("SpawnSettings.json saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createFile = useMutation({
    mutationFn: async () => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeSpawnSettings(DEFAULT_SPAWN_SETTINGS),
      );
    },
    onSuccess: () => {
      if (!profileId || !filePath) return;
      qc.setQueryData(
        ["spawn-settings", profileId, filePath],
        DEFAULT_SPAWN_SETTINGS,
      );
      toast.success("SpawnSettings.json created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [draft, setDraft] = useState<SpawnSettings | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data, filePath]);

  const dirty =
    query.data != null &&
    draft != null &&
    JSON.stringify(draft) !== JSON.stringify(query.data);

  if (!active) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a profile first.
      </div>
    );
  }

  if (!active.paths.mpmissionsRelative) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Breadcrumb />
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Profile is missing the <code>mpmissionsRelative</code>{" "}
            path. Set it on the profile editor before editing
            spawn settings.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <Breadcrumb />
      <header className="flex items-center gap-2">
        <Shirt className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Player spawn gear</h1>
        <p className="ml-2 text-xs text-muted-foreground">
          Everything in <code>SpawnSettings.json</code> that isn't a
          map location.
        </p>
        <div className="ml-auto flex items-center gap-2">
          {dirty ? (
            <Badge
              variant="outline"
              className="border-severity-warning/40 text-severity-warning"
            >
              unsaved
            </Badge>
          ) : null}
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
            onClick={() => draft && save.mutate(draft)}
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
      </header>

      {query.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !query.data ? (
        <MissingFileCard
          onCreate={() => createFile.mutate()}
          creating={createFile.isPending}
        />
      ) : draft ? (
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1">
          <ModeIndicator draft={draft} setDraft={setDraft} />
          <ClothingSection draft={draft} setDraft={setDraft} />
          <StartingGearSection draft={draft} setDraft={setDraft} />
          <LoadoutsSection draft={draft} setDraft={setDraft} />
          <MiscSection draft={draft} setDraft={setDraft} />
        </div>
      ) : null}
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        to="/app/mods"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60"
      >
        <ArrowLeft className="h-3 w-3" /> Mods
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <Link to="/app/mods/expansion" className="hover:underline">
        Expansion
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">Player spawn gear</span>
    </nav>
  );
}

function MissingFileCard({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Shirt className="h-8 w-8 opacity-40" />
      <p className="font-medium">No SpawnSettings.json yet</p>
      <p className="max-w-md text-xs">
        Expansion writes this file on first server boot. You can
        create it from defaults right now — empty clothing / gear
        pools, loadouts mode off, standard respawn cooldowns.
      </p>
      <Button type="button" size="sm" onClick={onCreate} disabled={creating}>
        {creating ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Plus className="mr-1 h-3 w-3" />
        )}
        Create defaults
      </Button>
    </div>
  );
}

// ---------- Mode indicator ----------

function ModeIndicator({
  draft,
  setDraft,
}: {
  draft: SpawnSettings;
  setDraft: (next: SpawnSettings) => void;
}) {
  const useLoadouts = draft.UseLoadouts === 1;
  const clothingEnabled = draft.StartingClothing?.EnableCustomClothing === 1;
  const gearEnabled = draft.StartingGear?.EnableStartingGear === 1;

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" /> What players
          spawn with
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {useLoadouts ? (
          <Alert className="border-primary/40 bg-primary/5">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-xs">
              <strong>Loadouts mode.</strong> Custom clothing and
              starting gear arrays below are <em>ignored</em>.
              Expansion picks a loadout from{" "}
              <strong>MaleLoadouts</strong> /{" "}
              <strong>FemaleLoadouts</strong> (sampled by chance),
              each referencing{" "}
              <Link
                to="/app/mods/expansion/loadouts"
                className="underline-offset-2 hover:underline"
              >
                ExpansionMod/Loadouts/*.json
              </Link>{" "}
              — the same files the AI module uses.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-severity-success/40 bg-severity-success/5">
            <Info className="h-4 w-4 text-severity-success" />
            <AlertDescription className="text-xs">
              <strong>Arrays mode.</strong> Players spawn with one
              classname picked from each non-empty clothing slot
              {clothingEnabled ? "" : " (disabled — slots skipped)"}{" "}
              plus every item in the starting-gear pools
              {gearEnabled ? "" : " (disabled — no gear given)"}.
              Loadouts mode is off.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 p-2">
          <Switch
            id="use-loadouts"
            checked={useLoadouts}
            onCheckedChange={(v) =>
              setDraft({ ...draft, UseLoadouts: v ? 1 : 0 })
            }
          />
          <div className="flex-1">
            <Label htmlFor="use-loadouts" className="cursor-pointer text-xs">
              Use loadouts mode
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Swap the per-slot arrays for full AI-style loadout
              files.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="enable-spawn-selection"
              checked={draft.EnableSpawnSelection === 1}
              onCheckedChange={(v) =>
                setDraft({ ...draft, EnableSpawnSelection: v ? 1 : 0 })
              }
            />
            <Label
              htmlFor="enable-spawn-selection"
              className="cursor-pointer text-xs"
            >
              Spawn selection
            </Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch
              id="spawn-on-territory"
              checked={draft.SpawnOnTerritory === 1}
              onCheckedChange={(v) =>
                setDraft({ ...draft, SpawnOnTerritory: v ? 1 : 0 })
              }
            />
            <Label
              htmlFor="spawn-on-territory"
              className="cursor-pointer text-xs"
            >
              Spawn on territory
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Clothing ----------

function ClothingSection({
  draft,
  setDraft,
}: {
  draft: SpawnSettings;
  setDraft: (next: SpawnSettings) => void;
}) {
  const clothing = draft.StartingClothing ?? { ...EMPTY_CLOTHING };
  const patch = (p: Partial<SpawnClothing>) =>
    setDraft({
      ...draft,
      StartingClothing: { ...clothing, ...p } as SpawnClothing,
    });
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );
  const dim = draft.UseLoadouts === 1;

  return (
    <Card className={cn(dim && "opacity-60")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shirt className="h-4 w-4 text-primary" /> Custom clothing
          <Badge variant="outline" className="font-mono text-[10px]">
            {CLOTHING_SLOTS.reduce(
              (n, s) => n + ((clothing[s.key] as string[] | undefined)?.length ?? 0),
              0,
            )}{" "}
            entries
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {dim ? (
          <p className="text-[11px] italic text-muted-foreground">
            Disabled by <em>Use loadouts mode</em>. Edits still
            round-trip on save.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-4">
          <FlagField
            id="clothing-enable"
            label="Enable custom clothing"
            value={clothing.EnableCustomClothing ?? 0}
            onChange={(v) => patch({ EnableCustomClothing: v })}
          />
          <FlagField
            id="clothing-random-health"
            label="Randomise clothing health"
            value={clothing.SetRandomHealth ?? 0}
            onChange={(v) => patch({ SetRandomHealth: v })}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {CLOTHING_SLOTS.map((slot) => (
            <ClassnameList
              key={slot.key}
              label={slot.label}
              value={(clothing[slot.key] as string[] | undefined) ?? []}
              onChange={(v) =>
                patch({ [slot.key]: v } as Partial<SpawnClothing>)
              }
              knownClassnames={knownClassnames}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ClassnameList({
  label,
  value,
  onChange,
  knownClassnames,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  knownClassnames: string[];
}) {
  const addRow = () => onChange([...value, ""]);
  const setRow = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };
  const removeRow = (i: number) =>
    onChange(value.filter((_, j) => j !== i));
  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Label className="text-[11px] font-semibold">{label}</Label>
        <Badge variant="outline" className="font-mono text-[10px]">
          {value.length}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5 text-[10px]"
          onClick={addRow}
        >
          <Plus className="mr-0.5 h-3 w-3" /> Add
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[10px] italic text-muted-foreground">
          Empty — slot stays bare.
        </p>
      ) : (
        <ul className="space-y-1">
          {value.map((v, i) => (
            <li key={i} className="flex items-center gap-1">
              <ClassnamePicker
                value={v}
                onChange={(next) => setRow(i, next)}
                known={knownClassnames}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-severity-error"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Starting gear ----------

function StartingGearSection({
  draft,
  setDraft,
}: {
  draft: SpawnSettings;
  setDraft: (next: SpawnSettings) => void;
}) {
  const gear = draft.StartingGear ?? { ...EMPTY_STARTING_GEAR };
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );
  const patch = (p: Partial<SpawnStartingGear>) =>
    setDraft({
      ...draft,
      StartingGear: { ...gear, ...p } as SpawnStartingGear,
    });
  const dim = draft.UseLoadouts === 1;
  const totalRows = GEAR_POOLS.reduce(
    (n, p) => n + ((gear[p.key] as SpawnGearItem[]).length ?? 0),
    0,
  );

  return (
    <Card className={cn(dim && "opacity-60")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Package className="h-4 w-4 text-primary" /> Starting gear
          <Badge variant="outline" className="font-mono text-[10px]">
            {totalRows} items
            {isGearItemSet(gear.PrimaryWeapon) ? " · +primary" : ""}
            {isGearItemSet(gear.SecondaryWeapon) ? " · +secondary" : ""}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {dim ? (
          <p className="text-[11px] italic text-muted-foreground">
            Disabled by <em>Use loadouts mode</em>. Edits still
            round-trip on save.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-4">
          <FlagField
            id="gear-enable"
            label="Enable starting gear"
            value={gear.EnableStartingGear ?? 0}
            onChange={(v) => patch({ EnableStartingGear: v })}
          />
          <FlagField
            id="gear-energy-sources"
            label="Apply energy sources"
            value={gear.ApplyEnergySources ?? 0}
            onChange={(v) => patch({ ApplyEnergySources: v })}
          />
          <FlagField
            id="gear-random-health"
            label="Randomise gear health"
            value={gear.SetRandomHealth ?? 0}
            onChange={(v) => patch({ SetRandomHealth: v })}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {GEAR_POOLS.map((pool) => (
            <GearPool
              key={pool.key}
              label={pool.label}
              hint={pool.hint}
              value={gear[pool.key] as SpawnGearItem[]}
              onChange={(v) =>
                patch({ [pool.key]: v } as Partial<SpawnStartingGear>)
              }
              knownClassnames={knownClassnames}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SingleWeapon
            label="Primary weapon"
            value={gear.PrimaryWeapon}
            onChange={(v) => patch({ PrimaryWeapon: v })}
            knownClassnames={knownClassnames}
          />
          <SingleWeapon
            label="Secondary weapon"
            value={gear.SecondaryWeapon}
            onChange={(v) => patch({ SecondaryWeapon: v })}
            knownClassnames={knownClassnames}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function GearPool({
  label,
  hint,
  value,
  onChange,
  knownClassnames,
}: {
  label: string;
  hint: string;
  value: SpawnGearItem[];
  onChange: (next: SpawnGearItem[]) => void;
  knownClassnames: string[];
}) {
  const addItem = () => onChange([...value, defaultGearItem()]);
  const updateItem = (i: number, next: SpawnGearItem) => {
    const arr = [...value];
    arr[i] = next;
    onChange(arr);
  };
  const removeItem = (i: number) =>
    onChange(value.filter((_, j) => j !== i));
  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Label className="text-[11px] font-semibold">{label}</Label>
        <Badge variant="outline" className="font-mono text-[10px]">
          {value.length}
        </Badge>
        <span className="truncate text-[10px] italic text-muted-foreground">
          {hint}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5 text-[10px]"
          onClick={addItem}
        >
          <Plus className="mr-0.5 h-3 w-3" /> Add
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[10px] italic text-muted-foreground">
          Empty pool.
        </p>
      ) : (
        <ul className="space-y-1">
          {value.map((it, i) => (
            <li key={i}>
              <GearItemRow
                item={it}
                onChange={(next) => updateItem(i, next)}
                onRemove={() => removeItem(i)}
                knownClassnames={knownClassnames}
                depth={0}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SingleWeapon({
  label,
  value,
  onChange,
  knownClassnames,
}: {
  label: string;
  value: SpawnGearItem | Record<string, never>;
  onChange: (next: SpawnGearItem | Record<string, never>) => void;
  knownClassnames: string[];
}) {
  const set = isGearItemSet(value) ? value : null;
  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Label className="text-[11px] font-semibold">{label}</Label>
        {set ? null : (
          <Badge
            variant="outline"
            className="text-[10px] text-muted-foreground"
          >
            unset
          </Badge>
        )}
        <div className="ml-auto">
          {set ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-severity-error"
              onClick={() => onChange({})}
            >
              <Trash2 className="mr-0.5 h-3 w-3" /> Clear
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[10px]"
              onClick={() => onChange(defaultGearItem())}
            >
              <Plus className="mr-0.5 h-3 w-3" /> Set
            </Button>
          )}
        </div>
      </div>
      {set ? (
        <GearItemRow
          item={set}
          onChange={(next) => onChange(next)}
          onRemove={() => onChange({})}
          knownClassnames={knownClassnames}
          depth={0}
        />
      ) : (
        <p className="text-[10px] italic text-muted-foreground">
          No weapon. Click Set to pick one.
        </p>
      )}
    </div>
  );
}

/** Maximum recursive depth the typed editor renders for attached
 *  sub-items. Realistic DayZ chains are 2-3 deep (weapon → mag →
 *  bullets, vest → holster → pistol → mag) — 4 covers everything
 *  we've seen. Deeper nesting still round-trips, just without a
 *  typed form. */
const MAX_ATTACHMENT_DEPTH = 4;

function GearItemRow({
  item,
  onChange,
  onRemove,
  knownClassnames,
  depth,
}: {
  item: SpawnGearItem;
  onChange: (next: SpawnGearItem) => void;
  onRemove: () => void;
  knownClassnames: string[];
  depth: number;
}) {
  const addAttachment = () =>
    onChange({
      ...item,
      Attachments: [...item.Attachments, defaultGearItem()],
    });
  const updateAttachment = (i: number, next: SpawnGearItem) => {
    const arr = [...item.Attachments];
    arr[i] = next;
    onChange({ ...item, Attachments: arr });
  };
  const removeAttachment = (i: number) =>
    onChange({
      ...item,
      Attachments: item.Attachments.filter((_, j) => j !== i),
    });
  const tooDeep = depth >= MAX_ATTACHMENT_DEPTH;

  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-background p-1.5">
      <div className="flex items-center gap-1">
        <ClassnamePicker
          value={item.ClassName}
          onChange={(v) => onChange({ ...item, ClassName: v })}
          known={knownClassnames}
          className="flex-1"
        />
        <Input
          type="number"
          value={item.Quantity}
          onChange={(e) =>
            onChange({ ...item, Quantity: Number(e.target.value) })
          }
          className="h-7 w-16 text-right text-xs"
          title="-1 = fill to max (stackables)"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-severity-error"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {tooDeep ? (
        item.Attachments.length > 0 ? (
          <p className="text-[10px] italic text-severity-warning">
            {item.Attachments.length} attachment
            {item.Attachments.length === 1 ? "" : "s"} preserved but
            not rendered (depth {depth} ≥ {MAX_ATTACHMENT_DEPTH}).
          </p>
        ) : null
      ) : (
        <div className="ml-4 space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-[10px] text-muted-foreground">
              Attachments
            </Label>
            <Badge variant="outline" className="font-mono text-[9px]">
              {item.Attachments.length}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-5 px-1 text-[10px]"
              onClick={addAttachment}
            >
              <Plus className="mr-0.5 h-2.5 w-2.5" /> Attach
            </Button>
          </div>
          {item.Attachments.length > 0 ? (
            <ul className="space-y-1">
              {item.Attachments.map((att, i) => (
                <li key={i}>
                  <GearItemRow
                    item={att}
                    onChange={(next) => updateAttachment(i, next)}
                    onRemove={() => removeAttachment(i)}
                    knownClassnames={knownClassnames}
                    depth={depth + 1}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ---------- Loadouts mode ----------

function LoadoutsSection({
  draft,
  setDraft,
}: {
  draft: SpawnSettings;
  setDraft: (next: SpawnSettings) => void;
}) {
  const active = draft.UseLoadouts === 1;
  return (
    <Card className={cn(!active && "opacity-70")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" /> Loadouts mode
          <Badge
            variant={active ? "default" : "outline"}
            className={cn(
              "text-[10px]",
              active && "bg-primary",
            )}
          >
            {active ? "active" : "off"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!active ? (
          <p className="text-[11px] italic text-muted-foreground">
            Toggle <em>Use loadouts mode</em> above to make these
            lists drive what players spawn with. Edits below still
            round-trip on save.
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <LoadoutList
            label="Male loadouts"
            value={draft.MaleLoadouts ?? []}
            onChange={(v) => setDraft({ ...draft, MaleLoadouts: v })}
          />
          <LoadoutList
            label="Female loadouts"
            value={draft.FemaleLoadouts ?? []}
            onChange={(v) => setDraft({ ...draft, FemaleLoadouts: v })}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Each entry references{" "}
          <code>profiles/ExpansionMod/Loadouts/&lt;Loadout&gt;.json</code>
          . Edit the files themselves on the{" "}
          <Link
            to="/app/mods/expansion/loadouts"
            className="underline-offset-2 hover:underline"
          >
            AI loadouts
          </Link>{" "}
          page — same shape, shared with AI bots.
        </p>
      </CardContent>
    </Card>
  );
}

function LoadoutList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: SpawnLoadoutRef[];
  onChange: (next: SpawnLoadoutRef[]) => void;
}) {
  const addRow = () =>
    onChange([...value, { Loadout: "", Chance: 1.0 }]);
  const updateRow = (i: number, patch: Partial<SpawnLoadoutRef>) => {
    const arr = [...value];
    arr[i] = { ...arr[i], ...patch };
    onChange(arr);
  };
  const removeRow = (i: number) =>
    onChange(value.filter((_, j) => j !== i));
  const totalChance = value.reduce((n, r) => n + (r.Chance || 0), 0);

  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Label className="text-[11px] font-semibold">{label}</Label>
        <Badge variant="outline" className="font-mono text-[10px]">
          {value.length}
        </Badge>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          Σ chance = {totalChance.toFixed(2)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-1.5 text-[10px]"
          onClick={addRow}
        >
          <Plus className="mr-0.5 h-3 w-3" /> Add
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-[10px] italic text-muted-foreground">
          Empty list — players of this gender never spawn via
          loadouts mode.
        </p>
      ) : (
        <ul className="space-y-1">
          {value.map((row, i) => (
            <li key={i} className="flex items-center gap-1">
              <LoadoutPicker
                value={row.Loadout}
                onChange={(v) => updateRow(i, { Loadout: v })}
                className="flex-1"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={row.Chance}
                onChange={(e) =>
                  updateRow(i, { Chance: Number(e.target.value) })
                }
                className="h-7 w-16 text-right text-xs"
                title="Relative weight (not normalised by Expansion)"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-severity-error"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Misc ----------

function MiscSection({
  draft,
  setDraft,
}: {
  draft: SpawnSettings;
  setDraft: (next: SpawnSettings) => void;
}) {
  const patch = (p: Partial<SpawnSettings>) => setDraft({ ...draft, ...p });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Heart className="h-4 w-4 text-primary" /> Cooldowns, stats
          &amp; misc
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <NumberField
            label="Spawn health"
            value={draft.SpawnHealthValue ?? 0}
            onChange={(v) => patch({ SpawnHealthValue: v })}
            hint="0 — 100"
          />
          <NumberField
            label="Spawn energy"
            value={draft.SpawnEnergyValue ?? 0}
            onChange={(v) => patch({ SpawnEnergyValue: v })}
          />
          <NumberField
            label="Spawn water"
            value={draft.SpawnWaterValue ?? 0}
            onChange={(v) => patch({ SpawnWaterValue: v })}
          />
          <FlagField
            id="death-marker"
            label="Create death marker"
            value={draft.CreateDeathMarker ?? 0}
            onChange={(v) => patch({ CreateDeathMarker: v })}
          />
        </div>

        <div className="rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="flex items-center gap-3">
            <FlagField
              id="respawn-cooldowns"
              label="Enable respawn cooldowns"
              value={draft.EnableRespawnCooldowns ?? 0}
              onChange={(v) => patch({ EnableRespawnCooldowns: v })}
            />
            <FlagField
              id="punish-multispawn"
              label="Punish multi-spawn"
              value={draft.PunishMultispawn ?? 0}
              onChange={(v) => patch({ PunishMultispawn: v })}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <NumberField
              label="Respawn cooldown"
              unit="s"
              value={draft.RespawnCooldown ?? 0}
              onChange={(v) => patch({ RespawnCooldown: v })}
            />
            <NumberField
              label="Territory respawn cd"
              unit="s"
              value={draft.TerritoryRespawnCooldown ?? 0}
              onChange={(v) => patch({ TerritoryRespawnCooldown: v })}
            />
            <NumberField
              label="Punish cooldown"
              unit="s"
              value={draft.PunishCooldown ?? 0}
              onChange={(v) => patch({ PunishCooldown: v })}
            />
            <NumberField
              label="Punish timeframe"
              unit="s"
              value={draft.PunishTimeframe ?? 0}
              onChange={(v) => patch({ PunishTimeframe: v })}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="bg-image-path" className="text-xs">
            Background image path
          </Label>
          <Input
            id="bg-image-path"
            value={draft.BackgroundImagePath ?? ""}
            onChange={(e) =>
              patch({ BackgroundImagePath: e.target.value })
            }
            placeholder="DayZExpansion/SpawnSelection/GUI/textures/wood_background.edds"
            className="h-7 font-mono text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            Shown behind the in-game spawn-pick menu. Leave blank
            for no backdrop.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Shared tiny inputs ----------

function FlagField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={value === 1}
        onCheckedChange={(v) => onChange(v ? 1 : 0)}
      />
      <Label htmlFor={id} className="cursor-pointer text-xs">
        {label}
      </Label>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1 text-[11px]">
        {label}
        {unit ? (
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        ) : null}
      </Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 text-right text-xs"
      />
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
