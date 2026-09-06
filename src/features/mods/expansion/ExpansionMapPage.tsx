import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  ExternalLink,
  ImageOff,
  Layers as LayersIcon,
  Loader2,
  MapPin,
  Plus,
  Scroll,
  Shield,
  Spline,
  Swords,
  Target,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { BackgroundImageLayer } from "@/features/map/BackgroundImageLayer";
import { MapCanvas } from "@/features/map/MapCanvas";
import {
  TraderPlacementsLayer,
  type TraderPinHandle,
} from "@/features/map/TraderPlacementsLayer";
import {
  TraderZonesLayer,
  type TraderZoneHandle,
} from "@/features/map/TraderZonesLayer";
import { SafezonesLayer } from "@/features/map/SafezonesLayer";
import {
  QuestNpcsLayer,
  type QuestNpcHandle,
} from "@/features/map/QuestNpcsLayer";
import {
  AiPatrolsLayer,
  type AiPatrolHandle,
} from "@/features/map/AiPatrolsLayer";
import {
  SpawnSelectionLayer,
  type SpawnLocationHandle,
} from "@/features/map/SpawnSelectionLayer";
import { nearestBuildingY } from "@/features/map/nearestY";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import { useMapSettingsStore } from "@/stores/mapSettingsStore";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ExpansionMissionInventory,
  MapId,
  MissionDirEntry,
  ServerProfile,
  TraderMapFile,
  TraderMapLine,
  TraderPlacement,
} from "@/types/ipc";

import { PlacementForm } from "./traders/PlacementForm";
import { ZoneForm } from "./traders/ZoneForm";
import {
  DEFAULT_TRADER_ZONE,
  parseTraderZone,
  serializeTraderZone,
  type TraderZone,
} from "./traders/traderZoneTypes";
import {
  DEFAULT_AIPATROL_SETTINGS,
  defaultPatrol,
  parseAIPatrolSettings,
  serializeAIPatrolSettings,
  type AIPatrol,
  type AIPatrolSettings,
} from "./aipatrols/types";
import {
  DEFAULT_SPAWN_SETTINGS,
  defaultLocation,
  parseSpawnSettings,
  serializeSpawnSettings,
  type SpawnLocation,
  type SpawnSettings,
} from "./spawnselection/types";
import { FactionPicker } from "./pickers/FactionPicker";
import { LoadoutPicker } from "./pickers/LoadoutPicker";
import { UnitsPicker } from "./pickers/UnitsPicker";
import { DEFAULT_QUEST_NPC, type QuestNPC } from "./quests/types";
import { SafezoneForm } from "./safezones/SafezoneForm";
import {
  DEFAULT_SAFEZONE_SETTINGS,
  parseSafezoneSettings,
  serializeSafezoneSettings,
  unifySafezones,
  type SafezoneHandleRef,
  type SafezoneKind,
  type SafezoneSettings,
  type UnifiedSafezone,
  type Vec3,
} from "./safezones/safezoneTypes";

// Mode / layer visibility lives in URL search params so deep-links
// round-trip and a browser refresh doesn't lose context.
type Mode =
  | "traders"
  | "zones"
  | "safezones"
  | "quest-npcs"
  | "ai-patrols"
  | "spawn-selection";

/** Single source of truth for every mode's label, icon, and accent
 *  colour. Mode rail, panel header, and layer popover all read from
 *  this — adding a future mode (spawn selection, quest NPCs, AI
 *  patrols) only touches this list. */
interface ModeDef {
  id: Mode;
  label: string;
  icon: LucideIcon;
  /** tailwind `text-*` for the rail icon + layer checkbox accent. */
  accent: string;
}

const MODES: readonly ModeDef[] = [
  { id: "traders", label: "Trader NPCs", icon: Users, accent: "text-cyan-500" },
  {
    id: "zones",
    label: "Trader zones",
    icon: Target,
    accent: "text-teal-500",
  },
  {
    id: "safezones",
    label: "Safezones",
    icon: Shield,
    accent: "text-green-500",
  },
  {
    id: "quest-npcs",
    label: "Quest NPCs",
    icon: Scroll,
    accent: "text-purple-500",
  },
  {
    id: "ai-patrols",
    label: "AI patrols",
    icon: Swords,
    accent: "text-orange-500",
  },
  {
    id: "spawn-selection",
    label: "Spawn selection",
    icon: UserPlus,
    accent: "text-yellow-500",
  },
];

const isMode = (v: string | null): v is Mode =>
  !!v && MODES.some((m) => m.id === v);

interface LayerState {
  traders: boolean;
  zones: boolean;
  safezones: boolean;
  "quest-npcs": boolean;
  "ai-patrols": boolean;
  "spawn-selection": boolean;
}

const DEFAULT_LAYERS: LayerState = {
  traders: true,
  zones: true,
  safezones: true,
  "quest-npcs": true,
  "ai-patrols": true,
  "spawn-selection": true,
};

// ---------- Top-level ----------

export function ExpansionMapPage() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const mapId: MapId = active?.map ?? "chernarusplus";
  const mapSettings = useMapSettingsStore((s) =>
    id ? s.byProfile[id] : undefined,
  );

  const [params, setParams] = useSearchParams();
  const mode: Mode = isMode(params.get("mode")) ? (params.get("mode") as Mode) : "traders";
  const setMode = (next: Mode) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set("mode", next);
    setParams(nextParams, { replace: true });
  };

  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const toggleLayer = (key: keyof LayerState) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));

  const [placeMode, setPlaceMode] = useState(false);
  // Separate "draw path" mode for AI patrols — clicking the map
  // appends a waypoint to the selected patrol instead of placing a
  // new entity. Tracked alongside `placeMode` so the two are
  // mutually exclusive but both reset on mode change.
  const [drawPathMode, setDrawPathMode] = useState(false);
  useEffect(() => {
    // Cancel placement intent when switching modes so a stray click
    // doesn't create the wrong kind of entity.
    setPlaceMode(false);
    setDrawPathMode(false);
  }, [mode]);

  // Per-domain controllers — each returns { handles, selected,
  // select, onMapClick, onDragMove, onDragResize, sidebar }.
  const traders = useTradersController({
    profileId: id,
    active,
    enabled: !!id,
    placeMode: placeMode && mode === "traders",
    onPlaced: () => setPlaceMode(false),
  });
  const zones = useZonesController({
    profileId: id,
    active,
    enabled: !!id,
    placeMode: placeMode && mode === "zones",
    onPlaced: () => setPlaceMode(false),
  });
  const safezones = useSafezonesController({
    profileId: id,
    active,
    enabled: !!id,
    placeMode: placeMode && mode === "safezones",
    onPlaced: () => setPlaceMode(false),
  });
  const questNpcs = useQuestNpcsController({
    profileId: id,
    active,
    enabled: !!id,
    placeMode: placeMode && mode === "quest-npcs",
    onPlaced: () => setPlaceMode(false),
  });
  const aiPatrols = useAiPatrolsController({
    profileId: id,
    active,
    enabled: !!id,
    placeMode: placeMode && mode === "ai-patrols",
    onPlaced: () => setPlaceMode(false),
  });
  const spawnSelection = useSpawnSelectionController({
    profileId: id,
    active,
    enabled: !!id,
    placeMode: placeMode && mode === "spawn-selection",
    onPlaced: () => setPlaceMode(false),
  });

  const onMapClick = (pos: { x: number; z: number }) => {
    // Draw-path mode is exclusive to ai-patrols and takes
    // precedence over placeMode if both are somehow on (the
    // sidebar enforces mutual exclusion, but be defensive).
    if (mode === "ai-patrols" && drawPathMode) {
      aiPatrols.appendWaypoint(pos);
      return;
    }
    if (!placeMode) return;
    if (mode === "traders") traders.onMapClick(pos);
    else if (mode === "zones") zones.onMapClick(pos);
    else if (mode === "safezones") safezones.onMapClick(pos);
    else if (mode === "quest-npcs") questNpcs.onMapClick(pos);
    else if (mode === "ai-patrols") aiPatrols.onMapClick(pos);
    else if (mode === "spawn-selection") spawnSelection.onMapClick(pos);
  };

  // Clicking a pin of the *other* mode switches modes + selects it.
  const onSelectZone = (rel: string | null) => {
    if (mode !== "zones") setMode("zones");
    zones.select(rel);
  };
  const onSelectTrader = (lineIndex: number | null) => {
    if (mode !== "traders") setMode("traders");
    traders.select(lineIndex);
  };
  const onSelectSafezone = (ref: SafezoneHandleRef) => {
    if (mode !== "safezones") setMode("safezones");
    safezones.select(ref);
  };
  const onSelectQuestNpc = (path: string) => {
    if (mode !== "quest-npcs") setMode("quest-npcs");
    questNpcs.select(path);
  };
  const onSelectAiPatrol = (index: number) => {
    if (mode !== "ai-patrols") setMode("ai-patrols");
    aiPatrols.select(index);
  };
  const onSelectSpawnLocation = (index: number) => {
    if (mode !== "spawn-selection") setMode("spawn-selection");
    spawnSelection.select(index);
  };

  if (!id) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Select a profile first.
      </div>
    );
  }

  const saving =
    traders.saving ||
    zones.saving ||
    safezones.saving ||
    questNpcs.saving ||
    aiPatrols.saving ||
    spawnSelection.saving;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-2 text-sm">
        <Link
          to="/app/mods/expansion"
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Mods › Expansion
        </Link>
        <span className="text-muted-foreground">›</span>
        <span className="font-medium">Map editor</span>
        <span
          className="hidden text-xs text-muted-foreground md:inline"
          title="Trader zones, safe zones, quest NPC spawns, AI patrol paths, and player-spawn selection zones, placed directly on the terrain."
        >
          Trader zones, safe zones, quest NPCs, AI patrols, and spawn
          selection — placed directly on the terrain.
        </span>
        <span className="ml-auto">
          <LayersPopover
            layers={layers}
            counts={{
              traders: traders.handles.length,
              zones: zones.handles.length,
              safezones: safezones.handles.length,
              "quest-npcs": questNpcs.handles.length,
              "ai-patrols": aiPatrols.handles.length,
              "spawn-selection": spawnSelection.handles.length,
            }}
            onToggle={toggleLayer}
          />
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ModeRail
          mode={mode}
          onChange={setMode}
          counts={{
            traders: traders.handles.length,
            zones: zones.handles.length,
            safezones: safezones.handles.length,
            "quest-npcs": questNpcs.handles.length,
            "ai-patrols": aiPatrols.handles.length,
            "spawn-selection": spawnSelection.handles.length,
          }}
        />
        <aside className="flex w-[400px] flex-col border-r border-border/60">
          <ModePanelHeader mode={mode} />
          <div className="flex min-h-0 flex-1 flex-col">
            {mode === "traders" ? (
              <TradersSidebar
                controller={traders}
                placeMode={placeMode}
                setPlaceMode={setPlaceMode}
              />
            ) : mode === "zones" ? (
              <ZonesSidebar
                controller={zones}
                placeMode={placeMode}
                setPlaceMode={setPlaceMode}
              />
            ) : mode === "quest-npcs" ? (
              <QuestNpcsSidebar
                controller={questNpcs}
                placeMode={placeMode}
                setPlaceMode={setPlaceMode}
              />
            ) : mode === "ai-patrols" ? (
              <AiPatrolsSidebar
                controller={aiPatrols}
                placeMode={placeMode}
                setPlaceMode={(on) => {
                  setPlaceMode(on);
                  if (on) setDrawPathMode(false);
                }}
                drawPathMode={drawPathMode}
                setDrawPathMode={(on) => {
                  setDrawPathMode(on);
                  if (on) setPlaceMode(false);
                }}
              />
            ) : mode === "spawn-selection" ? (
              <SpawnSelectionSidebar
                controller={spawnSelection}
                placeMode={placeMode}
                setPlaceMode={setPlaceMode}
              />
            ) : (
              <SafezonesSidebar
                controller={safezones}
                placeMode={placeMode}
                setPlaceMode={setPlaceMode}
              />
            )}
          </div>
        </aside>

        <main className="relative flex-1">
          <MapCanvas
            mapId={mapId}
            onMapClick={onMapClick}
            className={cn(placeMode && "cursor-crosshair")}
          >
            {mapSettings?.imagePath ? (
              <BackgroundImageLayer
                mapId={mapId}
                imagePath={mapSettings.imagePath}
                opacity={mapSettings.imageOpacity ?? 0.7}
                offsetX={mapSettings.imageOffsetX ?? 0}
                offsetY={mapSettings.imageOffsetY ?? 0}
                scale={mapSettings.imageScale ?? 1}
              />
            ) : null}
            {/* Safezones drawn first so trader zones + pins stack on
             *  top; stacking order matches the "which is more
             *  specific" hierarchy when they overlap. */}
            {layers.safezones ? (
              <SafezonesLayer
                zones={safezones.handles}
                mapId={mapId}
                selected={
                  mode === "safezones" ? safezones.selected : null
                }
                onSelect={onSelectSafezone}
                onMoveCenter={safezones.moveCenter}
                onResize={safezones.resize}
                draft={
                  mode === "safezones" &&
                  placeMode &&
                  safezones.placeKind === "polygon"
                    ? safezones.polygonDraft
                    : undefined
                }
              />
            ) : null}
            {layers.zones ? (
              <TraderZonesLayer
                zones={zones.handles}
                mapId={mapId}
                selectedId={mode === "zones" ? zones.selectedId : null}
                onSelect={onSelectZone}
                onMoveCenter={zones.moveCenter}
                onResize={zones.resize}
              />
            ) : null}
            {layers.traders ? (
              <TraderPlacementsLayer
                handles={traders.handles}
                mapId={mapId}
                selectedLineIndex={
                  mode === "traders" ? traders.selectedLineIndex : null
                }
                onSelect={onSelectTrader}
                onMove={traders.movePin}
              />
            ) : null}
            {layers["quest-npcs"] ? (
              <QuestNpcsLayer
                handles={questNpcs.handles}
                mapId={mapId}
                selectedPath={
                  mode === "quest-npcs" ? questNpcs.selectedPath : null
                }
                onSelect={onSelectQuestNpc}
                onMove={questNpcs.movePin}
              />
            ) : null}
            {layers["ai-patrols"] ? (
              <AiPatrolsLayer
                handles={aiPatrols.handles}
                mapId={mapId}
                selectedIndex={
                  mode === "ai-patrols" ? aiPatrols.selectedIndex : null
                }
                onSelect={onSelectAiPatrol}
                onMoveSpawn={aiPatrols.moveSpawn}
              />
            ) : null}
            {layers["spawn-selection"] ? (
              <SpawnSelectionLayer
                handles={spawnSelection.handles}
                mapId={mapId}
                selectedIndex={
                  mode === "spawn-selection"
                    ? spawnSelection.selectedIndex
                    : null
                }
                onSelect={onSelectSpawnLocation}
                onMovePosition={spawnSelection.movePosition}
              />
            ) : null}
          </MapCanvas>
          <MapOverlay
            hasBackground={!!mapSettings?.imagePath}
            placeMode={placeMode || (mode === "ai-patrols" && drawPathMode)}
            placeLabel={
              mode === "ai-patrols" && drawPathMode
                ? `Click the map to add waypoint ${(aiPatrols.selectedPatrol?.Waypoints.length ?? 0) + 1} to "${aiPatrols.selectedPatrol?.Name ?? "selected patrol"}"`
                :
              mode === "traders"
                ? "Click the map to place a new trader"
                : mode === "zones"
                  ? "Click the map to place a new zone centre"
                  : mode === "quest-npcs"
                    ? "Click the map to place a new quest NPC"
                    : mode === "ai-patrols"
                      ? "Click the map to place a new AI patrol"
                      : mode === "spawn-selection"
                        ? spawnSelection.addToIndex !== null
                          ? `Click to add a position to location "${spawnSelection.handles[spawnSelection.addToIndex]?.name ?? ""}"`
                          : "Click the map to create a new spawn location"
                        : safezones.placeKind === "polygon"
                          ? `Click to add vertex${safezones.polygonDraft.length > 0 ? ` (${safezones.polygonDraft.length} so far)` : ""}`
                          : `Click to place a new ${safezones.placeKind}`
            }
            saving={saving}
            outsideWarning={
              layers.traders && layers.zones
                ? tradersOutsideAnyZone(
                    traders.handles,
                    zones.handles,
                  )
                : 0
            }
          />
        </main>
      </div>
    </div>
  );
}

// ---------- Chrome: rail, panel header, layers popover ----------

/** Vertical mode selector on the left edge — one icon per mode.
 *  Scales to 6–10 modes without the visual crowding a horizontal
 *  tab strip would hit. Active mode highlighted with a primary-
 *  coloured left-border indicator. */
function ModeRail({
  mode,
  onChange,
  counts,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  counts: Record<Mode, number>;
}) {
  return (
    <nav
      className="flex w-14 shrink-0 flex-col border-r border-border/60 bg-muted/30 py-1"
      aria-label="Map editor modes"
    >
      {MODES.map((m) => {
        const Icon = m.icon;
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            title={m.label}
            aria-label={m.label}
            aria-pressed={active}
            className={cn(
              "relative flex h-14 flex-col items-center justify-center gap-0.5 border-l-2 border-transparent text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
              active &&
                "border-l-primary bg-background text-foreground",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5",
                active ? m.accent : "",
              )}
            />
            {counts[m.id] > 0 ? (
              <span className="text-[9px] font-mono tabular-nums">
                {counts[m.id]}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

/** Mirrors the rail icon + full label at the top of the active-mode
 *  panel so the rail can stay icon-only without users second-
 *  guessing what the column contains. */
function ModePanelHeader({ mode }: { mode: Mode }) {
  const def = MODES.find((m) => m.id === mode)!;
  const Icon = def.icon;
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
      <Icon className={cn("h-4 w-4", def.accent)} />
      <span className="text-sm font-semibold">{def.label}</span>
    </div>
  );
}

/** Compact "Layers" button in the header. Clicking opens a popover
 *  with one checkbox per layer — scales better than a horizontal row
 *  of checkboxes when there are 4+ layers. Badge shows
 *  "`visible / total`". */
function LayersPopover({
  layers,
  counts,
  onToggle,
}: {
  layers: LayerState;
  counts: Record<keyof LayerState, number>;
  onToggle: (key: keyof LayerState) => void;
}) {
  const visible = (Object.keys(layers) as (keyof LayerState)[]).filter(
    (k) => layers[k],
  ).length;
  const total = Object.keys(layers).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <LayersIcon className="mr-1.5 h-3.5 w-3.5" />
          Layers
          <Badge
            variant="secondary"
            className="ml-1.5 h-4 text-[10px] font-mono tabular-nums"
          >
            {visible}/{total}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="space-y-1">
          <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Visible on map
          </div>
          {MODES.map((m) => (
            <LayerRow
              key={m.id}
              def={m}
              count={counts[m.id]}
              on={layers[m.id]}
              onChange={() => onToggle(m.id)}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function LayerRow({
  def,
  count,
  on,
  onChange,
}: {
  def: ModeDef;
  count: number;
  on: boolean;
  onChange: () => void;
}) {
  const Icon = def.icon;
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
      <Checkbox checked={on} onCheckedChange={onChange} />
      <Icon className={cn("h-3.5 w-3.5", on ? def.accent : "text-muted-foreground")} />
      <span className={cn("flex-1 text-xs", !on && "text-muted-foreground")}>
        {def.label}
      </span>
      <Badge variant="secondary" className="h-4 text-[10px] font-mono tabular-nums">
        {count}
      </Badge>
    </label>
  );
}

// ---------- Tiny map overlay panel ----------

function MapOverlay({
  hasBackground,
  placeMode,
  placeLabel,
  saving,
  outsideWarning,
}: {
  hasBackground: boolean;
  placeMode: boolean;
  placeLabel: string;
  saving: boolean;
  outsideWarning: number;
}) {
  return (
    <>
      {!hasBackground ? (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-[500] flex -translate-x-1/2 items-center gap-2 rounded border border-border bg-background/95 px-3 py-1.5 text-[11px] shadow">
          <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
          No backdrop image — set one on the{" "}
          <Link to="/app/map" className="underline-offset-2 hover:underline">
            Map page
          </Link>
          .
        </div>
      ) : null}
      {placeMode ? (
        <div className="pointer-events-none absolute right-3 top-3 z-[500] rounded bg-primary px-2 py-1 text-xs text-primary-foreground shadow">
          {placeLabel}
        </div>
      ) : null}
      {outsideWarning > 0 ? (
        <div className="absolute right-3 top-12 z-[500] rounded border border-severity-warning/40 bg-background/95 px-3 py-1.5 text-[11px] text-severity-warning shadow">
          {outsideWarning} trader{outsideWarning === 1 ? "" : "s"}{" "}
          outside every zone
        </div>
      ) : null}
      {saving ? (
        <div className="absolute right-3 bottom-3 z-[500] rounded bg-background/90 px-2 py-1 text-xs shadow">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Saving…
        </div>
      ) : null}
    </>
  );
}

function tradersOutsideAnyZone(
  traders: TraderPinHandle[],
  zones: TraderZoneHandle[],
): number {
  if (zones.length === 0) return 0;
  let n = 0;
  for (const t of traders) {
    const inside = zones.some((z) => {
      const dx = t.placement.position[0] - z.position[0];
      const dz = t.placement.position[2] - z.position[2];
      return Math.sqrt(dx * dx + dz * dz) <= z.radius;
    });
    if (!inside) n += 1;
  }
  return n;
}

// ---------- Traders controller ----------

interface TradersController {
  handles: TraderPinHandle[];
  selectedLineIndex: number | null;
  select: (idx: number | null) => void;
  movePin: (
    lineIndex: number,
    next: { x: number; y: number; z: number },
  ) => void;
  onMapClick: (pos: { x: number; z: number }) => void;
  saving: boolean;
  // Sidebar needs these:
  tradersFolderRel: string | null;
  mapFiles: MissionDirEntry[];
  isCreatingFile: boolean;
  createFile: (filename: string) => void;
  selectedFilePath: string | null;
  setSelectedFilePath: (rel: string | null) => void;
  data: TraderMapFile | null;
  placementLineIndexes: number[];
  knownTraderFiles: string[];
  nearestYFor: (x: number, z: number) => number | null;
  patchPlacement: (
    lineIndex: number,
    patch: Partial<TraderPlacement>,
  ) => void;
  deletePlacement: (lineIndex: number) => void;
}

function useTradersController({
  profileId,
  active,
  enabled,
  placeMode,
  onPlaced,
}: {
  profileId: string | null;
  active: ServerProfile | null;
  enabled: boolean;
  placeMode: boolean;
  onPlaced: () => void;
}): TradersController {
  const qc = useQueryClient();

  const inv = useQuery({
    queryKey: profileId ? ["expansion-mission-scan", profileId] : ["none"],
    queryFn: () => tauri.expansionMissionScan(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 5_000,
  });

  const tradersFolderRel = useMemo(() => {
    const scanned = (inv.data as ExpansionMissionInventory | null)?.folders?.find(
      (f) => f.name.toLowerCase() === "traders",
    )?.relativePath;
    if (scanned) return scanned;
    const mpRel = active?.paths.mpmissionsRelative.replace(/\/$/, "");
    return mpRel ? `${mpRel}/expansion/traders` : null;
  }, [inv.data, active?.paths.mpmissionsRelative]);

  const mapFilesQuery = useQuery<MissionDirEntry[]>({
    queryKey:
      profileId && tradersFolderRel
        ? ["expansion-trader-map-files", profileId, tradersFolderRel]
        : ["none"],
    queryFn: async () => {
      try {
        const listing = await tauri.expansionMissionListDir(
          profileId!,
          tradersFolderRel!,
        );
        return listing.entries.filter(
          (e) => !e.isDir && e.extension === "map",
        );
      } catch {
        return [];
      }
    },
    enabled: !!(enabled && profileId && tradersFolderRel),
    staleTime: 5_000,
  });

  const createFile = useMutation({
    mutationFn: async (filename: string) => {
      if (!profileId || !tradersFolderRel) throw new Error("no profile");
      const rel = `${tradersFolderRel}/${filename}`;
      await tauri.expansionMissionWrite(profileId, rel, "");
      return rel;
    },
    onSuccess: (rel) => {
      qc.invalidateQueries({
        queryKey: ["expansion-mission-scan", profileId],
      });
      qc.invalidateQueries({
        queryKey: ["expansion-trader-map-files", profileId, tradersFolderRel],
      });
      setSelectedFilePath(rel);
      toast.success("created empty .map file");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const files = useMemo(
    () => mapFilesQuery.data ?? [],
    [mapFilesQuery.data],
  );
  useEffect(() => {
    if (selectedFilePath) return;
    if (files.length > 0) setSelectedFilePath(files[0].relativePath);
  }, [files, selectedFilePath]);

  const fileQuery = useQuery({
    queryKey:
      profileId && selectedFilePath
        ? ["trader-placements", profileId, selectedFilePath]
        : ["none"],
    queryFn: () => tauri.traderPlacementsRead(profileId!, selectedFilePath!),
    enabled: !!(profileId && selectedFilePath),
    staleTime: 0,
  });

  const save = useMutation({
    mutationFn: (next: TraderMapFile) => {
      if (!profileId || !selectedFilePath) throw new Error("no file");
      return tauri.traderPlacementsWrite(
        profileId,
        selectedFilePath,
        next,
      );
    },
    onSuccess: (_r, next) => {
      if (!profileId || !selectedFilePath) return;
      qc.setQueryData(
        ["trader-placements", profileId, selectedFilePath],
        next,
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Index of all trader config JSON file stems — powers the trader-
  // file picker in the placement form.
  const profilesRel = active?.paths.profilesRelative.replace(/\/$/, "") ?? null;
  const traderFilesQuery = useQuery<string[]>({
    queryKey: profilesRel
      ? ["expansion-traders-index", profileId, profilesRel]
      : ["none"],
    queryFn: async () => {
      try {
        const listing = await tauri.expansionListDir(
          profileId!,
          `${profilesRel}/ExpansionMod/Traders`,
        );
        return listing.entries
          .filter((e) => !e.isDir && e.extension === "json")
          .map((e) => e.name.replace(/\.json$/i, ""));
      } catch {
        return [];
      }
    },
    enabled: !!(enabled && profileId && profilesRel),
    staleTime: 30_000,
  });
  const knownTraderFiles = traderFilesQuery.data ?? [];

  const buildings = useQuery({
    queryKey: profileId ? ["buildings-placements", profileId] : ["none"],
    queryFn: () => tauri.buildingsPlacementsGet(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 60_000,
  });
  const bldPlacements = buildings.data?.placements ?? null;
  const nearestYFor = useCallback(
    (x: number, z: number) => nearestBuildingY(bldPlacements, x, z)?.y ?? null,
    [bldPlacements],
  );

  const data = fileQuery.data ?? null;
  const placementLineIndexes = useMemo(() => {
    if (!data) return [];
    const out: number[] = [];
    data.lines.forEach((l, i) => {
      if (l.kind === "placement") out.push(i);
    });
    return out;
  }, [data]);

  const handles: TraderPinHandle[] = useMemo(() => {
    if (!data) return [];
    return placementLineIndexes.map((i) => {
      const line = data.lines[i] as Extract<
        TraderMapLine,
        { kind: "placement" }
      >;
      return { lineIndex: i, placement: line.value };
    });
  }, [data, placementLineIndexes]);

  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  useEffect(() => {
    if (selectedLineIndex !== null) return;
    if (placementLineIndexes.length > 0) {
      setSelectedLineIndex(placementLineIndexes[0]);
    }
  }, [placementLineIndexes, selectedLineIndex]);

  const patchPlacement = (
    lineIndex: number,
    patch: Partial<TraderPlacement>,
  ) => {
    if (!data) return;
    const nextLines: TraderMapLine[] = data.lines.map((l, i) =>
      i === lineIndex && l.kind === "placement"
        ? { kind: "placement", value: { ...l.value, ...patch } }
        : l,
    );
    save.mutate({ lines: nextLines });
  };

  const deletePlacement = (lineIndex: number) => {
    if (!data) return;
    const nextLines = data.lines.filter((_, i) => i !== lineIndex);
    setSelectedLineIndex(null);
    save.mutate({ lines: nextLines });
  };

  const movePin = (
    lineIndex: number,
    next: { x: number; y: number; z: number },
  ) => {
    if (!data) return;
    const y = nearestYFor(next.x, next.z);
    const nextLines: TraderMapLine[] = data.lines.map((l, i) => {
      if (i !== lineIndex || l.kind !== "placement") return l;
      return {
        kind: "placement",
        value: {
          ...l.value,
          position: [next.x, y ?? l.value.position[1], next.z],
        },
      };
    });
    save.mutate({ lines: nextLines });
  };

  const onMapClick = (pos: { x: number; z: number }) => {
    if (!placeMode || !data) return;
    const y = nearestYFor(pos.x, pos.z);
    const selected =
      selectedLineIndex !== null && data.lines[selectedLineIndex]?.kind === "placement"
        ? (data.lines[selectedLineIndex] as Extract<
            TraderMapLine,
            { kind: "placement" }
          >).value
        : null;
    const seed: TraderPlacement = selected
      ? {
          ...selected,
          position: [pos.x, y ?? selected.position[1], pos.z],
          orientation: [0, 0, 0],
          gear: [],
        }
      : {
          entityClass: "ExpansionTraderDenis",
          traderFile: knownTraderFiles[0] ?? "",
          position: [pos.x, y ?? 0, pos.z],
          orientation: [0, 0, 0],
          gear: [],
        };
    const nextLines: TraderMapLine[] = [
      ...data.lines,
      { kind: "placement", value: seed },
    ];
    save.mutate(
      { lines: nextLines },
      {
        onSuccess: () => {
          setSelectedLineIndex(nextLines.length - 1);
          onPlaced();
        },
      },
    );
  };

  return {
    handles,
    selectedLineIndex,
    select: setSelectedLineIndex,
    movePin,
    onMapClick,
    saving: save.isPending,
    tradersFolderRel,
    mapFiles: files,
    isCreatingFile: createFile.isPending,
    createFile: (f: string) => createFile.mutate(f),
    selectedFilePath,
    setSelectedFilePath,
    data,
    placementLineIndexes,
    knownTraderFiles,
    nearestYFor,
    patchPlacement,
    deletePlacement,
  };
}

// ---------- Zones controller ----------

interface ZonesController {
  handles: TraderZoneHandle[];
  selectedId: string | null;
  select: (id: string | null) => void;
  moveCenter: (id: string, next: { x: number; z: number }) => void;
  resize: (id: string, radius: number) => void;
  onMapClick: (pos: { x: number; z: number }) => void;
  saving: boolean;
  files: MissionDirEntry[];
  zones: (TraderZone | null)[];
  selectedZone: TraderZone | null;
  patchZone: (patch: Partial<TraderZone>) => void;
  isCreating: boolean;
  createZone: (stem: string) => void;
}

function useZonesController({
  profileId,
  active,
  enabled,
  placeMode,
  onPlaced,
}: {
  profileId: string | null;
  active: ServerProfile | null;
  enabled: boolean;
  placeMode: boolean;
  onPlaced: () => void;
}): ZonesController {
  const qc = useQueryClient();

  const inv = useQuery({
    queryKey: profileId ? ["expansion-mission-scan", profileId] : ["none"],
    queryFn: () => tauri.expansionMissionScan(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 5_000,
  });

  const zonesFolderRel = useMemo(() => {
    const scanned = (inv.data as ExpansionMissionInventory | null)?.folders?.find(
      (f) => f.name.toLowerCase() === "traderzones",
    )?.relativePath;
    if (scanned) return scanned;
    const mpRel = active?.paths.mpmissionsRelative.replace(/\/$/, "");
    return mpRel ? `${mpRel}/expansion/traderzones` : null;
  }, [inv.data, active?.paths.mpmissionsRelative]);

  const zoneFilesQuery = useQuery<MissionDirEntry[]>({
    queryKey:
      profileId && zonesFolderRel
        ? ["expansion-zone-files", profileId, zonesFolderRel]
        : ["none"],
    queryFn: async () => {
      try {
        const listing = await tauri.expansionMissionListDir(
          profileId!,
          zonesFolderRel!,
        );
        return listing.entries.filter(
          (e) => !e.isDir && e.extension === "json",
        );
      } catch {
        return [];
      }
    },
    enabled: !!(enabled && profileId && zonesFolderRel),
    staleTime: 5_000,
  });
  const files = useMemo(
    () => zoneFilesQuery.data ?? [],
    [zoneFilesQuery.data],
  );

  // Parallel per-zone reads.
  const zoneQueries = useQueries({
    queries: files.map((f) => ({
      queryKey: ["trader-zone", profileId, f.relativePath],
      queryFn: async (): Promise<TraderZone> => {
        const raw = await tauri.expansionMissionRead(
          profileId!,
          f.relativePath,
        );
        return parseTraderZone(raw);
      },
      staleTime: 30_000,
      enabled: !!profileId,
    })),
  });
  const zones: (TraderZone | null)[] = zoneQueries.map((q) => q.data ?? null);

  const buildings = useQuery({
    queryKey: profileId ? ["buildings-placements", profileId] : ["none"],
    queryFn: () => tauri.buildingsPlacementsGet(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 60_000,
  });
  const nearestY = (x: number, z: number) =>
    nearestBuildingY(buildings.data?.placements ?? null, x, z)?.y ?? null;

  const save = useMutation({
    mutationFn: async (args: { path: string; zone: TraderZone }) => {
      if (!profileId) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        args.path,
        serializeTraderZone(args.zone),
      );
    },
    onSuccess: (_r, args) => {
      qc.setQueryData(["trader-zone", profileId, args.path], args.zone);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createZone = useMutation({
    mutationFn: async (stem: string) => {
      if (!profileId || !zonesFolderRel) throw new Error("no profile");
      const rel = `${zonesFolderRel}/${stem}.json`;
      const next: TraderZone = {
        ...DEFAULT_TRADER_ZONE,
        m_DisplayName: stem,
      };
      await tauri.expansionMissionWrite(
        profileId,
        rel,
        serializeTraderZone(next),
      );
      return rel;
    },
    onSuccess: (rel) => {
      qc.invalidateQueries({
        queryKey: ["expansion-mission-scan", profileId],
      });
      qc.invalidateQueries({
        queryKey: ["expansion-zone-files", profileId, zonesFolderRel],
      });
      setSelectedId(rel);
      toast.success("zone created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId) return;
    if (files.length > 0) setSelectedId(files[0].relativePath);
  }, [files, selectedId]);

  const handles: TraderZoneHandle[] = useMemo(() => {
    const out: TraderZoneHandle[] = [];
    files.forEach((f, i) => {
      const z = zones[i];
      if (!z) return;
      out.push({
        id: f.relativePath,
        name: z.m_DisplayName || f.name.replace(/\.json$/i, ""),
        position: z.Position,
        radius: z.Radius,
      });
    });
    return out;
  }, [files, zones]);

  const selectedZone: TraderZone | null = useMemo(() => {
    if (!selectedId) return null;
    const idx = files.findIndex((f) => f.relativePath === selectedId);
    return idx >= 0 ? zones[idx] : null;
  }, [files, zones, selectedId]);

  const patchZone = (patch: Partial<TraderZone>) => {
    if (!selectedId || !selectedZone) return;
    save.mutate({ path: selectedId, zone: { ...selectedZone, ...patch } });
  };

  const moveCenter = (id: string, next: { x: number; z: number }) => {
    const idx = files.findIndex((f) => f.relativePath === id);
    const z = idx >= 0 ? zones[idx] : null;
    if (!z) return;
    const y = nearestY(next.x, next.z);
    save.mutate({
      path: id,
      zone: {
        ...z,
        Position: [next.x, y ?? z.Position[1], next.z],
      },
    });
  };

  const resize = (id: string, radius: number) => {
    const idx = files.findIndex((f) => f.relativePath === id);
    const z = idx >= 0 ? zones[idx] : null;
    if (!z) return;
    save.mutate({ path: id, zone: { ...z, Radius: radius } });
  };

  const onMapClick = (pos: { x: number; z: number }) => {
    if (!placeMode) return;
    // Seed a new zone at the click, default radius 150m. Name keys
    // off the current timestamp so operators can rename freely.
    const stem = `Zone_${Date.now().toString().slice(-5)}`;
    createZone.mutate(stem, {
      onSuccess: (rel) => {
        const y = nearestY(pos.x, pos.z) ?? 0;
        // Save again immediately with the clicked position — the
        // create used defaults (0,0,0).
        save.mutate({
          path: rel,
          zone: {
            ...DEFAULT_TRADER_ZONE,
            m_DisplayName: stem,
            Position: [pos.x, y, pos.z],
          },
        });
        onPlaced();
      },
    });
  };

  return {
    handles,
    selectedId,
    select: setSelectedId,
    moveCenter,
    resize,
    onMapClick,
    saving: save.isPending || createZone.isPending,
    files,
    zones,
    selectedZone,
    patchZone,
    isCreating: createZone.isPending,
    createZone: (s: string) => createZone.mutate(s),
  };
}

// ---------- Sidebar: Traders ----------

function TradersSidebar({
  controller: c,
  placeMode,
  setPlaceMode,
}: {
  controller: TradersController;
  placeMode: boolean;
  setPlaceMode: (on: boolean) => void;
}) {
  const selectedPlacement =
    c.selectedLineIndex !== null &&
    c.data?.lines[c.selectedLineIndex]?.kind === "placement"
      ? (
          c.data.lines[c.selectedLineIndex] as Extract<
            TraderMapLine,
            { kind: "placement" }
          >
        ).value
      : null;

  if (!c.tradersFolderRel) {
    return (
      <EmptyBox title="Profile missing mpmissions path" />
    );
  }

  if (c.mapFiles.length === 0) {
    return (
      <CreateFirstMapFile
        folderRel={c.tradersFolderRel}
        isPending={c.isCreatingFile}
        onCreate={c.createFile}
      />
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
        <Label className="text-[10px] text-muted-foreground">File</Label>
        <Select
          value={c.selectedFilePath ?? ""}
          onValueChange={(v) => c.setSelectedFilePath(v || null)}
        >
          <SelectTrigger className="h-7 min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {c.mapFiles.map((f) => (
              <SelectItem key={f.relativePath} value={f.relativePath}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <NewFileButton
          existing={c.mapFiles.map((f) => f.name)}
          isPending={c.isCreatingFile}
          onCreate={c.createFile}
        />
      </div>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
        <span className="font-medium">
          {c.placementLineIndexes.length} trader
          {c.placementLineIndexes.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant={placeMode ? "default" : "outline"}
          onClick={() => setPlaceMode(!placeMode)}
        >
          {placeMode ? (
            <>
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </>
          ) : (
            <>
              <Target className="mr-1 h-3.5 w-3.5" /> Place on map
            </>
          )}
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
        {c.handles.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No traders yet — click <strong>Place on map</strong> then
            click a spot.
          </li>
        ) : (
          c.handles.map((h) => (
            <li key={h.lineIndex}>
              <button
                onClick={() => c.select(h.lineIndex)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40",
                  c.selectedLineIndex === h.lineIndex && "bg-muted/70",
                )}
              >
                <span className="flex items-center gap-2 font-mono text-xs">
                  {h.placement.traderFile || "(no trader file)"}
                  {h.placement.entityClass.includes("AI") ? (
                    <Badge variant="secondary" className="h-4 text-[10px]">
                      AI
                    </Badge>
                  ) : null}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {h.placement.entityClass}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {h.placement.position[0].toFixed(0)},{" "}
                  {h.placement.position[1].toFixed(1)},{" "}
                  {h.placement.position[2].toFixed(0)}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      {selectedPlacement && c.selectedLineIndex !== null ? (
        <div className="overflow-y-auto">
          <PlacementForm
            key={c.selectedLineIndex}
            placement={selectedPlacement}
            nearestY={c.nearestYFor(
              selectedPlacement.position[0],
              selectedPlacement.position[2],
            )}
            knownTraderFiles={c.knownTraderFiles}
            onCommit={(patch) => c.patchPlacement(c.selectedLineIndex!, patch)}
            onDelete={() => c.deletePlacement(c.selectedLineIndex!)}
          />
        </div>
      ) : null}
    </>
  );
}

// ---------- Sidebar: Zones ----------

function ZonesSidebar({
  controller: c,
  placeMode,
  setPlaceMode,
}: {
  controller: ZonesController;
  placeMode: boolean;
  setPlaceMode: (on: boolean) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
        <span className="font-medium">
          {c.handles.length} zone{c.handles.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          <NewZoneButton
            existing={c.files.map((f) => f.name.replace(/\.json$/i, ""))}
            isPending={c.isCreating}
            onCreate={c.createZone}
          />
          <Button
            size="sm"
            variant={placeMode ? "default" : "outline"}
            onClick={() => setPlaceMode(!placeMode)}
          >
            {placeMode ? (
              <>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </>
            ) : (
              <>
                <Target className="mr-1 h-3.5 w-3.5" /> Place on map
              </>
            )}
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
        {c.handles.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No zones yet — click <strong>New</strong> or{" "}
            <strong>Place on map</strong>.
          </li>
        ) : (
          c.files.map((f, i) => {
            const z = c.zones[i];
            return (
              <li key={f.relativePath}>
                <button
                  onClick={() => c.select(f.relativePath)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40",
                    c.selectedId === f.relativePath && "bg-muted/70",
                  )}
                >
                  <span className="font-medium">
                    {z?.m_DisplayName || f.name.replace(/\.json$/i, "")}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {z
                      ? `${z.Position[0].toFixed(0)}, ${z.Position[2].toFixed(0)} · r=${z.Radius.toFixed(0)}m`
                      : "loading…"}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {c.selectedZone && c.selectedId ? (
        <div className="overflow-y-auto">
          <ZoneForm
            key={c.selectedId}
            zone={c.selectedZone}
            onCommit={c.patchZone}
          />
        </div>
      ) : null}
    </>
  );
}

// ---------- Safezones controller ----------

interface SafezonesController {
  handles: UnifiedSafezone[];
  selected: SafezoneHandleRef | null;
  selectedZone: UnifiedSafezone | null;
  select: (ref: SafezoneHandleRef | null) => void;
  moveCenter: (
    ref: SafezoneHandleRef,
    next: { x: number; z: number },
  ) => void;
  resize: (ref: SafezoneHandleRef, radius: number) => void;
  patchCenterRadius: (patch: {
    center?: Vec3;
    radius?: number;
    height?: number;
  }) => void;
  convertKind: (ref: SafezoneHandleRef, nextKind: SafezoneKind) => void;
  deleteSelected: () => void;
  onMapClick: (pos: { x: number; z: number }) => void;
  saving: boolean;
  /** Path to `SafeZoneSettings.json` in the workspace; null when the
   *  profile has no mpmissions path set yet. */
  filePath: string | null;
  settings: SafezoneSettings | null;
  hasFile: boolean;
  isCreatingFile: boolean;
  createFile: () => void;
  /** Kind selected for the *next* click while in place mode. */
  placeKind: SafezoneKind;
  setPlaceKind: (kind: SafezoneKind) => void;
  /** Vertices accumulated mid-draw for a polygon. Empty unless
   *  `placeKind === "polygon"` and the user has started clicking. */
  polygonDraft: Vec3[];
  finishPolygon: () => void;
  cancelPolygon: () => void;
}

function useSafezonesController({
  profileId,
  active,
  enabled,
  placeMode,
  onPlaced,
}: {
  profileId: string | null;
  active: ServerProfile | null;
  enabled: boolean;
  placeMode: boolean;
  onPlaced: () => void;
}): SafezonesController {
  const qc = useQueryClient();

  const filePath = useMemo(() => {
    const mpRel = active?.paths.mpmissionsRelative.replace(/\/$/, "");
    return mpRel ? `${mpRel}/expansion/settings/SafeZoneSettings.json` : null;
  }, [active?.paths.mpmissionsRelative]);

  const query = useQuery<SafezoneSettings | null>({
    queryKey:
      profileId && filePath
        ? ["safezone-settings", profileId, filePath]
        : ["none"],
    queryFn: async () => {
      try {
        const raw = await tauri.expansionMissionRead(profileId!, filePath!);
        return parseSafezoneSettings(raw);
      } catch {
        // File doesn't exist yet — surface null so the sidebar can
        // show "Create file" instead of an error.
        return null;
      }
    },
    enabled: !!(enabled && profileId && filePath),
    staleTime: 5_000,
  });
  const settings = query.data ?? null;
  const hasFile = settings !== null;
  const nearestY = useCallback(
    (x: number, z: number) => {
      // Placeholder — the zones controller uses the full buildings
      // query; duplicating here would double-fetch. We'll accept the
      // user-entered or default Y on creation. The map pin doesn't
      // use Y for its flat rendering.
      void x;
      void z;
      return null;
    },
    [],
  );

  const save = useMutation({
    mutationFn: async (next: SafezoneSettings) => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeSafezoneSettings(next),
      );
    },
    onSuccess: (_r, next) => {
      if (!profileId || !filePath) return;
      qc.setQueryData(["safezone-settings", profileId, filePath], next);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createFileMut = useMutation({
    mutationFn: async () => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeSafezoneSettings(DEFAULT_SAFEZONE_SETTINGS),
      );
    },
    onSuccess: () => {
      qc.setQueryData(
        ["safezone-settings", profileId, filePath],
        DEFAULT_SAFEZONE_SETTINGS,
      );
      toast.success("SafeZoneSettings.json created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handles: UnifiedSafezone[] = useMemo(
    () => (settings ? unifySafezones(settings) : []),
    [settings],
  );

  const [selected, setSelected] = useState<SafezoneHandleRef | null>(null);
  useEffect(() => {
    if (selected) return;
    if (handles.length > 0) {
      setSelected({ kind: handles[0].kind, index: handles[0].index });
    }
  }, [handles, selected]);

  const selectedZone = useMemo(() => {
    if (!selected) return null;
    return (
      handles.find(
        (h) => h.kind === selected.kind && h.index === selected.index,
      ) ?? null
    );
  }, [handles, selected]);

  const patch = useCallback(
    (mutator: (prev: SafezoneSettings) => SafezoneSettings) => {
      if (!settings) return;
      save.mutate(mutator(settings));
    },
    [settings, save],
  );

  const moveCenter = (
    ref: SafezoneHandleRef,
    next: { x: number; z: number },
  ) => {
    patch((prev) => {
      const copy: SafezoneSettings = {
        ...prev,
        CircleZones: [...prev.CircleZones],
        CylinderZones: [...prev.CylinderZones],
      };
      if (ref.kind === "circle") {
        const z = copy.CircleZones[ref.index];
        copy.CircleZones[ref.index] = {
          ...z,
          Center: [next.x, z.Center[1], next.z],
        };
      } else if (ref.kind === "cylinder") {
        const z = copy.CylinderZones[ref.index];
        copy.CylinderZones[ref.index] = {
          ...z,
          Center: [next.x, z.Center[1], next.z],
        };
      }
      // Polygons don't support drag-move-centre yet.
      return copy;
    });
  };

  const resize = (ref: SafezoneHandleRef, radius: number) => {
    patch((prev) => {
      if (ref.kind === "circle") {
        const copy = { ...prev, CircleZones: [...prev.CircleZones] };
        copy.CircleZones[ref.index] = {
          ...copy.CircleZones[ref.index],
          Radius: radius,
        };
        return copy;
      }
      if (ref.kind === "cylinder") {
        const copy = { ...prev, CylinderZones: [...prev.CylinderZones] };
        copy.CylinderZones[ref.index] = {
          ...copy.CylinderZones[ref.index],
          Radius: radius,
        };
        return copy;
      }
      return prev;
    });
  };

  const patchCenterRadius = (p: {
    center?: Vec3;
    radius?: number;
    height?: number;
  }) => {
    if (!selected) return;
    patch((prev) => {
      if (selected.kind === "circle") {
        const copy = { ...prev, CircleZones: [...prev.CircleZones] };
        const z = copy.CircleZones[selected.index];
        copy.CircleZones[selected.index] = {
          ...z,
          Center: p.center ?? z.Center,
          Radius: p.radius ?? z.Radius,
        };
        return copy;
      }
      if (selected.kind === "cylinder") {
        const copy = { ...prev, CylinderZones: [...prev.CylinderZones] };
        const z = copy.CylinderZones[selected.index];
        copy.CylinderZones[selected.index] = {
          ...z,
          Center: p.center ?? z.Center,
          Radius: p.radius ?? z.Radius,
          Height: p.height ?? z.Height,
        };
        return copy;
      }
      return prev;
    });
  };

  const deleteSelected = () => {
    if (!selected) return;
    patch((prev) => {
      if (selected.kind === "circle") {
        return {
          ...prev,
          CircleZones: prev.CircleZones.filter((_, i) => i !== selected.index),
        };
      }
      if (selected.kind === "cylinder") {
        return {
          ...prev,
          CylinderZones: prev.CylinderZones.filter(
            (_, i) => i !== selected.index,
          ),
        };
      }
      return {
        ...prev,
        PolygonZones: prev.PolygonZones.filter((_, i) => i !== selected.index),
      };
    });
    setSelected(null);
  };

  const [placeKind, setPlaceKind] = useState<SafezoneKind>("circle");
  const [polygonDraft, setPolygonDraft] = useState<Vec3[]>([]);

  // Switching kind mid-draft abandons the half-built polygon — it'd
  // be confusing to keep vertices around after the user changes
  // intent. Same when placeMode toggles off.
  useEffect(() => {
    if (placeKind !== "polygon" || !placeMode) {
      if (polygonDraft.length > 0) setPolygonDraft([]);
    }
  }, [placeKind, placeMode, polygonDraft.length]);

  const onMapClick = (pos: { x: number; z: number }) => {
    if (!placeMode) return;
    const y = nearestY(pos.x, pos.z) ?? 0;
    const vec: Vec3 = [pos.x, y, pos.z];
    if (placeKind === "circle") {
      patch((prev) => {
        const next = {
          ...prev,
          CircleZones: [...prev.CircleZones, { Center: vec, Radius: 150 }],
        };
        setSelected({
          kind: "circle",
          index: next.CircleZones.length - 1,
        });
        return next;
      });
      onPlaced();
      return;
    }
    if (placeKind === "cylinder") {
      patch((prev) => {
        const next = {
          ...prev,
          CylinderZones: [
            ...prev.CylinderZones,
            { Center: vec, Radius: 150, Height: 120 },
          ],
        };
        setSelected({
          kind: "cylinder",
          index: next.CylinderZones.length - 1,
        });
        return next;
      });
      onPlaced();
      return;
    }
    // Polygon: accumulate vertices; user clicks Finish to commit.
    setPolygonDraft((d) => [...d, vec]);
  };

  const finishPolygon = () => {
    if (polygonDraft.length < 3) return;
    const positions = polygonDraft;
    patch((prev) => {
      const next = {
        ...prev,
        PolygonZones: [...prev.PolygonZones, { Positions: positions }],
      };
      setSelected({
        kind: "polygon",
        index: next.PolygonZones.length - 1,
      });
      return next;
    });
    setPolygonDraft([]);
    onPlaced();
  };

  const cancelPolygon = () => setPolygonDraft([]);

  const convertKind = (
    ref: SafezoneHandleRef,
    nextKind: SafezoneKind,
  ) => {
    if (ref.kind === nextKind) return;
    // Circle ↔ Cylinder conversion preserves Center + Radius. Height
    // defaults to 120 m when upgrading to cylinder. Polygon
    // conversion is lossy enough that we don't auto-do it — the form
    // only offers the circle/cylinder swap.
    patch((prev) => {
      if (ref.kind === "circle" && nextKind === "cylinder") {
        const z = prev.CircleZones[ref.index];
        const next = {
          ...prev,
          CircleZones: prev.CircleZones.filter((_, i) => i !== ref.index),
          CylinderZones: [
            ...prev.CylinderZones,
            { Center: z.Center, Radius: z.Radius, Height: 120 },
          ],
        };
        setSelected({
          kind: "cylinder",
          index: next.CylinderZones.length - 1,
        });
        return next;
      }
      if (ref.kind === "cylinder" && nextKind === "circle") {
        const z = prev.CylinderZones[ref.index];
        const next = {
          ...prev,
          CylinderZones: prev.CylinderZones.filter(
            (_, i) => i !== ref.index,
          ),
          CircleZones: [
            ...prev.CircleZones,
            { Center: z.Center, Radius: z.Radius },
          ],
        };
        setSelected({
          kind: "circle",
          index: next.CircleZones.length - 1,
        });
        return next;
      }
      return prev;
    });
  };

  return {
    handles,
    selected,
    selectedZone,
    select: setSelected,
    moveCenter,
    resize,
    patchCenterRadius,
    convertKind,
    deleteSelected,
    onMapClick,
    saving: save.isPending || createFileMut.isPending,
    filePath,
    settings,
    hasFile,
    isCreatingFile: createFileMut.isPending,
    createFile: () => createFileMut.mutate(),
    placeKind,
    setPlaceKind,
    polygonDraft,
    finishPolygon,
    cancelPolygon,
  };
}

// ---------- Sidebar: Safezones ----------

function SafezonesSidebar({
  controller: c,
  placeMode,
  setPlaceMode,
}: {
  controller: SafezonesController;
  placeMode: boolean;
  setPlaceMode: (on: boolean) => void;
}) {
  if (!c.filePath) {
    return <EmptyBox title="Profile missing mpmissions path" />;
  }
  if (!c.hasFile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <MapPin className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            No SafeZoneSettings.json yet
          </p>
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">{c.filePath}</code> doesn't
            exist. Create it with the Expansion defaults to start
            placing zones.
          </p>
          <Button
            size="sm"
            disabled={c.isCreatingFile}
            onClick={c.createFile}
          >
            {c.isCreatingFile ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            Create settings file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 border-b border-border/60 px-3 py-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {c.handles.length} safezone{c.handles.length === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            variant={placeMode ? "default" : "outline"}
            onClick={() => setPlaceMode(!placeMode)}
          >
            {placeMode ? (
              <>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </>
            ) : (
              <>
                <Target className="mr-1 h-3.5 w-3.5" /> Place on map
              </>
            )}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Kind
          </Label>
          {(["circle", "cylinder", "polygon"] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={c.placeKind === k ? "default" : "outline"}
              className="h-6 flex-1 px-1.5 text-[11px] capitalize"
              onClick={() => c.setPlaceKind(k)}
            >
              {k}
            </Button>
          ))}
        </div>
        {placeMode && c.placeKind === "polygon" ? (
          <div className="flex items-center justify-between gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1">
            <span className="text-[11px]">
              {c.polygonDraft.length} vertex
              {c.polygonDraft.length === 1 ? "" : "es"} ·{" "}
              {c.polygonDraft.length < 3
                ? `need ${3 - c.polygonDraft.length} more`
                : "ready"}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px]"
                disabled={c.polygonDraft.length === 0}
                onClick={c.cancelPolygon}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={c.polygonDraft.length < 3}
                onClick={c.finishPolygon}
              >
                Finish
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
        {c.handles.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No safezones yet — click <strong>Place on map</strong>.
          </li>
        ) : (
          c.handles.map((h) => {
            const isSelected =
              c.selected?.kind === h.kind && c.selected.index === h.index;
            return (
              <li key={`${h.kind}:${h.index}`}>
                <button
                  onClick={() =>
                    c.select({ kind: h.kind, index: h.index })
                  }
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40",
                    isSelected && "bg-muted/70",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium capitalize">
                    {h.kind}
                    {h.kind !== "polygon" ? (
                      <Badge variant="secondary" className="h-4 text-[10px]">
                        r={Math.round(h.radius)}m
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="h-4 text-[10px]">
                        {h.positions.length} pts
                      </Badge>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {h.center[0].toFixed(0)}, {h.center[2].toFixed(0)}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {c.selectedZone ? (
        <div className="overflow-y-auto">
          <SafezoneForm
            key={`${c.selectedZone.kind}:${c.selectedZone.index}`}
            zone={c.selectedZone}
            onCommit={c.patchCenterRadius}
            onConvertKind={(nextKind) =>
              c.convertKind(
                { kind: c.selectedZone!.kind, index: c.selectedZone!.index },
                nextKind,
              )
            }
            onDelete={c.deleteSelected}
          />
        </div>
      ) : null}
    </>
  );
}

// ---------- Quest NPCs controller ----------

interface QuestNpcsController {
  handles: QuestNpcHandle[];
  selectedPath: string | null;
  select: (path: string | null) => void;
  selectedNpc: QuestNPC | null;
  movePin: (
    path: string,
    next: { x: number; y: number; z: number },
  ) => void;
  patchSelected: (patch: Partial<QuestNPC>) => void;
  onMapClick: (pos: { x: number; z: number }) => void;
  saving: boolean;
  /** Relative path of the NPCs folder. `null` when Expansion's
   *  quest tree isn't in the workspace yet — the sidebar renders an
   *  empty-with-hint state in that case. */
  folderRel: string | null;
  hasQuestSubsystem: boolean;
}

function useQuestNpcsController({
  profileId,
  active,
  enabled,
  placeMode,
  onPlaced,
}: {
  profileId: string | null;
  active: ServerProfile | null;
  enabled: boolean;
  placeMode: boolean;
  onPlaced: () => void;
}): QuestNpcsController {
  const qc = useQueryClient();
  const profilesRel = active?.paths.profilesRelative.replace(/\/$/, "") ?? null;

  const folderRel = useMemo(
    () =>
      profilesRel
        ? `${profilesRel}/ExpansionMod/Quests/NPCs`
        : null,
    [profilesRel],
  );

  // List of NPC JSON files.
  const fileListQuery = useQuery<MissionDirEntry[]>({
    queryKey:
      profileId && folderRel
        ? ["expansion-npc-files", profileId, folderRel]
        : ["none"],
    queryFn: async () => {
      if (!profileId || !folderRel) return [];
      try {
        const listing = await tauri.expansionListDir(profileId, folderRel);
        return listing.entries.filter(
          (e) => !e.isDir && e.extension === "json",
        );
      } catch {
        return [];
      }
    },
    enabled: !!(enabled && profileId && folderRel),
    staleTime: 10_000,
  });
  const files = useMemo(
    () => fileListQuery.data ?? [],
    [fileListQuery.data],
  );

  // Load each NPC file in parallel. Cheap on a typical server (a
  // few dozen NPCs); the per-file query key means single-file saves
  // don't thrash the whole list.
  const npcQueries = useQueries({
    queries: files.map((f) => ({
      queryKey: ["expansion-npc", profileId, f.relativePath],
      queryFn: async (): Promise<QuestNPC> => {
        const raw = await tauri.expansionSettingsRead(
          profileId!,
          f.relativePath,
        );
        return JSON.parse(raw) as QuestNPC;
      },
      staleTime: 30_000,
      enabled: !!profileId,
    })),
  });

  const buildings = useQuery({
    queryKey: profileId ? ["buildings-placements", profileId] : ["none"],
    queryFn: () => tauri.buildingsPlacementsGet(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 60_000,
  });
  const nearestY = useCallback(
    (x: number, z: number) =>
      nearestBuildingY(buildings.data?.placements ?? null, x, z)?.y ?? null,
    [buildings.data?.placements],
  );

  const save = useMutation({
    mutationFn: async (args: { path: string; data: QuestNPC }) => {
      if (!profileId) throw new Error("no profile");
      await tauri.expansionSettingsWrite(
        profileId,
        args.path,
        JSON.stringify(args.data, null, 4),
      );
    },
    onSuccess: (_r, args) => {
      qc.setQueryData(
        ["expansion-npc", profileId, args.path],
        args.data,
      );
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createNpc = useMutation({
    mutationFn: async (args: { id: number; pos: [number, number, number] }) => {
      if (!profileId || !folderRel) throw new Error("no profile");
      const path = `${folderRel}/QuestNPC_${args.id}.json`;
      const data: QuestNPC = {
        ...DEFAULT_QUEST_NPC,
        ID: args.id,
        Position: args.pos,
      };
      await tauri.expansionSettingsWrite(
        profileId,
        path,
        JSON.stringify(data, null, 4),
      );
      return { path, data };
    },
    onSuccess: ({ path }) => {
      qc.invalidateQueries({
        queryKey: ["expansion-npc-files", profileId, folderRel],
      });
      setSelectedPath(path);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handles: QuestNpcHandle[] = useMemo(() => {
    const out: QuestNpcHandle[] = [];
    files.forEach((f, i) => {
      const data = npcQueries[i]?.data;
      if (!data) return;
      out.push({
        path: f.relativePath,
        id: data.ID,
        name: data.NPCName || f.name.replace(/\.json$/i, ""),
        position: data.Position,
        active: data.Active === 1,
      });
    });
    return out;
  }, [files, npcQueries]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  useEffect(() => {
    if (selectedPath) return;
    if (handles.length > 0) setSelectedPath(handles[0].path);
  }, [handles, selectedPath]);

  const selectedNpc: QuestNPC | null = useMemo(() => {
    if (!selectedPath) return null;
    const idx = files.findIndex((f) => f.relativePath === selectedPath);
    return idx >= 0 ? npcQueries[idx]?.data ?? null : null;
  }, [files, npcQueries, selectedPath]);

  const patchSelected = (patch: Partial<QuestNPC>) => {
    if (!selectedPath || !selectedNpc) return;
    save.mutate({ path: selectedPath, data: { ...selectedNpc, ...patch } });
  };

  const movePin = (
    path: string,
    next: { x: number; y: number; z: number },
  ) => {
    const idx = files.findIndex((f) => f.relativePath === path);
    const data = idx >= 0 ? npcQueries[idx]?.data : null;
    if (!data) return;
    const y = nearestY(next.x, next.z);
    save.mutate({
      path,
      data: {
        ...data,
        Position: [next.x, y ?? data.Position[1], next.z],
      },
    });
  };

  const onMapClick = (pos: { x: number; z: number }) => {
    if (!placeMode || !folderRel) return;
    const y = nearestY(pos.x, pos.z) ?? 0;
    // Pick the next free integer ID so the file name convention
    // matches the shipped examples (`QuestNPC_<ID>.json`).
    const taken = new Set<number>();
    for (const h of handles) taken.add(h.id);
    let id = 1;
    while (taken.has(id)) id += 1;
    createNpc.mutate(
      { id, pos: [pos.x, y, pos.z] },
      {
        onSuccess: () => {
          onPlaced();
          toast.success(`quest NPC #${id} created`);
        },
      },
    );
  };

  return {
    handles,
    selectedPath,
    select: setSelectedPath,
    selectedNpc,
    movePin,
    patchSelected,
    onMapClick,
    saving: save.isPending || createNpc.isPending,
    folderRel,
    hasQuestSubsystem: folderRel !== null,
  };
}

// ---------- Sidebar: Quest NPCs ----------

function QuestNpcsSidebar({
  controller: c,
  placeMode,
  setPlaceMode,
}: {
  controller: QuestNpcsController;
  placeMode: boolean;
  setPlaceMode: (on: boolean) => void;
}) {
  if (!c.hasQuestSubsystem) {
    return <EmptyBox title="Profile missing ExpansionMod/Quests/NPCs path" />;
  }
  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
        <span className="font-medium">
          {c.handles.length} quest NPC{c.handles.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant={placeMode ? "default" : "outline"}
          onClick={() => setPlaceMode(!placeMode)}
        >
          {placeMode ? (
            <>
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </>
          ) : (
            <>
              <Target className="mr-1 h-3.5 w-3.5" /> Place on map
            </>
          )}
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
        {c.handles.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No quest NPCs yet — click <strong>Place on map</strong>{" "}
            then click a spot, or create one on the{" "}
            <Link
              to="/app/mods/expansion/quest-npcs"
              className="text-primary hover:underline"
            >
              Quest NPCs page
            </Link>
            .
          </li>
        ) : (
          c.handles.map((h) => (
            <li key={h.path}>
              <button
                onClick={() => c.select(h.path)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40",
                  c.selectedPath === h.path && "bg-muted/70",
                  !h.active && "opacity-60",
                )}
              >
                <span className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="h-4 font-mono text-[10px]">
                    #{h.id}
                  </Badge>
                  <span className="truncate font-medium">
                    {h.name || "(unnamed)"}
                  </span>
                  {!h.active ? (
                    <Badge
                      variant="outline"
                      className="h-4 border-severity-warning/40 text-[9px] text-severity-warning"
                    >
                      inactive
                    </Badge>
                  ) : null}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {h.position[0].toFixed(0)}, {h.position[1].toFixed(1)},{" "}
                  {h.position[2].toFixed(0)}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      {c.selectedNpc && c.selectedPath ? (
        <QuestNpcForm
          key={c.selectedPath}
          npc={c.selectedNpc}
          path={c.selectedPath}
          onCommit={c.patchSelected}
        />
      ) : null}
    </>
  );
}

function QuestNpcForm({
  npc,
  path,
  onCommit,
}: {
  npc: QuestNPC;
  path: string;
  onCommit: (patch: Partial<QuestNPC>) => void;
}) {
  const [name, setName] = useState(npc.NPCName);
  const [text, setText] = useState(npc.DefaultNPCText);

  useEffect(() => {
    setName(npc.NPCName);
    setText(npc.DefaultNPCText);
  }, [npc.NPCName, npc.DefaultNPCText]);

  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed === npc.NPCName) return;
    onCommit({ NPCName: trimmed });
  };
  const commitText = () => {
    if (text === npc.DefaultNPCText) return;
    onCommit({ DefaultNPCText: text });
  };

  const questNpcsDeepLink = `/app/mods/expansion/quest-npcs?name=${encodeURIComponent(
    path.split("/").pop()?.replace(/\.json$/i, "") ?? "",
  )}`;

  return (
    <div className="space-y-2 border-t border-border/60 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Quick edit
        </Label>
        <Link
          to={questNpcsDeepLink}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          title="Open the full quest-NPC editor with dialogue, waypoints, emotes."
        >
          <ExternalLink className="h-3 w-3" /> Full editor
        </Link>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Display name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          className="h-7 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Default dialogue</Label>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          className="h-7 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Faction</Label>
          <FactionPicker
            value={npc.NPCFaction}
            onChange={(v) => onCommit({ NPCFaction: v })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Loadout</Label>
          <LoadoutPicker
            value={npc.NPCLoadoutFile}
            onChange={(v) => onCommit({ NPCLoadoutFile: v })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 pt-1 text-[11px]">
        <input
          type="checkbox"
          checked={npc.Active === 1}
          onChange={(e) => onCommit({ Active: e.target.checked ? 1 : 0 })}
        />
        Active on boot
      </label>
      <p className="text-[10px] text-muted-foreground">
        Position drags from the map pin · dialogue, waypoints, emotes
        live in the full editor.
      </p>
    </div>
  );
}

// ---------- AI Patrols controller ----------

// (TS interface is generated by the page above; the impl returns
// the same shape including the new path-editing actions.)
interface AiPatrolsController {
  handles: AiPatrolHandle[];
  selectedIndex: number | null;
  select: (idx: number | null) => void;
  selectedPatrol: AIPatrol | null;
  moveSpawn: (index: number, next: { x: number; z: number }) => void;
  patchSelected: (patch: Partial<AIPatrol>) => void;
  deleteSelected: () => void;
  onMapClick: (pos: { x: number; z: number }) => void;
  /** Append a vertex to the selected patrol's path. No-op when
   *  no patrol is selected. */
  appendWaypoint: (pos: { x: number; z: number }) => void;
  /** Drop the last vertex (keeps the spawn). */
  removeLastWaypoint: () => void;
  /** Reset path to spawn-only. */
  clearPath: () => void;
  saving: boolean;
  /** Mission-relative path to the settings file; null when the
   *  profile has no mpmissions configured. */
  filePath: string | null;
  hasFile: boolean;
  isCreatingFile: boolean;
  createFile: () => void;
}

function useAiPatrolsController({
  profileId,
  active,
  enabled,
  placeMode,
  onPlaced,
}: {
  profileId: string | null;
  active: ServerProfile | null;
  enabled: boolean;
  placeMode: boolean;
  onPlaced: () => void;
}): AiPatrolsController {
  const qc = useQueryClient();

  const filePath = useMemo(() => {
    const mpRel = active?.paths.mpmissionsRelative.replace(/\/$/, "");
    return mpRel
      ? `${mpRel}/expansion/settings/AIPatrolSettings.json`
      : null;
  }, [active?.paths.mpmissionsRelative]);

  const query = useQuery<AIPatrolSettings | null>({
    queryKey:
      profileId && filePath
        ? ["ai-patrol-settings", profileId, filePath]
        : ["none"],
    queryFn: async () => {
      try {
        const raw = await tauri.expansionMissionRead(profileId!, filePath!);
        return parseAIPatrolSettings(raw);
      } catch {
        // Absent file — surface null so the sidebar offers a
        // "create the default" flow instead of erroring.
        return null;
      }
    },
    enabled: !!(enabled && profileId && filePath),
    staleTime: 5_000,
  });
  const settings = query.data ?? null;

  const buildings = useQuery({
    queryKey: profileId ? ["buildings-placements", profileId] : ["none"],
    queryFn: () => tauri.buildingsPlacementsGet(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 60_000,
  });
  const nearestY = useCallback(
    (x: number, z: number) =>
      nearestBuildingY(buildings.data?.placements ?? null, x, z)?.y ?? null,
    [buildings.data?.placements],
  );

  const save = useMutation({
    mutationFn: async (next: AIPatrolSettings) => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeAIPatrolSettings(next),
      );
    },
    onSuccess: (_r, next) => {
      if (!profileId || !filePath) return;
      qc.setQueryData(["ai-patrol-settings", profileId, filePath], next);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createFileMut = useMutation({
    mutationFn: async () => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeAIPatrolSettings(DEFAULT_AIPATROL_SETTINGS),
      );
    },
    onSuccess: () => {
      qc.setQueryData(
        ["ai-patrol-settings", profileId, filePath],
        DEFAULT_AIPATROL_SETTINGS,
      );
      toast.success("AIPatrolSettings.json created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handles: AiPatrolHandle[] = useMemo(() => {
    return (settings?.Patrols ?? []).map((patrol, index) => ({
      index,
      patrol,
    }));
  }, [settings]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  useEffect(() => {
    if (selectedIndex !== null) return;
    if (handles.length > 0) setSelectedIndex(0);
  }, [handles, selectedIndex]);

  const selectedPatrol: AIPatrol | null =
    selectedIndex !== null && settings
      ? settings.Patrols[selectedIndex] ?? null
      : null;

  const patchSelected = (patch: Partial<AIPatrol>) => {
    if (!settings || selectedIndex === null) return;
    const next = { ...settings, Patrols: [...settings.Patrols] };
    next.Patrols[selectedIndex] = {
      ...next.Patrols[selectedIndex],
      ...patch,
    };
    save.mutate(next);
  };

  const deleteSelected = () => {
    if (!settings || selectedIndex === null) return;
    const next = {
      ...settings,
      Patrols: settings.Patrols.filter((_, i) => i !== selectedIndex),
    };
    setSelectedIndex(null);
    save.mutate(next);
  };

  const moveSpawn = (index: number, delta: { x: number; z: number }) => {
    if (!settings) return;
    const patrol = settings.Patrols[index];
    if (!patrol || patrol.Waypoints.length === 0) return;
    // Shift every waypoint by the same delta so the patrol route
    // moves as a rigid unit — per-vertex editing is a later slice.
    const first = patrol.Waypoints[0];
    const dx = delta.x - first[0];
    const dz = delta.z - first[2];
    const shifted = patrol.Waypoints.map<[number, number, number]>((w) => [
      w[0] + dx,
      w[1],
      w[2] + dz,
    ]);
    // Snap spawn Y to nearest-building so dropped patrols don't
    // float at the previous origin's elevation.
    const snappedY = nearestY(delta.x, delta.z);
    if (snappedY !== null) shifted[0] = [delta.x, snappedY, delta.z];
    const next = { ...settings, Patrols: [...settings.Patrols] };
    next.Patrols[index] = { ...patrol, Waypoints: shifted };
    save.mutate(next);
  };

  const onMapClick = (pos: { x: number; z: number }) => {
    if (!placeMode || !settings) return;
    const y = nearestY(pos.x, pos.z) ?? 0;
    // Unique name per click so operators can tell fresh patrols
    // apart until they rename them.
    const name = `Patrol_${Date.now().toString().slice(-6)}`;
    const next: AIPatrolSettings = {
      ...settings,
      Patrols: [...settings.Patrols, defaultPatrol(name, [pos.x, y, pos.z])],
    };
    save.mutate(next, {
      onSuccess: () => {
        setSelectedIndex(next.Patrols.length - 1);
        onPlaced();
      },
    });
  };

  /** Append a waypoint to the currently-selected patrol. The Y is
   *  snapped to the nearest building's elevation (same heuristic
   *  the place-spawn flow uses) so each vertex follows terrain
   *  instead of floating at the spawn's Y. */
  const appendWaypoint = (pos: { x: number; z: number }) => {
    if (!settings || selectedIndex === null) return;
    const patrol = settings.Patrols[selectedIndex];
    if (!patrol) return;
    const y = nearestY(pos.x, pos.z) ?? patrol.Waypoints[0]?.[1] ?? 0;
    const next = { ...settings, Patrols: [...settings.Patrols] };
    next.Patrols[selectedIndex] = {
      ...patrol,
      Waypoints: [...patrol.Waypoints, [pos.x, y, pos.z]],
    };
    save.mutate(next);
  };

  /** Pop the last waypoint off the selected patrol. Refuses to
   *  remove the spawn (index 0) — that's `deleteSelected`'s job. */
  const removeLastWaypoint = () => {
    if (!settings || selectedIndex === null) return;
    const patrol = settings.Patrols[selectedIndex];
    if (!patrol || patrol.Waypoints.length <= 1) return;
    const next = { ...settings, Patrols: [...settings.Patrols] };
    next.Patrols[selectedIndex] = {
      ...patrol,
      Waypoints: patrol.Waypoints.slice(0, -1),
    };
    save.mutate(next);
  };

  /** Reset the patrol to spawn-only (drops every non-spawn vertex). */
  const clearPath = () => {
    if (!settings || selectedIndex === null) return;
    const patrol = settings.Patrols[selectedIndex];
    if (!patrol || patrol.Waypoints.length <= 1) return;
    const next = { ...settings, Patrols: [...settings.Patrols] };
    next.Patrols[selectedIndex] = {
      ...patrol,
      Waypoints: [patrol.Waypoints[0]],
    };
    save.mutate(next);
  };

  return {
    handles,
    selectedIndex,
    select: setSelectedIndex,
    selectedPatrol,
    moveSpawn,
    patchSelected,
    deleteSelected,
    onMapClick,
    appendWaypoint,
    removeLastWaypoint,
    clearPath,
    saving: save.isPending || createFileMut.isPending,
    filePath,
    hasFile: settings !== null,
    isCreatingFile: createFileMut.isPending,
    createFile: () => createFileMut.mutate(),
  };
}

// ---------- Sidebar: AI Patrols ----------

const AI_BEHAVIOUR_VALUES = [
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

const AI_SPEED_VALUES = [
  "STATIC",
  "WALK",
  "JOG",
  "SPRINT",
  "RANDOM",
  "RANDOM_NONSTATIC",
] as const;

function AiPatrolsSidebar({
  controller: c,
  placeMode,
  setPlaceMode,
  drawPathMode,
  setDrawPathMode,
}: {
  controller: AiPatrolsController;
  placeMode: boolean;
  setPlaceMode: (on: boolean) => void;
  drawPathMode: boolean;
  setDrawPathMode: (on: boolean) => void;
}) {
  if (!c.filePath) {
    return <EmptyBox title="Profile missing mpmissions path" />;
  }
  if (!c.hasFile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <Swords className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            No AIPatrolSettings.json yet
          </p>
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">{c.filePath}</code> doesn't
            exist. Create it with the Expansion defaults to start
            placing patrols.
          </p>
          <Button
            size="sm"
            disabled={c.isCreatingFile}
            onClick={c.createFile}
          >
            {c.isCreatingFile ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            Create settings file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
        <span className="font-medium">
          {c.handles.length} patrol{c.handles.length === 1 ? "" : "s"}
        </span>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={placeMode ? "default" : "outline"}
            onClick={() => setPlaceMode(!placeMode)}
          >
            {placeMode ? (
              <>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </>
            ) : (
              <>
                <Target className="mr-1 h-3.5 w-3.5" /> Place on map
              </>
            )}
          </Button>
          {/* Draw-path mode is meaningful only when a patrol is
              selected; the button stays mounted but disabled
              otherwise so the toolbar layout stays stable. */}
          <Button
            size="sm"
            variant={drawPathMode ? "default" : "outline"}
            disabled={c.selectedIndex === null}
            onClick={() => setDrawPathMode(!drawPathMode)}
            title={
              c.selectedIndex === null
                ? "Select a patrol to draw its path"
                : "Click the map to append a waypoint to this patrol"
            }
          >
            {drawPathMode ? (
              <>
                <X className="mr-1 h-3.5 w-3.5" /> Stop drawing
              </>
            ) : (
              <>
                <Spline className="mr-1 h-3.5 w-3.5" /> Draw path
              </>
            )}
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
        {c.handles.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No patrols yet. Click{" "}
            <strong>Place on map</strong> then click a spot.
          </li>
        ) : (
          c.handles.map((h) => {
            const first = h.patrol.Waypoints[0];
            return (
              <li key={h.index}>
                <button
                  onClick={() => c.select(h.index)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40",
                    c.selectedIndex === h.index && "bg-muted/70",
                  )}
                >
                  <span className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="h-4 text-[10px]">
                      {h.patrol.Faction || "no-faction"}
                    </Badge>
                    <span className="truncate font-medium">
                      {h.patrol.Name || "(unnamed)"}
                    </span>
                    <Badge variant="secondary" className="h-4 text-[10px]">
                      {h.patrol.Waypoints.length}wp
                    </Badge>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {first
                      ? `${first[0].toFixed(0)}, ${first[2].toFixed(0)}`
                      : "no waypoints"}
                    {" · "}
                    {h.patrol.NumberOfAI} AI · {h.patrol.Behaviour}
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
      {c.selectedPatrol !== null && c.selectedIndex !== null ? (
        <AiPatrolForm
          key={c.selectedIndex}
          patrol={c.selectedPatrol}
          onCommit={c.patchSelected}
          onDelete={c.deleteSelected}
          onRemoveLastWaypoint={c.removeLastWaypoint}
          onClearPath={c.clearPath}
        />
      ) : null}
    </>
  );
}

function AiPatrolForm({
  patrol,
  onCommit,
  onDelete,
  onRemoveLastWaypoint,
  onClearPath,
}: {
  patrol: AIPatrol;
  onCommit: (patch: Partial<AIPatrol>) => void;
  onDelete: () => void;
  onRemoveLastWaypoint: () => void;
  onClearPath: () => void;
}) {
  const [name, setName] = useState(patrol.Name);
  const [numberOfAI, setNumberOfAI] = useState(String(patrol.NumberOfAI));
  // Units now use the chip-based picker — no local text draft.
  const [formationScale, setFormationScale] = useState(
    String(patrol.FormationScale),
  );
  const [formationLooseness, setFormationLooseness] = useState(
    String(patrol.FormationLooseness),
  );
  const [minAccuracy, setMinAccuracy] = useState(String(patrol.MinAccuracy));
  const [maxAccuracy, setMaxAccuracy] = useState(String(patrol.MaxAccuracy));

  useEffect(() => {
    setName(patrol.Name);
    setNumberOfAI(String(patrol.NumberOfAI));
    setFormationScale(String(patrol.FormationScale));
    setFormationLooseness(String(patrol.FormationLooseness));
    setMinAccuracy(String(patrol.MinAccuracy));
    setMaxAccuracy(String(patrol.MaxAccuracy));
  }, [
    patrol.Name,
    patrol.NumberOfAI,
    patrol.FormationScale,
    patrol.FormationLooseness,
    patrol.MinAccuracy,
    patrol.MaxAccuracy,
  ]);

  const commitName = () => {
    if (name === patrol.Name) return;
    onCommit({ Name: name });
  };
  const commitNumberOfAI = () => {
    const n = Number(numberOfAI);
    if (Number.isFinite(n) && n !== patrol.NumberOfAI) {
      onCommit({ NumberOfAI: n });
    } else {
      setNumberOfAI(String(patrol.NumberOfAI));
    }
  };
  // Generic numeric field commit helper. Resets the draft to the
  // canonical patrol value when the parsed number is invalid or
  // unchanged so the input never gets stuck on stale local text.
  const commitNumericField = (
    fieldKey: keyof AIPatrol,
    draft: string,
    setDraft: (v: string) => void,
    current: number,
    extra?: () => void,
  ) => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n === current) {
      setDraft(String(current));
      return;
    }
    onCommit({ [fieldKey]: n } as Partial<AIPatrol>);
    extra?.();
  };

  return (
    <div className="space-y-2 border-t border-border/60 p-3 text-xs">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Quick edit
      </Label>
      <div className="space-y-1">
        <Label className="text-[10px]">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          className="h-7 text-xs"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Faction</Label>
          <FactionPicker
            value={patrol.Faction}
            onChange={(v) => onCommit({ Faction: v })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Loadout</Label>
          <LoadoutPicker
            value={patrol.Loadout}
            onChange={(v) => onCommit({ Loadout: v })}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Number of AI</Label>
          <Input
            type="number"
            value={numberOfAI}
            onChange={(e) => setNumberOfAI(e.target.value)}
            onBlur={commitNumberOfAI}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Behaviour</Label>
          <Select
            value={patrol.Behaviour}
            onValueChange={(v) => onCommit({ Behaviour: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_BEHAVIOUR_VALUES.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Speed</Label>
          <Select
            value={patrol.Speed}
            onValueChange={(v) => onCommit({ Speed: v })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_SPEED_VALUES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px]">Units</Label>
        <UnitsPicker
          value={patrol.Units}
          onChange={(next) => onCommit({ Units: next })}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Formation</Label>
          <Input
            value={patrol.Formation}
            onChange={(e) => onCommit({ Formation: e.target.value })}
            list="dzcm-eai-formations"
            className="h-7 font-mono text-xs"
            spellCheck={false}
          />
          {/* Datalist with the common eAI formation names — free-
              text is allowed so mod-fork formations still serialise
              correctly. */}
          <datalist id="dzcm-eai-formations">
            <option value="Vee" />
            <option value="Column" />
            <option value="ColumnDouble" />
            <option value="Wedge" />
            <option value="Line" />
            <option value="File" />
            <option value="Ring" />
            <option value="Random" />
          </datalist>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Form. scale</Label>
          <Input
            type="number"
            step="0.1"
            value={formationScale}
            onChange={(e) => setFormationScale(e.target.value)}
            onBlur={() =>
              commitNumericField(
                "FormationScale",
                formationScale,
                setFormationScale,
                patrol.FormationScale,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Form. looseness</Label>
          <Input
            type="number"
            step="0.1"
            value={formationLooseness}
            onChange={(e) => setFormationLooseness(e.target.value)}
            onBlur={() =>
              commitNumericField(
                "FormationLooseness",
                formationLooseness,
                setFormationLooseness,
                patrol.FormationLooseness,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-7 font-mono text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px]">Min accuracy</Label>
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={minAccuracy}
            onChange={(e) => setMinAccuracy(e.target.value)}
            onBlur={() =>
              commitNumericField(
                "MinAccuracy",
                minAccuracy,
                setMinAccuracy,
                patrol.MinAccuracy,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-7 font-mono text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px]">Max accuracy</Label>
          <Input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={maxAccuracy}
            onChange={(e) => setMaxAccuracy(e.target.value)}
            onBlur={() =>
              commitNumericField(
                "MaxAccuracy",
                maxAccuracy,
                setMaxAccuracy,
                patrol.MaxAccuracy,
              )
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-7 font-mono text-xs"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Accuracy is a 0–1 range — the engine rolls a value between
        Min and Max per shot. Anything else not exposed here lives
        in <code>expansion/settings/AIPatrolSettings.json</code>.
      </p>
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Path · {patrol.Waypoints.length} waypoint
          {patrol.Waypoints.length === 1 ? "" : "s"}
        </Label>
        <p className="text-[10px] text-muted-foreground">
          Click <strong>Draw path</strong> in the toolbar then click
          the map to append waypoints. The first waypoint is the
          spawn — drag it to move the whole route.
        </p>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={patrol.Waypoints.length <= 1}
            onClick={onRemoveLastWaypoint}
            title="Remove the last waypoint (keeps spawn)"
          >
            Remove last
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={patrol.Waypoints.length <= 1}
            onClick={onClearPath}
            title="Reset to spawn-only"
          >
            Clear path
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete patrol
      </Button>
    </div>
  );
}

// ---------- Spawn Selection controller ----------

interface SpawnSelectionController {
  handles: SpawnLocationHandle[];
  selectedIndex: number | null;
  select: (idx: number | null) => void;
  selectedLocation: SpawnLocation | null;
  movePosition: (
    locationIndex: number,
    positionIndex: number,
    next: { x: number; z: number },
  ) => void;
  patchSelected: (patch: Partial<SpawnLocation>) => void;
  removePosition: (locationIndex: number, positionIndex: number) => void;
  deleteSelected: () => void;
  /** When non-null, the next map click inserts a position into
   *  that location instead of creating a fresh location. Set via
   *  the sidebar's "Add position" button. */
  addToIndex: number | null;
  setAddToIndex: (idx: number | null) => void;
  onMapClick: (pos: { x: number; z: number }) => void;
  saving: boolean;
  filePath: string | null;
  hasFile: boolean;
  isCreatingFile: boolean;
  createFile: () => void;
}

function useSpawnSelectionController({
  profileId,
  active,
  enabled,
  placeMode,
  onPlaced,
}: {
  profileId: string | null;
  active: ServerProfile | null;
  enabled: boolean;
  placeMode: boolean;
  onPlaced: () => void;
}): SpawnSelectionController {
  const qc = useQueryClient();

  const filePath = useMemo(() => {
    const mpRel = active?.paths.mpmissionsRelative.replace(/\/$/, "");
    return mpRel
      ? `${mpRel}/expansion/settings/SpawnSettings.json`
      : null;
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
    enabled: !!(enabled && profileId && filePath),
    staleTime: 5_000,
  });
  const settings = query.data ?? null;

  const buildings = useQuery({
    queryKey: profileId ? ["buildings-placements", profileId] : ["none"],
    queryFn: () => tauri.buildingsPlacementsGet(profileId!),
    enabled: enabled && !!profileId,
    staleTime: 60_000,
  });
  const nearestY = useCallback(
    (x: number, z: number) =>
      nearestBuildingY(buildings.data?.placements ?? null, x, z)?.y ?? null,
    [buildings.data?.placements],
  );

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
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const createFileMut = useMutation({
    mutationFn: async () => {
      if (!profileId || !filePath) throw new Error("no profile");
      await tauri.expansionMissionWrite(
        profileId,
        filePath,
        serializeSpawnSettings(DEFAULT_SPAWN_SETTINGS),
      );
    },
    onSuccess: () => {
      qc.setQueryData(
        ["spawn-settings", profileId, filePath],
        DEFAULT_SPAWN_SETTINGS,
      );
      toast.success("SpawnSettings.json created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handles: SpawnLocationHandle[] = useMemo(() => {
    return (settings?.SpawnLocations ?? []).map((loc, index) => ({
      index,
      name: loc.Name || `(location ${index + 1})`,
      positions: loc.Positions as [number, number, number][],
    }));
  }, [settings]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [addToIndex, setAddToIndex] = useState<number | null>(null);

  useEffect(() => {
    if (selectedIndex !== null) return;
    if (handles.length > 0) setSelectedIndex(0);
  }, [handles, selectedIndex]);

  // If the user selects a different location (or deselects), we
  // drop any pending "add position" intent so clicks don't leak
  // into the wrong location.
  useEffect(() => {
    setAddToIndex(null);
  }, [selectedIndex]);

  const selectedLocation: SpawnLocation | null =
    selectedIndex !== null && settings
      ? settings.SpawnLocations[selectedIndex] ?? null
      : null;

  const patchSelected = (patch: Partial<SpawnLocation>) => {
    if (!settings || selectedIndex === null) return;
    const next: SpawnSettings = {
      ...settings,
      SpawnLocations: [...settings.SpawnLocations],
    };
    next.SpawnLocations[selectedIndex] = {
      ...next.SpawnLocations[selectedIndex],
      ...patch,
    };
    save.mutate(next);
  };

  const deleteSelected = () => {
    if (!settings || selectedIndex === null) return;
    const next: SpawnSettings = {
      ...settings,
      SpawnLocations: settings.SpawnLocations.filter(
        (_, i) => i !== selectedIndex,
      ),
    };
    setSelectedIndex(null);
    save.mutate(next);
  };

  const movePosition = (
    locationIndex: number,
    positionIndex: number,
    next: { x: number; z: number },
  ) => {
    if (!settings) return;
    const loc = settings.SpawnLocations[locationIndex];
    if (!loc) return;
    const y = nearestY(next.x, next.z);
    const newPos: [number, number, number] = [
      next.x,
      y ?? loc.Positions[positionIndex]?.[1] ?? 0,
      next.z,
    ];
    const nextPositions = [...loc.Positions] as [number, number, number][];
    nextPositions[positionIndex] = newPos;
    const nextSettings: SpawnSettings = {
      ...settings,
      SpawnLocations: [...settings.SpawnLocations],
    };
    nextSettings.SpawnLocations[locationIndex] = {
      ...loc,
      Positions: nextPositions,
    };
    save.mutate(nextSettings);
  };

  const removePosition = (
    locationIndex: number,
    positionIndex: number,
  ) => {
    if (!settings) return;
    const loc = settings.SpawnLocations[locationIndex];
    if (!loc) return;
    if (loc.Positions.length <= 1) {
      // Removing the last position would leave the location
      // positionless, which breaks Expansion's marker rendering.
      // Require the operator to delete the whole location instead.
      toast.error(
        "Can't remove the only position — delete the location instead.",
      );
      return;
    }
    const nextPositions = loc.Positions.filter((_, i) => i !== positionIndex);
    const nextSettings: SpawnSettings = {
      ...settings,
      SpawnLocations: [...settings.SpawnLocations],
    };
    nextSettings.SpawnLocations[locationIndex] = {
      ...loc,
      Positions: nextPositions,
    };
    save.mutate(nextSettings);
  };

  const onMapClick = (pos: { x: number; z: number }) => {
    if (!placeMode || !settings) return;
    const y = nearestY(pos.x, pos.z) ?? 0;
    const vec: [number, number, number] = [pos.x, y, pos.z];

    if (addToIndex !== null) {
      const loc = settings.SpawnLocations[addToIndex];
      if (!loc) return;
      const nextSettings: SpawnSettings = {
        ...settings,
        SpawnLocations: [...settings.SpawnLocations],
      };
      nextSettings.SpawnLocations[addToIndex] = {
        ...loc,
        Positions: [...loc.Positions, vec],
      };
      save.mutate(nextSettings, {
        onSuccess: () => {
          setAddToIndex(null);
          onPlaced();
        },
      });
      return;
    }

    // New location; use a disambiguator suffix so repeat-clicks
    // don't stomp on each other's names.
    const nextName = `Location_${settings.SpawnLocations.length + 1}`;
    const nextSettings: SpawnSettings = {
      ...settings,
      SpawnLocations: [
        ...settings.SpawnLocations,
        defaultLocation(nextName, vec),
      ],
    };
    save.mutate(nextSettings, {
      onSuccess: () => {
        setSelectedIndex(nextSettings.SpawnLocations.length - 1);
        onPlaced();
      },
    });
  };

  return {
    handles,
    selectedIndex,
    select: setSelectedIndex,
    selectedLocation,
    movePosition,
    patchSelected,
    removePosition,
    deleteSelected,
    addToIndex,
    setAddToIndex,
    onMapClick,
    saving: save.isPending || createFileMut.isPending,
    filePath,
    hasFile: settings !== null,
    isCreatingFile: createFileMut.isPending,
    createFile: () => createFileMut.mutate(),
  };
}

// ---------- Sidebar: Spawn Selection ----------

function SpawnSelectionSidebar({
  controller: c,
  placeMode,
  setPlaceMode,
}: {
  controller: SpawnSelectionController;
  placeMode: boolean;
  setPlaceMode: (on: boolean) => void;
}) {
  if (!c.filePath) {
    return <EmptyBox title="Profile missing mpmissions path" />;
  }
  if (!c.hasFile) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <UserPlus className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            No SpawnSettings.json yet
          </p>
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">{c.filePath}</code> doesn't
            exist. Create it with Expansion's defaults and start
            dropping spawn locations.
          </p>
          <Button
            size="sm"
            disabled={c.isCreatingFile}
            onClick={c.createFile}
          >
            {c.isCreatingFile ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            Create settings file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 text-xs">
        <span className="font-medium">
          {c.handles.length} location
          {c.handles.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant={placeMode ? "default" : "outline"}
          onClick={() => {
            const next = !placeMode;
            setPlaceMode(next);
            if (!next) c.setAddToIndex(null);
          }}
        >
          {placeMode ? (
            <>
              <X className="mr-1 h-3.5 w-3.5" /> Cancel
            </>
          ) : (
            <>
              <Target className="mr-1 h-3.5 w-3.5" /> Place on map
            </>
          )}
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto text-sm">
        {c.handles.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            No locations yet. Click <strong>Place on map</strong>.
          </li>
        ) : (
          c.handles.map((h) => (
            <li key={h.index}>
              <button
                onClick={() => c.select(h.index)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b border-border/30 px-3 py-2 text-left hover:bg-muted/40",
                  c.selectedIndex === h.index && "bg-muted/70",
                )}
              >
                <span className="flex items-center gap-2 text-xs">
                  <span className="truncate font-medium">{h.name}</span>
                  <Badge variant="secondary" className="h-4 text-[10px]">
                    {h.positions.length} pos
                  </Badge>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {h.positions[0]
                    ? `anchor: ${h.positions[0][0].toFixed(0)}, ${h.positions[0][2].toFixed(0)}`
                    : "no positions"}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      {c.selectedLocation && c.selectedIndex !== null ? (
        <SpawnLocationForm
          key={c.selectedIndex}
          location={c.selectedLocation}
          index={c.selectedIndex}
          addToIndex={c.addToIndex}
          placeMode={placeMode}
          onCommit={c.patchSelected}
          onRemovePosition={(pi) => c.removePosition(c.selectedIndex!, pi)}
          onToggleAddPosition={() => {
            if (c.addToIndex === c.selectedIndex) {
              c.setAddToIndex(null);
              setPlaceMode(false);
            } else {
              c.setAddToIndex(c.selectedIndex);
              setPlaceMode(true);
            }
          }}
          onDelete={c.deleteSelected}
        />
      ) : null}
    </>
  );
}

function SpawnLocationForm({
  location,
  index,
  addToIndex,
  placeMode,
  onCommit,
  onRemovePosition,
  onToggleAddPosition,
  onDelete,
}: {
  location: SpawnLocation;
  index: number;
  addToIndex: number | null;
  placeMode: boolean;
  onCommit: (patch: Partial<SpawnLocation>) => void;
  onRemovePosition: (positionIndex: number) => void;
  onToggleAddPosition: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(location.Name);

  useEffect(() => {
    setName(location.Name);
  }, [location.Name]);

  const addingHere = placeMode && addToIndex === index;

  return (
    <div className="space-y-2 border-t border-border/60 p-3 text-xs">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Quick edit
      </Label>
      <div className="space-y-1">
        <Label className="text-[10px]">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name !== location.Name) onCommit({ Name: name });
          }}
          className="h-7 text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={location.UseCooldown === 1}
          onChange={(e) =>
            onCommit({ UseCooldown: e.target.checked ? 1 : 0 })
          }
        />
        Use cooldown (requires <code>EnableRespawnCooldowns</code>)
      </label>
      <div className="space-y-1">
        <Label className="text-[10px]">
          Positions ({location.Positions.length})
        </Label>
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-border/40 bg-muted/20 p-1">
          {location.Positions.map((p, pi) => (
            <li
              key={pi}
              className="flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5 font-mono text-[11px]"
            >
              <Badge
                variant="outline"
                className={cn(
                  "h-4 text-[9px]",
                  pi === 0 && "border-yellow-500/60 text-yellow-600",
                )}
                title={pi === 0 ? "Anchor — drives the 2D marker" : "Alternate spawn"}
              >
                #{pi + 1}
              </Badge>
              <span className="flex-1 truncate">
                {p[0].toFixed(0)}, {p[1].toFixed(1)}, {p[2].toFixed(0)}
              </span>
              <button
                type="button"
                onClick={() => onRemovePosition(pi)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                title={
                  location.Positions.length === 1
                    ? "Delete the whole location to remove the last position"
                    : "Remove this position"
                }
                disabled={location.Positions.length === 1}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant={addingHere ? "default" : "outline"}
          className="h-7 w-full text-xs"
          onClick={onToggleAddPosition}
        >
          {addingHere ? (
            <>
              <X className="mr-1 h-3 w-3" /> Cancel add position
            </>
          ) : (
            <>
              <Plus className="mr-1 h-3 w-3" /> Add position to this
              location
            </>
          )}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete location
      </Button>
    </div>
  );
}

// ---------- Small helper components ----------

function EmptyBox({ title }: { title: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="space-y-2">
        <MapPin className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
      </div>
    </div>
  );
}

function CreateFirstMapFile({
  folderRel,
  isPending,
  onCreate,
}: {
  folderRel: string;
  isPending: boolean;
  onCreate: (filename: string) => void;
}) {
  const [name, setName] = useState("Traders");
  const filename = sanitizeMapFilename(name);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <MapPin className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">No trader placement files yet</p>
        <p className="text-xs text-muted-foreground">
          <code className="font-mono">{folderRel}/</code> — the folder
          is created automatically if it doesn't exist.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Traders"
            className="h-8 w-48 text-xs"
          />
          <span className="text-xs text-muted-foreground">.map</span>
          <Button
            size="sm"
            disabled={!filename || isPending}
            onClick={() => onCreate(filename)}
          >
            {isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-1 h-3.5 w-3.5" />
            )}
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

function NewFileButton({
  existing,
  isPending,
  onCreate,
}: {
  existing: string[];
  isPending: boolean;
  onCreate: (filename: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const filename = sanitizeMapFilename(name);
  const clash =
    filename &&
    existing.some((e) => e.toLowerCase() === filename.toLowerCase());
  return open ? (
    <span className="flex items-center gap-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="NewTraders"
        className="h-7 w-28 text-xs"
      />
      <Button
        size="sm"
        disabled={!filename || !!clash || isPending}
        onClick={() => {
          if (!filename) return;
          onCreate(filename);
          setOpen(false);
          setName("");
        }}
        title={clash ? "a file with this name already exists" : undefined}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
      >
        Cancel
      </Button>
    </span>
  ) : (
    <Button
      size="sm"
      variant="outline"
      onClick={() => setOpen(true)}
      title="Create a new .map file"
    >
      <Plus className="h-3.5 w-3.5" />
    </Button>
  );
}

function NewZoneButton({
  existing,
  isPending,
  onCreate,
}: {
  existing: string[];
  isPending: boolean;
  onCreate: (stem: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const stem = name.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  const clash =
    stem.length > 0 &&
    existing.some((e) => e.toLowerCase() === stem.toLowerCase());
  return open ? (
    <span className="flex items-center gap-1">
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="GreenMountain"
        className="h-7 w-28 text-xs"
      />
      <Button
        size="sm"
        disabled={!stem || clash || isPending}
        onClick={() => {
          onCreate(stem);
          setOpen(false);
          setName("");
        }}
      >
        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
      >
        Cancel
      </Button>
    </span>
  ) : (
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
      <Plus className="h-3.5 w-3.5" />
    </Button>
  );
}

function sanitizeMapFilename(raw: string): string {
  const stem = raw
    .trim()
    .replace(/\.map$/i, "")
    .replace(/[^A-Za-z0-9._-]/g, "_");
  if (!stem) return "";
  return `${stem}.map`;
}
