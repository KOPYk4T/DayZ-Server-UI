import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  FileCode2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shirt,
  ShirtIcon,
  Undo2,
  UserRound,
  Users,
} from "lucide-react";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

import {
  useGearSetsSnapshot,
  useGearSetsUpdate,
} from "@/hooks/useGearSets";
import { useItemsSnapshot } from "@/hooks/useItems";
import { EditableLoadoutCard } from "@/features/gear-sets/EditableLoadoutCard";
import { ImportFromInitCDialog } from "@/features/gear-sets/ImportFromInitCDialog";
import { VanillaOverriddenBanner } from "@/features/mods/VanillaOverriddenBanner";
import type { GearLoadout, PlayerSpawnGear } from "@/types/ipc";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoTooltip } from "@/components/InfoTooltip";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

export function GearSetsPage() {
  const active = useProfileStore((s) => s.active);
  const snapshot = useGearSetsSnapshot();
  const itemsSnap = useItemsSnapshot();
  const update = useGearSetsUpdate();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<PlayerSpawnGear | null>(null);

  // Load snapshot into local draft whenever it arrives.
  useEffect(() => {
    if (snapshot.data) setDraft(snapshot.data.data);
  }, [snapshot.data]);

  const dirty = useMemo(() => {
    if (!draft || !snapshot.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(snapshot.data.data);
  }, [draft, snapshot.data]);

  const knownItems = useMemo(
    () => (itemsSnap.data?.items ?? []).map((i) => i.name),
    [itemsSnap.data],
  );

  const effectiveLoadouts: GearLoadout[] = editMode && draft
    ? draft.loadouts
    : (snapshot.data?.data.loadouts ?? []);

  const loadouts = effectiveLoadouts;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return loadouts;
    return loadouts.filter((l) => {
      const hay = [
        ...l.characterTypes,
        ...l.classnames,
        ...l.attachmentEntries.map((e) => e.label),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [loadouts, search]);

  const save = () => {
    if (!draft) return;
    update.mutate(draft, {
      onSuccess: () => {
        toast.success("cfgPlayerSpawnGear.json saved", {
          description: `${draft.loadouts.length} loadout${draft.loadouts.length === 1 ? "" : "s"} written.`,
        });
        setEditMode(false);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const revert = () => {
    if (snapshot.data) setDraft(snapshot.data.data);
  };

  const updateLoadout = (index: number, next: GearLoadout) => {
    if (!draft) return;
    setDraft({
      ...draft,
      loadouts: draft.loadouts.map((l, i) => (i === index ? next : l)),
    });
  };

  const removeLoadout = (index: number) => {
    if (!draft) return;
    setDraft({
      ...draft,
      loadouts: draft.loadouts.filter((_, i) => i !== index),
    });
  };

  const addLoadout = () => {
    if (!draft) return;
    const fresh: GearLoadout = {
      characterTypes: [],
      attachmentEntries: [],
      cargoEntries: [],
      classnames: [],
    };
    setDraft({ ...draft, loadouts: [...draft.loadouts, fresh] });
  };

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a profile to view gear sets.
      </div>
    );
  }

  if (snapshot.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading cfgPlayerSpawnGear…
      </div>
    );
  }

  if (snapshot.isError) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 break-words">
            <div className="font-mono text-xs">
              {errorMessage(snapshot.error)}
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void snapshot.refetch()}
              >
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = snapshot.data!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Shirt}
        title="Gear sets"
        description="cfgPlayerSpawnGear.json — what a fresh character spawns wearing and carrying. Click a classname chip to open it in Items; warnings highlight classnames not in the registry."
        badges={
          <>
            {editMode ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                editing
              </Badge>
            ) : null}
            {data.missingFile ? (
              <Badge
                variant="outline"
                className="border-severity-warning/40 text-severity-warning"
              >
                file not found
              </Badge>
            ) : null}
            {dirty ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                unsaved
              </Badge>
            ) : null}
          </>
        }
        path={data.missingFile ? undefined : data.fileDisplay}
        actions={
          <>
            {editMode ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    revert();
                    setEditMode(false);
                  }}
                  disabled={update.isPending}
                >
                  <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                  {dirty ? "Discard" : "Exit edit"}
                </Button>
                <Button
                  size="sm"
                  onClick={save}
                  disabled={!dirty || update.isPending}
                >
                  {update.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant={data.missingFile ? "ghost" : "secondary"}
                onClick={() => setEditMode(true)}
                disabled={data.missingFile}
                title={
                  data.missingFile
                    ? "Generate or create cfgPlayerSpawnGear.json first"
                    : "Edit loadouts"
                }
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate("/app/player-spawns")}
              title="Gear sets attach to spawn kinds (fresh / hop / travel) defined on the Player Spawns page."
            >
              <MapPin className="mr-1.5 h-3.5 w-3.5" /> Player Spawns →
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setImportOpen(true)}
              title="Scan init.c for legacy CreateInInventory calls and optionally seed a starter cfgPlayerSpawnGear.json"
            >
              <FileCode2 className="mr-1.5 h-3.5 w-3.5" /> Import from init.c…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void snapshot.refetch()}
              disabled={snapshot.isFetching || editMode}
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 h-3.5 w-3.5",
                  snapshot.isFetching && "animate-spin",
                )}
              />
              Refresh
            </Button>
          </>
        }
      />

      <GearSetsExplainer />

      <div className="px-6 pt-3">
        <VanillaOverriddenBanner system="spawn-gear">
          Expansion ships its own SpawnGear system. Vanilla{" "}
          <code>cfgPlayerSpawnGear.json</code> below still works but is
          ignored when Expansion's SpawnGear is enabled in{" "}
          <code>SpawnSettings.json</code>.
        </VanillaOverriddenBanner>
      </div>

      {data.missingFile ? (
        <div className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2 space-y-2 text-xs">
              <p>
                No <code>cfgPlayerSpawnGear.json</code> in the mission
                root. Legacy missions define starting gear in{" "}
                <code>init.c</code> via{" "}
                <code>PlayerBase::StartingEquipSetup</code> instead —
                click <strong>Import from init.c</strong> above to scan
                it and seed a starter JSON.
              </p>
              <Button
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
                Import from init.c…
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-border/60 px-6 py-3 text-xs">
            <Input
              placeholder="Search character type / classname / slot"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-80 text-xs"
            />
            <span className="text-muted-foreground">
              {filtered.length} of {loadouts.length} loadout
              {loadouts.length === 1 ? "" : "s"} ·{" "}
              {data.allClassnames.length} unique classname
              {data.allClassnames.length === 1 ? "" : "s"}
              {data.data.version ? ` · version ${data.data.version}` : null}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {filtered.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                No loadouts match the search.
              </div>
            ) : (
              filtered.map((loadout) => {
                // Find the loadout's original index in the loadouts
                // list (== draft.loadouts when editing). The filter
                // may reorder / drop entries; the card-level add /
                // remove needs the real position.
                const originalIndex = loadouts.indexOf(loadout);
                if (editMode && draft) {
                  return (
                    <EditableLoadoutCard
                      key={originalIndex}
                      loadout={loadout}
                      index={originalIndex}
                      knownItems={knownItems}
                      onChange={(next) =>
                        updateLoadout(originalIndex, next)
                      }
                      onRemove={() => removeLoadout(originalIndex)}
                    />
                  );
                }
                return (
                  <LoadoutCard
                    key={originalIndex}
                    loadout={loadout}
                    onOpenItem={(name) =>
                      navigate(`/app/items?name=${encodeURIComponent(name)}`)
                    }
                  />
                );
              })
            )}
            {editMode ? (
              <div className="flex justify-center pt-2">
                <Button variant="secondary" onClick={addLoadout}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add loadout
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      <ImportFromInitCDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        targetExists={!data.missingFile}
      />
    </div>
  );
}

// ---------- Loadout card ----------

function LoadoutCard({
  loadout,
  onOpenItem,
}: {
  loadout: GearLoadout;
  onOpenItem: (name: string) => void;
}) {
  const attCount = loadout.attachmentEntries.length;
  const cargoCount = loadout.cargoEntries.length;
  const classCount = loadout.classnames.length;

  return (
    <div className="rounded-md border border-border/60 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2.5">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        {loadout.characterTypes.length === 0 ? (
          <Badge variant="outline" className="text-[10px]">
            default (matches any character)
          </Badge>
        ) : (
          loadout.characterTypes.map((ct) => (
            <Badge
              key={ct}
              variant="outline"
              className="font-mono text-[10px]"
            >
              {ct}
            </Badge>
          ))
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {attCount} attachment{attCount === 1 ? "" : "s"} · {cargoCount}{" "}
          cargo · {classCount} unique item{classCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <EntrySection
          title="Attachment slots"
          icon={<ShirtIcon className="h-3.5 w-3.5" />}
          entries={loadout.attachmentEntries}
          onOpenItem={onOpenItem}
        />
        <EntrySection
          title="Cargo"
          icon={<Users className="h-3.5 w-3.5" />}
          entries={loadout.cargoEntries}
          onOpenItem={onOpenItem}
        />
      </div>
    </div>
  );
}

function EntrySection({
  title,
  icon,
  entries,
  onOpenItem,
}: {
  title: string;
  icon: React.ReactNode;
  entries: { label: string; chance: number; items: string[] }[];
  onOpenItem: (name: string) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-[10px] font-normal tabular-nums">
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[11px] italic text-muted-foreground">
          None defined.
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <div
              key={`${e.label}:${i}`}
              className="rounded-md border border-border/40 bg-muted/10 p-2"
            >
              <div className="mb-1 flex items-center gap-2 text-[11px]">
                <span className="font-mono text-foreground">{e.label}</span>
                <span className="ml-auto text-muted-foreground tabular-nums">
                  chance {(e.chance * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {e.items.length === 0 ? (
                  <span className="text-[11px] italic text-muted-foreground">
                    (no items)
                  </span>
                ) : (
                  e.items.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onOpenItem(name)}
                      title={`Open ${name} in the Items editor`}
                      className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] hover:border-primary/40 hover:text-primary"
                    >
                      {name}
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- Explainer ----------

function GearSetsExplainer() {
  return (
    <Explainer
      title="How gear sets work"
      subtitle={<>what fresh characters spawn wearing / carrying.</>}
      storageKey="dzcm.gear-sets.explainer.open"
    >
      <p>
        <strong className="text-foreground">Matching.</strong> When
        a player joins with a fresh character, DayZ looks at the
        chosen <code>characterType</code> (e.g.{" "}
        <code>SurvivorM_Boris</code>) and picks the loadout whose{" "}
        <code>characterTypes</code> list contains it. The first
        loadout with an empty list acts as the default fallback.{" "}
        <InfoTooltip tagline="Multiple matches">
          Only one loadout applies per spawn. DayZ walks the array
          top-to-bottom and picks the first match, so order
          matters.
        </InfoTooltip>
      </p>
      <p>
        <strong className="text-foreground">Attachment slots.</strong>{" "}
        Each entry targets a specific slot on the character (Head,
        Body, Legs, Back, Feet, etc.). <code>chance</code> 0..1
        controls how often the slot gets filled — roll below chance
        and CE picks a classname from this entry's pool, otherwise
        the slot stays empty. Entries with <code>chance: 1</code>
        always fill.
      </p>
      <p>
        <strong className="text-foreground">Cargo.</strong> Same
        idea, but the items land in the player's inventory instead
        of a worn slot. Cargo entries usually include low-tier
        consumables (rag, matchbox, apple) or stat-ters like a
        radio or armband.
      </p>
      <p>
        <strong className="text-foreground">Click a classname</strong>{" "}
        to jump to it in the Items editor (useful if you want to
        check nominal / spawn behaviour of a starting item).
      </p>
      <p className="italic">
        This is a view-only page in Phase 6a. Editing + an init.c
        legacy importer (for missions that still use{" "}
        <code>PlayerBase::OnInit()</code>) land in Phase 6b / 6c.
      </p>
    </Explainer>
  );
}
