import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import L from "leaflet";
import { Marker } from "react-leaflet";
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Keyboard,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  PawPrint,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Target,
  Trash2,
  Undo2,
  Users,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InfoTooltip } from "@/components/InfoTooltip";
import {
  useBuildingPlacementsSnapshot,
  useBuildingsSnapshot,
} from "@/hooks/useBuildings";
import {
  useEventsSnapshot,
  useEventsUpsert,
} from "@/hooks/useEvents";
import {
  usePlayerSpawnsSnapshot,
  usePlayerSpawnsUpdate,
} from "@/hooks/usePlayerSpawns";
import {
  useCfgEnvironmentUpdate,
  useTerritoriesAddAnimal,
  useTerritoriesRemoveAnimal,
  useTerritoriesSnapshot,
  useTerritoryFileUpdate,
} from "@/hooks/useTerritories";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import { useMapSettingsStore } from "@/stores/mapSettingsStore";
import { useProfileStore } from "@/stores/profileStore";
import type {
  CeZoneOverlay,
  CeZoneSource,
  CfgEnvironment,
  DynamicEvent,
  EventPosition,
  EventSpawnGroup,
  PlayerSpawnPoints,
  SpawnPosition,
  TerritoryFileEntry,
  TerritoryZone,
  TierOverride,
} from "@/types/ipc";

import type { LandmarkPair } from "./alignmentFit";
import { fitTwoPoints } from "./alignmentFit";
import { AnimalBindingDialog } from "./AnimalBindingDialog";
import { BackgroundImageLayer } from "./BackgroundImageLayer";
import { CollapsibleSection } from "./CollapsibleSection";
import { BuildingPlacementsLayer } from "./BuildingPlacementsLayer";
import { CalibrationClicker } from "./CalibrationClicker";
import { DownloadIzurviveDialog } from "./DownloadIzurviveDialog";
import { EventPositionsLayer } from "./EventPositionsLayer";
import { MapCanvas } from "./MapCanvas";
import { dayzToLatLng, MAP_LABEL, setCustomMapSize } from "./dayzMap";
import { useFlyToEvent, useFlyToSpawn } from "./flyTo";
import { nearestBuildingY, nearestPositionY } from "./nearestY";
import {
  colorForTerritoryCategory,
  EVENT_SPAWN_COLOR,
  PLAYER_SPAWN_COLORS,
  USAGE_COLORS,
  USAGE_PRIORITY,
} from "./layerColors";
import { CeZonesLayer } from "./CeZonesLayer";
import { TierPaintLayer } from "./TierPaintLayer";
import { PlayerSpawnsLayer } from "./PlayerSpawnsLayer";
import {
  TerritoriesLayer,
  type TerritoryZoneRef,
} from "./TerritoriesLayer";
import type {
  LayersState,
  MapLayerId,
  MapSectionId,
  PlayerSpawnKind,
} from "./types";
import { DEFAULT_LAYERS } from "./types";

// ---------- Page ----------

export function MapPage() {
  const activeProfile = useProfileStore((s) => s.active);
  const location = useLocation();
  const navigate = useNavigate();

  // Custom-map profiles declare their own world-metre extent. Push
  // that into the dayzMap helpers so bounds / clamp / centre all use
  // the operator's value instead of the Chernarus-size fallback.
  useEffect(() => {
    setCustomMapSize(activeProfile?.customMapSizeM ?? null);
  }, [activeProfile?.customMapSizeM]);

  // Overlay shown when the operator presses `?`. Leaflet handles
  // pan (arrow keys) + zoom (+ / -) natively when the map has
  // focus; what we add are layer toggles and add-mode cancel.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const playerSpawns = usePlayerSpawnsSnapshot();
  const events = useEventsSnapshot();
  const buildings = useBuildingsSnapshot();
  const territoriesQuery = useTerritoriesSnapshot();
  // CE tier decoder. Keyed per profile because the live file
  // can be the profile's mission override (already customised)
  // or the P: drive vanilla fallback — we don't want two
  // profiles on the same vanilla map to clobber each other's
  // cached decode when one of them gets a first-ever write.
  const ceZonesQuery = useQuery({
    queryKey: ["ceZones", activeProfile?.id ?? "__none__"] as const,
    queryFn: () => tauri.ceZonesList(activeProfile!.id),
    enabled: !!activeProfile,
    staleTime: 5 * 60_000,
  });
  const updateSpawns = usePlayerSpawnsUpdate();
  const upsertEvents = useEventsUpsert();
  const updateTerritory = useTerritoryFileUpdate();
  const updateCfgEnvironment = useCfgEnvironmentUpdate();
  const addAnimal = useTerritoriesAddAnimal();
  const removeAnimal = useTerritoriesRemoveAnimal();

  const mapSettings = useMapSettingsStore((s) =>
    activeProfile ? s.byProfile[activeProfile.id] : undefined,
  );
  const setImage = useMapSettingsStore((s) => s.setImage);
  const setOpacity = useMapSettingsStore((s) => s.setOpacity);
  const setOffset = useMapSettingsStore((s) => s.setOffset);
  const setScale = useMapSettingsStore((s) => s.setScale);
  const resetAlignment = useMapSettingsStore((s) => s.resetAlignment);
  const setViewport = useMapSettingsStore((s) => s.setViewport);
  const setLayersInStore = useMapSettingsStore((s) => s.setLayers);
  const setSectionCollapsedInStore = useMapSettingsStore(
    (s) => s.setSectionCollapsed,
  );
  const collapsedSections = mapSettings?.collapsedSections ?? {};
  const toggleSection = useCallback(
    (section: MapSectionId) => {
      if (!activeProfile) return;
      setSectionCollapsedInStore(
        activeProfile.id,
        section,
        !(collapsedSections[section] ?? false),
      );
    },
    [activeProfile, collapsedSections, setSectionCollapsedInStore],
  );

  // Layers are persisted per-profile. The store is the source of
  // truth; `setLayers` below writes through. Initial shape falls
  // back to DEFAULT_LAYERS when a profile has never touched the
  // map before. Shallow-merge with defaults so entries persisted
  // before a new layer was added (e.g. `territories`) still have
  // every field the code expects.
  const layers: LayersState = {
    ...DEFAULT_LAYERS,
    ...(mapSettings?.layers ?? {}),
  };
  const setLayers = useCallback(
    (updater: LayersState | ((prev: LayersState) => LayersState)) => {
      if (!activeProfile) return;
      const next =
        typeof updater === "function" ? updater(layers) : updater;
      setLayersInStore(activeProfile.id, next);
    },
    [activeProfile, layers, setLayersInStore],
  );

  // Tier overlays come from the backend pre-tinted and ready to
  // paint — we just decide which are enabled. Memoised so the
  // `CeZonesLayer`'s `enabled` Set reference stays stable across
  // re-renders that don't touch visibility.
  const ceZoneOverlays: CeZoneOverlay[] = ceZonesQuery.data?.overlays ?? [];
  const ceZoneEnabled = useMemo(() => {
    const s = new Set<string>();
    if (!layers.ceZones.enabled) return s;
    for (const o of ceZoneOverlays) {
      if (!layers.ceZones.hiddenZones[o.name]) s.add(o.name);
    }
    return s;
  }, [ceZoneOverlays, layers.ceZones.enabled, layers.ceZones.hiddenZones]);
  const [izurviveOpen, setIzurviveOpen] = useState(false);
  // Backdrop wizard / settings modal — replaces the previous
  // sidebar Map-settings panel. Auto-opens semantically via the
  // top banner CTA when no image is loaded; the canvas's gear
  // button opens it for tweaks once a backdrop exists.
  const [backdropModalOpen, setBackdropModalOpen] = useState(false);
  // Calibration floating panel — owns the two-point landmark
  // workflow. Lives outside any modal so the map underneath stays
  // clickable (modals capture clicks; that broke the picking step).
  const [calibratePanelOpen, setCalibratePanelOpen] = useState(false);

  // Two-point backdrop calibration. `active` is the next slot to
  // capture when the user clicks (`1` or `2`); `null` = calibration
  // inactive. `p1`/`p2` are the clicked DayZ coord + the user's
  // entered real coord for each landmark.
  const [calibActive, setCalibActive] = useState<1 | 2 | null>(null);
  // When set, the next map click snaps to the nearest building
  // (mapgrouppos.xml) and fills that slot's REAL coord — the
  // operator can calibrate by clicking on a recognisable structure
  // instead of typing x/z values from iZurvive. Mutually exclusive
  // with `calibActive` (which picks the backdrop-side coord).
  const [calibRealPickSlot, setCalibRealPickSlot] = useState<1 | 2 | null>(
    null,
  );
  const [calibP1, setCalibP1] = useState<Partial<LandmarkPair>>({});
  const [calibP2, setCalibP2] = useState<Partial<LandmarkPair>>({});

  const [spawnsDraft, setSpawnsDraft] = useState<PlayerSpawnPoints | null>(
    null,
  );
  const [eventsDraft, setEventsDraft] = useState<EventSpawnGroup[] | null>(
    null,
  );
  const [territoriesDraft, setTerritoriesDraft] = useState<
    TerritoryFileEntry[] | null
  >(null);
  // cfgenvironment is edited through the AnimalBindingDialog — the
  // draft mirrors what the query returned and gets cleared on
  // profile change just like the geometry draft.
  const [environmentDraft, setEnvironmentDraft] =
    useState<CfgEnvironment | null>(null);
  const [selectedTerritory, setSelectedTerritory] =
    useState<TerritoryZoneRef | null>(null);
  /** When set, the binding dialog is open editing / creating this
   *  entry. `null` = closed. The dialog handles both "new custom
   *  animal" and "edit existing binding" via the `mode` field. */
  const [bindingDialog, setBindingDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; bindingIdx: number }
    | null
  >(null);
  // Mutually exclusive add-modes: only one kind of click-to-add is
  // active at a time. `spawnAdd` is the selected PlayerSpawnKind,
  // `eventAdd` is the event name to append positions to.
  const [spawnAdd, setSpawnAdd] = useState<PlayerSpawnKind | null>(null);
  const [eventAdd, setEventAdd] = useState<string | null>(null);

  // Placements are heavy (~11k rows for vanilla Chernarus). Fetch
  // lazily — only when the user has the building-placements layer
  // enabled, an event-add mode is active (we need nearest-building
  // y for new positions), or backdrop calibration is in progress
  // (the real-coord snap relies on the placement list).
  const placements = useBuildingPlacementsSnapshot(
    layers.buildingPlacements.enabled ||
      eventAdd !== null ||
      calibActive !== null ||
      calibRealPickSlot !== null,
  );
  const [flyToSpawnKind, setFlyToSpawnKind] = useState<PlayerSpawnKind | null>(
    null,
  );
  const [flyToEventName, setFlyToEventName] = useState<string | null>(null);

  // Load snapshots into local drafts.
  useEffect(() => {
    if (playerSpawns.data) setSpawnsDraft(playerSpawns.data.data);
  }, [playerSpawns.data]);
  useEffect(() => {
    if (events.data) setEventsDraft(events.data.spawns);
  }, [events.data]);
  // Reset the territory drafts when the active profile changes so
  // we don't leak the previous profile's in-memory edits.
  useEffect(() => {
    setTerritoriesDraft(null);
    setEnvironmentDraft(null);
    setSelectedTerritory(null);
    setBindingDialog(null);
    prevSyncedFilesJsonRef.current = null;
    prevSyncedEnvJsonRef.current = null;
  }, [activeProfile?.id]);
  // Keep the draft in sync with what the server last reported, but
  // **only overwrite when the user has no unsaved edits**. Tracking
  // the JSON of the previous snapshot in a ref lets us detect "draft
  // matches the last synced data" (= clean) reliably — comparing
  // against the CURRENT query data would misread a post-pull refetch
  // as "dirty" and leave the panel showing stale zones.
  //
  // Behaviour:
  // - Fresh profile / first load → populate draft from incoming.
  // - Subsequent refetches (pull, post-save cache refresh, window
  //   refocus) → resync draft when draft still matches the previous
  //   snapshot; otherwise preserve in-progress edits.
  const prevSyncedFilesJsonRef = useRef<string | null>(null);
  const prevSyncedEnvJsonRef = useRef<string | null>(null);
  // Snapshot of layer state taken when calibration starts. Hoisted
  // here (above any early returns) to keep hook order stable. See
  // Calibration section below for the helpers that read/write it.
  const calibLayerSnapshot = useRef<LayersState | null>(null);

  // ---------- CE zones painter state ----------
  // Pending per-cell tier edits, keyed by `row * 4096 + col`. Lives in
  // a ref so brush strokes don't re-render the rest of the page;
  // `paintEditCount` is bumped whenever the ref changes so the
  // panel's "Save (N cells)" label stays accurate.
  const paintEditsRef = useRef<Map<number, number>>(new Map());
  const [paintEditCount, setPaintEditCount] = useState(0);
  // True while the painter is mid-commit on a large stroke. Surfaced
  // to the CE panel's status footer so the operator sees
  // "Saving stroke…" instead of a UI hang during the cell-expand
  // pass that runs on mouseup.
  const [paintCommitting, setPaintCommitting] = useState(false);
  const [paintActive, setPaintActive] = useState(false);
  // Default brush is Tier1 (green) at 100 m — matches the smallest
  // useful editable area on Chernarus (~one CE coarse cell ≈ 256 m).
  const [paintTier, setPaintTier] = useState(0);
  const [brushRadiusM, setBrushRadiusM] = useState(100);
  const [paintMode, setPaintMode] = useState<"set" | "erase">("set");
  useEffect(() => {
    if (!territoriesQuery.data) return;
    const incoming = territoriesQuery.data.files;
    const incomingJson = JSON.stringify(incoming);
    if (territoriesDraft === null) {
      setTerritoriesDraft(incoming);
      prevSyncedFilesJsonRef.current = incomingJson;
      return;
    }
    if (incomingJson === prevSyncedFilesJsonRef.current) return;
    const draftJson = JSON.stringify(territoriesDraft);
    const wasClean = draftJson === prevSyncedFilesJsonRef.current;
    prevSyncedFilesJsonRef.current = incomingJson;
    if (wasClean) {
      setTerritoriesDraft(incoming);
    }
    // When !wasClean, the user has in-progress edits — keep them.
    // The dirty check (below) now compares against the fresh
    // baseline, so any server-side divergence surfaces as dirty.
  }, [territoriesQuery.data, territoriesDraft]);
  useEffect(() => {
    if (!territoriesQuery.data) return;
    const incomingEnv = territoriesQuery.data.environment;
    if (!incomingEnv) {
      // cfgenvironment doesn't exist on disk — if we previously had
      // one, clear the draft so the missing-env warning shows.
      if (environmentDraft !== null && prevSyncedEnvJsonRef.current !== null) {
        setEnvironmentDraft(null);
        prevSyncedEnvJsonRef.current = null;
      }
      return;
    }
    const incomingJson = JSON.stringify(incomingEnv);
    if (environmentDraft === null) {
      setEnvironmentDraft(incomingEnv);
      prevSyncedEnvJsonRef.current = incomingJson;
      return;
    }
    if (incomingJson === prevSyncedEnvJsonRef.current) return;
    const draftJson = JSON.stringify(environmentDraft);
    const wasClean = draftJson === prevSyncedEnvJsonRef.current;
    prevSyncedEnvJsonRef.current = incomingJson;
    if (wasClean) {
      setEnvironmentDraft(incomingEnv);
    }
  }, [territoriesQuery.data, environmentDraft]);

  const spawnsDirty = useMemo(() => {
    if (!spawnsDraft || !playerSpawns.data) return false;
    return (
      JSON.stringify(spawnsDraft) !== JSON.stringify(playerSpawns.data.data)
    );
  }, [spawnsDraft, playerSpawns.data]);

  const eventsDirty = useMemo(() => {
    if (!eventsDraft || !events.data) return false;
    return JSON.stringify(eventsDraft) !== JSON.stringify(events.data.spawns);
  }, [eventsDraft, events.data]);

  const territoriesDirtyByFilename = useMemo<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    if (!territoriesDraft || !territoriesQuery.data) return out;
    const baseline = new Map(
      territoriesQuery.data.files.map((e) => [e.filename, e]),
    );
    for (const d of territoriesDraft) {
      const b = baseline.get(d.filename);
      if (!b || JSON.stringify(b.data) !== JSON.stringify(d.data)) {
        out[d.filename] = true;
      }
    }
    return out;
  }, [territoriesDraft, territoriesQuery.data]);
  const territoriesDirty =
    Object.keys(territoriesDirtyByFilename).length > 0;
  const environmentDirty = useMemo(() => {
    if (!environmentDraft || !territoriesQuery.data?.environment) return false;
    return (
      JSON.stringify(environmentDraft) !==
      JSON.stringify(territoriesQuery.data.environment)
    );
  }, [environmentDraft, territoriesQuery.data]);

  const anyDirty =
    spawnsDirty || eventsDirty || territoriesDirty || environmentDirty;
  const savePending =
    updateSpawns.isPending ||
    upsertEvents.isPending ||
    updateTerritory.isPending ||
    updateCfgEnvironment.isPending ||
    addAnimal.isPending ||
    removeAnimal.isPending;

  // Deep-link parsing.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const layer = params.get("layer") as MapLayerId | null;
    const kind = params.get("kind") as PlayerSpawnKind | null;
    const name = params.get("name");

    if (layer === "player-spawns") {
      setLayers((prev) => ({
        ...prev,
        playerSpawns: {
          enabled: true,
          kinds:
            kind && (kind === "fresh" || kind === "hop" || kind === "travel")
              ? {
                  fresh: kind === "fresh",
                  hop: kind === "hop",
                  travel: kind === "travel",
                }
              : prev.playerSpawns.kinds,
        },
        eventPositions: { ...prev.eventPositions, enabled: false },
      }));
      if (kind) setFlyToSpawnKind(kind);
    } else if (layer === "event-positions") {
      setLayers((prev) => ({
        ...prev,
        playerSpawns: { ...prev.playerSpawns, enabled: false },
        eventPositions: { enabled: true, eventName: name },
      }));
      if (name) setFlyToEventName(name);
    } else if (layer === "building-placements") {
      const usage = params.get("usage");
      setLayers((prev) => ({
        ...prev,
        playerSpawns: { ...prev.playerSpawns, enabled: false },
        eventPositions: { ...prev.eventPositions, enabled: false },
        buildingPlacements: {
          enabled: true,
          usageFilter: usage,
        },
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ---------- Keyboard shortcuts ----------
  //
  // Must run BEFORE any early-return below so the hook order stays
  // stable across renders where the map is still loading vs fully
  // rendered. Cancel-calibration logic is inlined — the helper
  // declared later in the render is unreachable from here.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t) {
        const tag = t.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable) {
          return;
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "1") {
        setLayers((prev) => ({
          ...prev,
          playerSpawns: { ...prev.playerSpawns, enabled: !prev.playerSpawns.enabled },
        }));
      } else if (e.key === "2") {
        setLayers((prev) => ({
          ...prev,
          eventPositions: {
            ...prev.eventPositions,
            enabled: !prev.eventPositions.enabled,
          },
        }));
      } else if (e.key === "3") {
        setLayers((prev) => ({
          ...prev,
          buildingPlacements: {
            ...prev.buildingPlacements,
            enabled: !prev.buildingPlacements.enabled,
          },
        }));
      } else if (e.key === "4") {
        setLayers((prev) => ({
          ...prev,
          territories: {
            ...prev.territories,
            enabled: !prev.territories.enabled,
          },
        }));
      } else if (e.key === "5") {
        setLayers((prev) => ({
          ...prev,
          ceZones: {
            ...prev.ceZones,
            enabled: !prev.ceZones.enabled,
          },
        }));
      } else if (e.key === "Escape") {
        setSpawnAdd(null);
        setEventAdd(null);
        setCalibActive(null);
        setCalibRealPickSlot(null);
        setCalibP1({});
        setCalibP2({});
        setSelectedTerritory(null);
      } else if (e.key === "?" || e.key === "/") {
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setLayers]);

  if (!activeProfile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a profile to load the map.
      </div>
    );
  }

  if (
    playerSpawns.isLoading ||
    events.isLoading ||
    !spawnsDraft ||
    !eventsDraft
  ) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading map layers…
      </div>
    );
  }

  if (playerSpawns.isError) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 break-words">
            <div className="font-mono text-xs">
              {errorMessage(playerSpawns.error)}
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void playerSpawns.refetch()}
              >
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const mapId = activeProfile.map;
  const eventsList: DynamicEvent[] = events.data?.events ?? [];
  const knownEventNames = Array.from(
    new Set(eventsList.map((e) => e.name)),
  ).sort();

  const buildingPrototypes = buildings.data?.data.prototypes ?? [];
  const knownBuildingUsages = (() => {
    const s = new Set<string>();
    buildingPrototypes.forEach((p) => p.usages.forEach((u) => s.add(u)));
    return Array.from(s).sort();
  })();

  const imagePath = mapSettings?.imagePath;
  const imageOpacity = mapSettings?.imageOpacity ?? 0.7;
  const imageOffsetX = mapSettings?.imageOffsetX ?? 0;
  const imageOffsetY = mapSettings?.imageOffsetY ?? 0;
  const imageScale = mapSettings?.imageScale ?? 1;

  // ---------- Save / revert ----------

  const save = () => {
    if (spawnsDirty && spawnsDraft) {
      updateSpawns.mutate(spawnsDraft, {
        onSuccess: () =>
          toast.success("cfgplayerspawnpoints.xml saved", {
            description: `${spawnsDraft.fresh.length} fresh · ${spawnsDraft.hop.length} hop · ${spawnsDraft.travel.length} travel`,
          }),
        onError: (err) => toast.error(errorMessage(err)),
      });
    }
    if (eventsDirty && eventsDraft) {
      // Ship only the event groups that actually diverge from the
      // loaded baseline. Sending everything bloats the custom
      // cfgeventspawns file with pass-through duplicates of every
      // vanilla event — a single round-trip bug in the parser
      // (e.g. a stripped attribute) would then contaminate the
      // whole table. Send a minimal diff instead.
      const baseline = new Map(
        (events.data?.spawns ?? []).map((g) => [g.eventName, g]),
      );
      const changedSpawns = eventsDraft.filter((d) => {
        const base = baseline.get(d.eventName);
        if (!base) return true;
        return (
          JSON.stringify(base.positions) !== JSON.stringify(d.positions)
        );
      });
      upsertEvents.mutate(
        { events: eventsList, spawns: changedSpawns },
        {
          onSuccess: () => {
            const total = changedSpawns.reduce(
              (a, g) => a + g.positions.length,
              0,
            );
            toast.success("cfgeventspawns.xml saved", {
              description: `${changedSpawns.length} event group${changedSpawns.length === 1 ? "" : "s"} · ${total} position${total === 1 ? "" : "s"} written`,
            });
          },
          onError: (err) => toast.error(errorMessage(err)),
        },
      );
    }
    if (territoriesDirty && territoriesDraft) {
      // Save one file at a time, sequentially. Each backend call
      // shells out to git — parallel writes would race the index.
      const changed = territoriesDraft.filter(
        (d) => territoriesDirtyByFilename[d.filename],
      );
      (async () => {
        try {
          for (const d of changed) {
            await updateTerritory.mutateAsync({
              filename: d.filename,
              data: d.data,
            });
          }
          const totalZones = changed.reduce(
            (acc, e) =>
              acc + e.data.territories.reduce((a, t) => a + t.zones.length, 0),
            0,
          );
          toast.success("Territories saved", {
            description: `${changed.length} file${changed.length === 1 ? "" : "s"} · ${totalZones} zone${totalZones === 1 ? "" : "s"}`,
          });
        } catch (err) {
          toast.error(errorMessage(err));
        }
      })();
    }
    if (environmentDirty && environmentDraft) {
      updateCfgEnvironment.mutate(environmentDraft, {
        onSuccess: () =>
          toast.success("cfgenvironment.xml saved", {
            description: `${environmentDraft.bindings.length} binding${environmentDraft.bindings.length === 1 ? "" : "s"}`,
          }),
        onError: (err) => toast.error(errorMessage(err)),
      });
    }
  };

  const revert = () => {
    if (playerSpawns.data) setSpawnsDraft(playerSpawns.data.data);
    if (events.data) setEventsDraft(events.data.spawns);
    if (territoriesQuery.data) {
      setTerritoriesDraft(territoriesQuery.data.files);
      setEnvironmentDraft(territoriesQuery.data.environment);
    }
    setSelectedTerritory(null);
  };

  // ---------- Territory zone mutators ----------

  const updateTerritoryZone = (
    ref: TerritoryZoneRef,
    mutator: (zone: TerritoryZone) => TerritoryZone,
  ) => {
    if (!territoriesDraft) return;
    setTerritoriesDraft(
      territoriesDraft.map((entry) => {
        if (entry.filename !== ref.filename) return entry;
        const territories = entry.data.territories.map((t, tIdx) => {
          if (tIdx !== ref.territoryIdx) return t;
          const zones = t.zones.map((z, zIdx) =>
            zIdx === ref.zoneIdx ? mutator(z) : z,
          );
          return { ...t, zones };
        });
        return { ...entry, data: { territories } };
      }),
    );
  };

  const deleteTerritoryZone = (ref: TerritoryZoneRef) => {
    if (!territoriesDraft) return;
    setTerritoriesDraft(
      territoriesDraft.map((entry) => {
        if (entry.filename !== ref.filename) return entry;
        const territories = entry.data.territories
          .map((t, tIdx) => {
            if (tIdx !== ref.territoryIdx) return t;
            const zones = t.zones.filter((_, zIdx) => zIdx !== ref.zoneIdx);
            return { ...t, zones };
          })
          // Drop territories whose zones all got deleted — CE treats
          // an empty <territory> as a parse error.
          .filter((t) => t.zones.length > 0);
        return { ...entry, data: { territories } };
      }),
    );
    setSelectedTerritory(null);
  };

  /** Add a new zone at the map centre for the given category.
   *  Appends to the first existing territory in that file, or creates
   *  a fresh territory cluster if the file is currently empty. */
  const addTerritoryZone = (filename: string) => {
    if (!territoriesDraft) return;
    const mapSize =
      (activeProfile?.customMapSizeM && activeProfile.map === "custom"
        ? activeProfile.customMapSizeM
        : null) ?? 15360;
    const defaultZone: TerritoryZone = {
      name: "Zone",
      x: Math.round(mapSize / 2),
      z: Math.round(mapSize / 2),
      r: 100,
      smin: 0,
      smax: 0,
      dmin: 0,
      dmax: 0,
    };
    let nextRef: TerritoryZoneRef | null = null;
    setTerritoriesDraft(
      territoriesDraft.map((entry) => {
        if (entry.filename !== filename) return entry;
        const territories = entry.data.territories.slice();
        if (territories.length === 0) {
          territories.push({ color: "0", zones: [defaultZone] });
          nextRef = { filename, territoryIdx: 0, zoneIdx: 0 };
        } else {
          const firstZones = [...territories[0].zones, defaultZone];
          territories[0] = { ...territories[0], zones: firstZones };
          nextRef = {
            filename,
            territoryIdx: 0,
            zoneIdx: firstZones.length - 1,
          };
        }
        return { ...entry, data: { territories } };
      }),
    );
    if (nextRef) setSelectedTerritory(nextRef);
  };

  // ---------- Click-to-add dispatch ----------

  const onMapClick = ({ x, z }: { x: number; z: number }) => {
    if (spawnAdd && spawnsDraft) {
      const next: SpawnPosition = {
        x: Math.round(x),
        z: Math.round(z),
        a: 0,
      };
      setSpawnsDraft({
        ...spawnsDraft,
        [spawnAdd]: [...spawnsDraft[spawnAdd], next],
      });
      return;
    }
    if (eventAdd && eventsDraft) {
      const groupIdx = eventsDraft.findIndex((g) => g.eventName === eventAdd);
      // Y-snap cascade: prefer the nearest existing position in
      // the same event (ground-truth curated by Bohemia / the
      // operator), then fall back to the nearest building
      // placement's y (mapgrouppos.xml), then 0. Writing y=0 on a
      // vehicle event crashes CE on boot.
      const sameGroupPositions =
        groupIdx === -1 ? [] : eventsDraft[groupIdx].positions;
      const fromEvent = nearestPositionY(sameGroupPositions, x, z);
      const fromBuilding =
        nearestBuildingY(placements.data?.placements ?? null, x, z)?.y ?? null;
      const y = fromEvent ?? fromBuilding ?? 0;
      const rounded: EventPosition = {
        x: Math.round(x),
        y,
        z: Math.round(z),
        a: -1, // -1 tells CE to pick a random yaw on spawn
        group: null,
      };
      if (groupIdx === -1) {
        // No spawn group yet for this event — create a fresh custom one.
        setEventsDraft([
          ...eventsDraft,
          {
            eventName: eventAdd,
            positions: [rounded],
            source: "custom",
            modId: null,
            file: "",
          },
        ]);
      } else {
        const next = eventsDraft.slice();
        next[groupIdx] = {
          ...next[groupIdx],
          positions: [...next[groupIdx].positions, rounded],
        };
        setEventsDraft(next);
      }
    }
  };

  // ---------- Add-mode toggle helpers (mutually exclusive) ----------

  const toggleSpawnAdd = (k: PlayerSpawnKind) => {
    setSpawnAdd((cur) => (cur === k ? null : k));
    setEventAdd(null);
  };
  const toggleEventAdd = (name: string) => {
    setEventAdd((cur) => (cur === name ? null : name));
    setSpawnAdd(null);
  };

  // ---------- Background image picker ----------

  const pickImage = async () => {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        { name: "Image", extensions: ["png", "jpg", "jpeg", "webp"] },
      ],
    });
    if (typeof picked === "string") {
      setImage(activeProfile.id, picked);
      toast.success("Map image set", {
        description: "Stored per-profile, only on this machine.",
      });
    }
  };
  const clearImage = () => setImage(activeProfile.id, undefined);

  // ---------- Calibration ----------

  // `calibLayerSnapshot` is declared above with the other refs to
  // keep hook order stable across early returns. It snapshots the
  // operator's layer state on entry to calibration and is restored
  // on cancel/apply. While in calibration mode, buildings are forced
  // ON with no usage filter for visual reference, and every other
  // layer is forced OFF so the map is legible while picking.
  const enterCalibrationLayerMode = () => {
    if (calibLayerSnapshot.current) return; // already in mode
    calibLayerSnapshot.current = { ...layers };
    setLayers({
      ...layers,
      playerSpawns: { ...layers.playerSpawns, enabled: false },
      eventPositions: { ...layers.eventPositions, enabled: false },
      buildingPlacements: {
        // Everything visible — usageFilter null = show all usages
        // in their natural colours. The user picks a recognisable
        // building (church, fuel station, NWAF tower, …) and clicks
        // its placement marker for the world coord.
        enabled: true,
        usageFilter: null,
      },
      territories: { ...layers.territories, enabled: false },
      ceZones: { ...layers.ceZones, enabled: false },
    });
  };
  const restoreCalibrationLayerMode = () => {
    if (calibLayerSnapshot.current) {
      setLayers(calibLayerSnapshot.current);
      calibLayerSnapshot.current = null;
    }
  };

  const beginCalibration = () => {
    enterCalibrationLayerMode();
    setCalibP1({});
    setCalibP2({});
    // Step 1a — pick the FIRST landmark's position on the backdrop
    // image. The wizard auto-advances from here all the way through
    // step 4 (apply) without operator clicks beyond the four picks.
    setCalibRealPickSlot(null);
    setCalibActive(1);
  };
  const cancelCalibration = () => {
    setCalibActive(null);
    setCalibRealPickSlot(null);
    setCalibP1({});
    setCalibP2({});
    restoreCalibrationLayerMode();
  };
  const onCalibrationClick = (pos: { x: number; z: number }) => {
    // Backdrop click — the user picked WHERE on the image a known
    // building appears. Auto-advance: now ask which actual building
    // that is (step 1b → real-pick mode for the same slot).
    if (calibActive === 1) {
      setCalibP1({ picked: pos, real: calibP1.real });
      setCalibActive(null);
      setCalibRealPickSlot(1);
    } else if (calibActive === 2) {
      setCalibP2({ picked: pos, real: calibP2.real });
      setCalibActive(null);
      setCalibRealPickSlot(2);
    }
  };
  /** Click handler used while the operator is picking a REAL coord
   *  by clicking near a known building. `CalibrationClicker`
   *  snaps to the nearest placement before firing, so `pos` is
   *  the building's authoritative world coord. */
  const onCalibrationRealClick = (pos: { x: number; z: number }) => {
    if (calibRealPickSlot === 1) {
      setCalibP1((prev) => ({ ...prev, real: pos }));
      // Step 1b → 2a: auto-advance into picking landmark 2 on the
      // backdrop.
      setCalibRealPickSlot(null);
      setCalibActive(2);
    } else if (calibRealPickSlot === 2) {
      setCalibP2((prev) => ({ ...prev, real: pos }));
      // Step 2b complete — both landmarks fully set. Auto-apply
      // (the user already provided every input we need).
      setCalibRealPickSlot(null);
      setCalibActive(null);
      // Defer apply to the next tick so React commits the P2 state
      // before the fitter reads it.
      setTimeout(() => {
        // Re-read state via a setter — applyCalibration is closured
        // over old values otherwise. Inline the logic:
        const p1 = calibP1.picked
          ? { ...calibP1, real: calibP1.real }
          : calibP1;
        const p2 = { picked: calibP2.picked, real: pos };
        if (
          !p1.picked ||
          !p1.real ||
          !p2.picked ||
          !p2.real
        ) {
          // Shouldn't happen — defensive guard. Drops back into
          // manual mode so the operator can finish whatever's
          // missing. (Cancel button on the panel is always there.)
          return;
        }
        const fit = fitTwoPoints(
          mapId,
          p1 as LandmarkPair,
          p2 as LandmarkPair,
          { offsetX: imageOffsetX, offsetY: imageOffsetY, scale: imageScale },
        );
        if (!fit) {
          toast.error(
            "couldn't solve calibration — pick two landmarks far apart on BOTH axes",
          );
          // Leave the picked points in place so the operator can
          // tweak rather than redo from scratch.
          return;
        }
        setOffset(activeProfile.id, fit.offsetX, fit.offsetY);
        setScale(activeProfile.id, fit.scale);
        cancelCalibration();
        if (fit.asymmetryMetres > 500) {
          toast.warning(
            `Calibration applied (note: X vs Z scale differs by ${Math.round(fit.asymmetryMetres)}m — image may be non-square)`,
          );
        } else {
          toast.success("Calibration applied");
        }
      }, 0);
    }
  };
  // (apply was previously a separate function; the wizard now
  // auto-applies inside `onCalibrationRealClick` after step 2b
  // so the operator never has to click an "Apply" button.)

  // ---------- Render ----------

  const addModeLabel = spawnAdd
    ? { kind: spawnAdd, color: PLAYER_SPAWN_COLORS[spawnAdd] }
    : eventAdd
      ? { kind: eventAdd, color: EVENT_SPAWN_COLOR }
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={MapIcon}
        title="Map editor"
        description={`Leaflet view of ${MAP_LABEL[mapId]} — layer toggles on the left, click-to-add enabled by the crosshair icons in each panel.`}
        badges={
          <>
            {spawnsDirty ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                unsaved spawns
              </Badge>
            ) : null}
            {territoriesDirty || environmentDirty ? (
              <Badge
                variant="outline"
                className="border-accent/40 text-accent"
                title="Changes to env/*.xml or cfgenvironment.xml"
              >
                unsaved territories
              </Badge>
            ) : null}
            {eventsDirty ? (
              <Badge
                variant="outline"
                className="border-brand-rust/40 text-brand-rust"
                title="Changes to cfgeventspawns.xml"
              >
                unsaved events
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShortcutsOpen((v) => !v)}
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="mr-1.5 h-3.5 w-3.5" /> Shortcuts
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={revert}
              disabled={!anyDirty || savePending}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Revert
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={!anyDirty || savePending}
            >
              {savePending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </>
        }
      />

      <MapExplainer />

      {/* Body: layer panel + map */}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border/60 bg-muted/10 p-4">
          {/* Map settings panel intentionally removed — backdrop
              upload + calibration are now driven from a top
              banner / modal on the map canvas itself. Operators
              who already have a backdrop reach the panel via the
              gear icon over the canvas top-right. */}
          <CollapsibleSection
            icon={<Users className="h-3.5 w-3.5" />}
            title="Player Spawns"
            rightSlot={
              <LayerVisibilityToggle
                enabled={layers.playerSpawns.enabled}
                onToggle={() =>
                  setLayers((prev) => ({
                    ...prev,
                    playerSpawns: {
                      ...prev.playerSpawns,
                      enabled: !prev.playerSpawns.enabled,
                    },
                  }))
                }
              />
            }
            collapsed={collapsedSections.playerSpawns ?? false}
            onToggleCollapsed={() => toggleSection("playerSpawns")}
          >
          <PlayerSpawnsPanel
            draft={spawnsDraft}
            state={layers.playerSpawns}
            addMode={spawnAdd}
            onStateChange={(playerSpawns) =>
              setLayers((prev) => ({ ...prev, playerSpawns }))
            }
            onAddModeChange={(k) => (k ? toggleSpawnAdd(k) : setSpawnAdd(null))}
            onOpenTable={(k) =>
              navigate(`/app/player-spawns${k ? `?kind=${k}` : ""}`)
            }
          />
          </CollapsibleSection>

          <CollapsibleSection
            icon={<Target className="h-3.5 w-3.5" />}
            title="Event Positions"
            rightSlot={
              <LayerVisibilityToggle
                enabled={layers.eventPositions.enabled}
                onToggle={() =>
                  setLayers((prev) => ({
                    ...prev,
                    eventPositions: {
                      ...prev.eventPositions,
                      enabled: !prev.eventPositions.enabled,
                    },
                  }))
                }
              />
            }
            collapsed={collapsedSections.events ?? false}
            onToggleCollapsed={() => toggleSection("events")}
          >
          <EventsPanel
            state={layers.eventPositions}
            spawnsDraft={eventsDraft}
            knownEventNames={knownEventNames}
            addModeEventName={eventAdd}
            onStateChange={(eventPositions) =>
              setLayers((prev) => ({ ...prev, eventPositions }))
            }
            onToggleAddMode={toggleEventAdd}
            onOpenEventsPage={(name) => navigate(`/app/events?name=${name}`)}
          />
          </CollapsibleSection>

          <CollapsibleSection
            icon={<Building2 className="h-3.5 w-3.5" />}
            title="Building placements"
            rightSlot={
              <LayerVisibilityToggle
                enabled={layers.buildingPlacements.enabled}
                onToggle={() =>
                  setLayers((prev) => ({
                    ...prev,
                    buildingPlacements: {
                      ...prev.buildingPlacements,
                      enabled: !prev.buildingPlacements.enabled,
                    },
                  }))
                }
              />
            }
            collapsed={collapsedSections.buildings ?? false}
            onToggleCollapsed={() => toggleSection("buildings")}
          >
          <BuildingPlacementsPanel
            state={layers.buildingPlacements}
            knownUsages={knownBuildingUsages}
            placementsLoading={placements.isLoading}
            placementsMissing={placements.data?.missingFile ?? false}
            placementsTotal={placements.data?.placements.length ?? 0}
            onStateChange={(buildingPlacements) =>
              setLayers((prev) => ({ ...prev, buildingPlacements }))
            }
            onOpenBuildings={() => navigate("/app/buildings")}
          />
          </CollapsibleSection>

          <CollapsibleSection
            icon={<PawPrint className="h-3.5 w-3.5" />}
            title="Territories"
            rightSlot={
              <LayerVisibilityToggle
                enabled={layers.territories.enabled}
                onToggle={() =>
                  setLayers((prev) => ({
                    ...prev,
                    territories: {
                      ...prev.territories,
                      enabled: !prev.territories.enabled,
                    },
                  }))
                }
              />
            }
            collapsed={collapsedSections.territories ?? false}
            onToggleCollapsed={() => toggleSection("territories")}
          >
          <TerritoriesPanel
            entries={territoriesDraft}
            environment={environmentDraft}
            missingEnvironment={
              territoriesQuery.data?.missingEnvironment ?? false
            }
            state={layers.territories}
            selected={selectedTerritory}
            dirtyByFilename={territoriesDirtyByFilename}
            environmentDirty={environmentDirty}
            // Add / remove commands write directly to disk and re-
            // parse cfgenvironment from disk, so pending in-memory
            // edits would be silently overwritten. Gate those
            // buttons until the operator saves or reverts.
            blockStructural={territoriesDirty || environmentDirty}
            loading={territoriesQuery.isLoading}
            onStateChange={(territories) =>
              setLayers((prev) => ({ ...prev, territories }))
            }
            onSelect={setSelectedTerritory}
            onUpdateZone={updateTerritoryZone}
            onDeleteZone={deleteTerritoryZone}
            onAddZone={addTerritoryZone}
            onEditBinding={(bindingIdx) =>
              setBindingDialog({ mode: "edit", bindingIdx })
            }
            onAddAnimal={() => setBindingDialog({ mode: "create" })}
            onRemoveAnimal={async (filename) => {
              const ok = window.confirm(
                `Remove ${filename} + its cfgenvironment binding? The geometry file will be deleted from disk.`,
              );
              if (!ok) return;
              try {
                await removeAnimal.mutateAsync(filename);
                toast.success(`${filename} removed`);
                setSelectedTerritory(null);
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
          </CollapsibleSection>

          <CollapsibleSection
            icon={<Layers className="h-3.5 w-3.5" />}
            title="CE zones"
            rightSlot={
              <LayerVisibilityToggle
                enabled={layers.ceZones.enabled}
                onToggle={() =>
                  setLayers((prev) => ({
                    ...prev,
                    ceZones: {
                      ...prev.ceZones,
                      enabled: !prev.ceZones.enabled,
                    },
                  }))
                }
              />
            }
            collapsed={collapsedSections.ceZones ?? false}
            onToggleCollapsed={() => toggleSection("ceZones")}
          >
            <CeZonesPanel
              overlays={ceZoneOverlays}
              atlasNote={ceZonesQuery.data?.note ?? null}
              atlasAvailable={ceZonesQuery.data?.available ?? false}
              atlasSource={ceZonesQuery.data?.source ?? null}
              atlasSourcePath={ceZonesQuery.data?.sourcePath ?? null}
              state={layers.ceZones}
              loading={ceZonesQuery.isLoading}
              error={ceZonesQuery.isError ? errorMessage(ceZonesQuery.error) : null}
              profileId={activeProfile?.id ?? null}
              onStateChange={(ceZones) =>
                setLayers((prev) => ({ ...prev, ceZones }))
              }
              onAfterWrite={() => {
                void ceZonesQuery.refetch();
              }}
              paintActive={paintActive}
              setPaintActive={setPaintActive}
              paintTier={paintTier}
              setPaintTier={setPaintTier}
              brushRadiusM={brushRadiusM}
              setBrushRadiusM={setBrushRadiusM}
              paintMode={paintMode}
              setPaintMode={setPaintMode}
              editCount={paintEditCount}
              committing={paintCommitting}
              onDiscardEdits={() => {
                paintEditsRef.current.clear();
                setPaintEditCount(0);
              }}
              onSaveEdits={async () => {
                if (!activeProfile) return;
                const cells: { row: number; col: number; bits: number }[] = [];
                paintEditsRef.current.forEach((bits, key) => {
                  cells.push({
                    row: Math.floor(key / 4096),
                    col: key % 4096,
                    bits,
                  });
                });
                if (cells.length === 0) return;
                try {
                  const r = await tauri.ceZonesWriteOverride(activeProfile.id, {
                    kind: "editCells",
                    cells,
                  });
                  paintEditsRef.current.clear();
                  setPaintEditCount(0);
                  toast.success(
                    `Wrote areaflags.map · ${r.tierOverrideSummary ?? "edits"} · ${Math.round(r.bytes / 1024)} KB`,
                    { description: r.path, duration: 12_000 },
                  );
                  void ceZonesQuery.refetch();
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            />
          </CollapsibleSection>

          <LegendHint />
        </aside>

        <div className="relative flex flex-1 flex-col">
          {/* Backdrop status banner. Shows when no map image is
              set, prompting the operator into the wizard. After
              an image is loaded the gear icon below the banner
              gives access to the same modal for tweaks +
              recalibration. */}
          {!imagePath ? (
            <div className="flex items-center gap-3 border-b border-severity-warning/40 bg-severity-warning/10 px-4 py-2 text-xs text-severity-warning">
              <ImageIcon className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="font-semibold">No map backdrop yet.</span>{" "}
                <span className="text-foreground/80">
                  Add a reference image (your iZurvive download or any
                  map JPG) so spawns + events have visual context.
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => setBackdropModalOpen(true)}
              >
                Set up backdrop
              </Button>
            </div>
          ) : null}
          {/* Floating canvas controls — gear opens the backdrop
              modal, "Calibrate" toggles the two-point panel that
              sits next to the map without covering it. The
              Calibrate button only appears once a backdrop exists;
              calibration without a backdrop has nothing to align.
              z-index sits ABOVE Leaflet's internal stack: Leaflet's
              controls render at z-1000 and its in-canvas hint
              badges (we use them too for "click landmark N") sit at
              z-1000 as well. We pick z-1500 so our buttons + the
              attached panel are guaranteed clickable and visible
              over anything Leaflet draws. Backgrounds are fully
              opaque (no `/80` translucency) so the buttons read
              clearly against busy map content beneath. */}
          <div
            className="absolute right-3 z-[1500] flex items-start gap-2"
            style={{
              top: !imagePath ? "calc(2.5rem + 0.75rem)" : "0.75rem",
            }}
          >
            <div className="flex flex-col items-end gap-2">
              <div className="flex gap-2">
                {imagePath ? (
                  <button
                    type="button"
                    onClick={() => setCalibratePanelOpen((v) => !v)}
                    title="Two-point calibration"
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] shadow-sm transition-colors",
                      calibratePanelOpen
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 bg-background text-foreground hover:bg-muted",
                    )}
                  >
                    <Crosshair className="mr-1 inline h-3.5 w-3.5" />
                    Calibrate
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setBackdropModalOpen(true)}
                  title={imagePath ? "Backdrop settings" : "Add map backdrop"}
                  className="rounded-md border border-border/60 bg-background p-1.5 text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </div>
              {calibratePanelOpen && imagePath ? (
                <div className="w-72">
                  <CalibrationPanel
                    calibActive={calibActive}
                    calibRealPickSlot={calibRealPickSlot}
                    calibP1={calibP1}
                    calibP2={calibP2}
                    hasPlacements={
                      (placements.data?.placements?.length ?? 0) > 0
                    }
                    onCalibStart={beginCalibration}
                    onCalibCancel={cancelCalibration}
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="relative flex-1 min-h-0">
          <MapCanvas
            // Remount when the active profile changes so Leaflet
            // picks up the new profile's persisted viewport on
            // `initialCenter`/`initialZoom` (MapContainer ignores
            // prop changes after mount).
            key={activeProfile?.id ?? "no-profile"}
            mapId={mapId}
            onMapClick={onMapClick}
            initialCenter={
              mapSettings?.viewport
                ? [mapSettings.viewport.lat, mapSettings.viewport.lng]
                : undefined
            }
            initialZoom={mapSettings?.viewport?.zoom}
            onViewportChange={(v) => {
              if (activeProfile) setViewport(activeProfile.id, v);
            }}
            className={cn((spawnAdd || eventAdd) && "cursor-crosshair")}
          >
            {imagePath ? (
              <BackgroundImageLayer
                mapId={mapId}
                imagePath={imagePath}
                opacity={imageOpacity}
                offsetX={imageOffsetX}
                offsetY={imageOffsetY}
                scale={imageScale}
              />
            ) : null}
            <CeZonesLayer
              overlays={ceZoneOverlays}
              enabled={ceZoneEnabled}
              opacity={layers.ceZones.opacity}
              mapId={mapId}
            />
            {layers.ceZones.enabled && (paintActive || paintEditCount > 0) ? (
              <TierPaintLayer
                mapId={mapId}
                active={paintActive}
                paintTier={paintTier}
                brushRadiusM={brushRadiusM}
                mode={paintMode}
                editsRef={paintEditsRef}
                editCount={paintEditCount}
                onEditsChanged={() =>
                  setPaintEditCount(paintEditsRef.current.size)
                }
                onCommittingChange={setPaintCommitting}
              />
            ) : null}
            <BuildingPlacementsLayer
              placements={placements.data?.placements ?? []}
              prototypes={buildingPrototypes}
              state={layers.buildingPlacements}
              onPlacementClick={
                calibRealPickSlot !== null
                  ? (p) => onCalibrationRealClick({ x: p.x, z: p.z })
                  : undefined
              }
            />
            <PlayerSpawnsLayer
              data={spawnsDraft}
              state={layers.playerSpawns}
              mapId={mapId}
              onChange={setSpawnsDraft}
              readOnly={savePending}
            />
            <EventPositionsLayer
              spawns={eventsDraft}
              state={layers.eventPositions}
              mapId={mapId}
              onChange={setEventsDraft}
              editEventName={eventAdd}
            />
            {layers.territories.enabled && territoriesDraft ? (
              <TerritoriesLayer
                entries={territoriesDraft}
                hiddenCategories={layers.territories.hiddenCategories}
                mapId={mapId}
                selected={selectedTerritory}
                onSelect={setSelectedTerritory}
                onMoveCenter={(ref, next) =>
                  updateTerritoryZone(ref, (z) => ({
                    ...z,
                    x: next.x,
                    z: next.z,
                  }))
                }
                onResize={(ref, r) =>
                  updateTerritoryZone(ref, (z) => ({ ...z, r }))
                }
              />
            ) : null}
            <FlyToHelper
              data={spawnsDraft}
              flyToSpawnKind={flyToSpawnKind}
              spawnGroups={eventsDraft}
              flyToEventName={flyToEventName}
            />
            {calibActive !== null ? (
              <CalibrationClicker onClick={onCalibrationClick} />
            ) : null}
            {calibRealPickSlot !== null ? (
              <CalibrationClicker
                onClick={onCalibrationRealClick}
                snapPlacements={placements.data?.placements}
              />
            ) : null}
            <CalibrationLandmarks p1={calibP1} p2={calibP2} />

          </MapCanvas>

          {calibActive !== null ? (
            <div className="pointer-events-none absolute top-2 right-2 z-[1000] rounded-md bg-background/90 px-3 py-1.5 text-xs shadow-sm">
              Click landmark{" "}
              <strong>{calibActive}</strong> on the backdrop
            </div>
          ) : calibRealPickSlot !== null ? (
            <div className="pointer-events-none absolute top-2 right-2 z-[1000] rounded-md bg-background/90 px-3 py-1.5 text-xs shadow-sm">
              Click near a real building for landmark{" "}
              <strong>{calibRealPickSlot}</strong>
              {placements.data?.placements?.length ? null : (
                <span className="ml-1 text-severity-warning">
                  (no mapgrouppos loaded — will use raw click)
                </span>
              )}
            </div>
          ) : null}

          {addModeLabel ? (
            <div className="pointer-events-none absolute top-2 right-2 z-[1000] rounded-md bg-background/90 px-3 py-1.5 text-xs shadow-sm">
              Adding{" "}
              <strong style={{ color: addModeLabel.color }}>
                {addModeLabel.kind}
              </strong>{" "}
              — click anywhere on the map
            </div>
          ) : null}

          {/* Floating banner shown while the tier painter is
              chunk-committing a large stroke. The commit is async
              and yields between chunks so the UI never freezes;
              this banner is just the visible signal that work is
              still happening before the cell-count updates. Centred
              so it doesn't clash with the per-mode banners that
              live in the top-right. */}
          {paintCommitting ? (
            <div className="pointer-events-none absolute top-2 left-1/2 z-[1100] -translate-x-1/2 rounded-md border border-primary/40 bg-background/95 px-3 py-1.5 text-xs shadow-md">
              <span className="flex items-center gap-2 font-medium text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving paint stroke…
              </span>
            </div>
          ) : null}

          {shortcutsOpen ? (
            <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
          ) : null}
          </div>
        </div>
      </div>

      {/* Backdrop wizard / settings modal — wraps the existing
          BackgroundPanel UI. Auto-prompted via the orange banner
          when no image is loaded; reachable via the canvas gear
          icon for tweaks afterwards. */}
      <Dialog
        open={backdropModalOpen}
        onOpenChange={setBackdropModalOpen}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {imagePath ? "Map backdrop settings" : "Set up a map backdrop"}
            </DialogTitle>
            <DialogDescription>
              {imagePath
                ? "Adjust opacity, offset, scale, or recalibrate the two-point alignment to known landmarks."
                : "Step 1: pick a reference image — your iZurvive download or any map JPG. Step 2: align two known landmarks so spawns + events line up with the world."}
            </DialogDescription>
          </DialogHeader>
          <BackgroundPanel
            imagePath={imagePath}
            opacity={imageOpacity}
            offsetX={imageOffsetX}
            offsetY={imageOffsetY}
            scale={imageScale}
            onPick={pickImage}
            onClear={clearImage}
            onOpacityChange={(v) => setOpacity(activeProfile.id, v)}
            onOffsetChange={(x, y) => setOffset(activeProfile.id, x, y)}
            onScaleChange={(s) => setScale(activeProfile.id, s)}
            onResetAlignment={() => resetAlignment(activeProfile.id)}
            onDownloadIzurvive={() => setIzurviveOpen(true)}
          />
        </DialogContent>
      </Dialog>

      <DownloadIzurviveDialog
        open={izurviveOpen}
        onOpenChange={setIzurviveOpen}
        profileMap={mapId}
        onDownloaded={(path) => setImage(activeProfile.id, path)}
      />

      <AnimalBindingDialog
        open={bindingDialog !== null}
        onOpenChange={(v) => {
          if (!v) setBindingDialog(null);
        }}
        existing={
          bindingDialog?.mode === "edit" && environmentDraft
            ? {
                binding: environmentDraft.bindings[bindingDialog.bindingIdx],
                filename:
                  environmentDraft.bindings[bindingDialog.bindingIdx]
                    .fileUsable + ".xml",
              }
            : null
        }
        existingFilenames={(territoriesDraft ?? []).map((e) => e.filename)}
        availablePresets={environmentDraft?.bindings ?? []}
        onEdit={(binding) => {
          if (bindingDialog?.mode !== "edit" || !environmentDraft) return;
          const idx = bindingDialog.bindingIdx;
          setEnvironmentDraft({
            ...environmentDraft,
            bindings: environmentDraft.bindings.map((b, i) =>
              i === idx ? binding : b,
            ),
          });
        }}
        onCreate={async (filename, binding) => {
          try {
            await addAnimal.mutateAsync({ filename, binding });
            // Flip the Territories layer on automatically — the
            // operator just created a category specifically to
            // place zones for it, so rendering should start. Also
            // un-hide the new category in case hiddenCategories had
            // a stale entry for that slug.
            setLayers((prev) => ({
              ...prev,
              territories: {
                ...prev.territories,
                enabled: true,
                hiddenCategories: {
                  ...prev.territories.hiddenCategories,
                  [filename.replace(/_territories\.xml$/, "")]: false,
                },
              },
            }));
            // Select the starter zone the backend seeded so the
            // operator can immediately drag it — the drag handles
            // (centre marker + edge marker) only render for the
            // currently-selected zone.
            setSelectedTerritory({
              filename,
              territoryIdx: 0,
              zoneIdx: 0,
            });
            toast.success(`Added ${binding.name}`, {
              description:
                "Layer enabled · starter zone placed at map centre — drag the centre or edge markers to position + resize.",
            });
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
    </div>
  );
}

// ---------- Shortcut help overlay ----------

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const rows: { keys: string; action: string }[] = [
    { keys: "1", action: "Toggle player spawn layer" },
    { keys: "2", action: "Toggle event positions layer" },
    { keys: "3", action: "Toggle building placements layer" },
    { keys: "4", action: "Toggle territories layer" },
    { keys: "5", action: "Toggle CE zone masks" },
    { keys: "Esc", action: "Cancel add-mode, alignment, or zone selection" },
    { keys: "? / /", action: "Toggle this help" },
    { keys: "+ / −", action: "Zoom in / out (Leaflet native)" },
    { keys: "Arrow keys", action: "Pan the map (Leaflet native)" },
    { keys: "Mouse wheel", action: "Zoom at cursor" },
  ];
  return (
    <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-background/40 p-6">
      <div className="w-full max-w-sm rounded-lg border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="h-4 w-4" />
            Keyboard shortcuts
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          {rows.map((row) => (
            <div key={row.keys} className="contents">
              <dt className="font-mono text-muted-foreground">
                {row.keys}
              </dt>
              <dd>{row.action}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Shortcuts pause while an input is focused.
        </p>
      </div>
    </div>
  );
}

// ---------- Fly-to helper (inside MapContainer context) ----------

function FlyToHelper({
  data,
  flyToSpawnKind,
  spawnGroups,
  flyToEventName,
}: {
  data: PlayerSpawnPoints | null;
  flyToSpawnKind: PlayerSpawnKind | null;
  spawnGroups: EventSpawnGroup[];
  flyToEventName: string | null;
}) {
  useFlyToSpawn(data, flyToSpawnKind);
  useFlyToEvent(spawnGroups, flyToEventName);
  return null;
}

// ---------- Panels ----------

const KIND_META: Record<
  PlayerSpawnKind,
  { label: string; icon: React.ReactNode; description: string }
> = {
  fresh: {
    label: "Fresh",
    icon: <Users className="mr-1.5 h-3.5 w-3.5" />,
    description: "Brand-new character spawns.",
  },
  hop: {
    label: "Hop",
    icon: <Waypoints className="mr-1.5 h-3.5 w-3.5" />,
    description: "Server-to-server hop join points.",
  },
  travel: {
    label: "Travel",
    icon: <MapPin className="mr-1.5 h-3.5 w-3.5" />,
    description: "Map-transition spawn points.",
  },
};

function BackgroundPanel({
  imagePath,
  opacity,
  offsetX,
  offsetY,
  scale,
  onPick,
  onClear,
  onOpacityChange,
  onOffsetChange,
  onScaleChange,
  onResetAlignment,
  onDownloadIzurvive,
}: {
  imagePath?: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  onPick: () => void;
  onClear: () => void;
  onOpacityChange: (v: number) => void;
  onOffsetChange: (x: number, y: number) => void;
  onScaleChange: (s: number) => void;
  onResetAlignment: () => void;
  onDownloadIzurvive: () => void;
  // Calibration props removed — that workflow lives in the
  // floating CalibrationPanel above the map canvas, not in this
  // settings modal. See `CalibrationPanel`.
}) {
  // Alignment section is collapsed by default — most users set a
  // backdrop once and don't touch it again. The nudge pad opens
  // when expanded. Calibration moved out of this panel to a
  // floating overlay above the canvas so the user can click the
  // map while picking landmarks (which the modal blocked).
  const [alignOpen, setAlignOpen] = useState(false);
  const showAlignment = alignOpen;
  const fileName = imagePath
    ? imagePath.replace(/\\/g, "/").split("/").pop()
    : null;
  return (
    <>
      <div className="space-y-2 pl-1">
        {imagePath ? (
          <>
            <div className="truncate rounded-md border border-border/50 bg-background/60 px-2 py-1 text-[11px] font-mono">
              {fileName}
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={onDownloadIzurvive}
                title="Fetch a fresh backdrop from iZurvive"
              >
                iZurvive…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={onPick}
              >
                File…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-destructive"
                onClick={onClear}
                title="Remove image overlay"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Opacity {Math.round(opacity * 100)}%
              </Label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(opacity * 100)}
                onChange={(e) => onOpacityChange(Number(e.target.value) / 100)}
                className="w-full"
              />
            </div>

            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full justify-between px-2 text-[11px]"
              onClick={() => setAlignOpen((v) => !v)}
            >
              <span>Adjust alignment</span>
              {showAlignment ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
            {showAlignment ? (
              <AlignmentControls
                offsetX={offsetX}
                offsetY={offsetY}
                scale={scale}
                onOffsetChange={onOffsetChange}
                onScaleChange={onScaleChange}
                onReset={onResetAlignment}
              />
            ) : null}
          </>
        ) : (
          <div className="space-y-1.5">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-full px-2 text-[11px]"
              onClick={onDownloadIzurvive}
            >
              Download from iZurvive…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full px-2 text-[11px]"
              onClick={onPick}
            >
              …or load your own image
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

function PlayerSpawnsPanel({
  draft,
  state,
  addMode,
  onStateChange,
  onAddModeChange,
  onOpenTable,
}: {
  draft: PlayerSpawnPoints;
  state: LayersState["playerSpawns"];
  addMode: PlayerSpawnKind | null;
  onStateChange: (next: LayersState["playerSpawns"]) => void;
  onAddModeChange: (next: PlayerSpawnKind | null) => void;
  onOpenTable: (kind?: PlayerSpawnKind) => void;
}) {
  return (
    <>
      <div
        className={cn(
          "space-y-1.5 pl-1 pt-2",
          !state.enabled && "opacity-50 pointer-events-none",
        )}
      >
        {(Object.keys(KIND_META) as PlayerSpawnKind[]).map((kind) => {
          const count = draft[kind].length;
          const color = PLAYER_SPAWN_COLORS[kind];
          return (
            <div
              key={kind}
              className="flex items-center gap-2 rounded-md px-1 py-1 text-xs hover:bg-muted/40"
            >
              <Checkbox
                id={`kind-${kind}`}
                checked={state.kinds[kind]}
                onCheckedChange={(v) =>
                  onStateChange({
                    ...state,
                    kinds: { ...state.kinds, [kind]: v === true },
                  })
                }
              />
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              <Label
                htmlFor={`kind-${kind}`}
                className="flex-1 cursor-pointer text-xs font-normal"
              >
                {KIND_META[kind].label}{" "}
                <span className="text-muted-foreground">({count})</span>
              </Label>
              <button
                type="button"
                title={
                  addMode === kind
                    ? `Stop adding ${kind}`
                    : `Click on the map to add a ${kind} spawn`
                }
                onClick={() =>
                  onAddModeChange(addMode === kind ? null : kind)
                }
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border text-muted-foreground transition-colors",
                  addMode === kind
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted",
                )}
                aria-label={`toggle add ${kind}`}
              >
                <Crosshair className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 pl-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() => onOpenTable()}
        >
          Open table view →
        </Button>
      </div>
    </>
  );
}

function EventsPanel({
  state,
  spawnsDraft,
  knownEventNames,
  addModeEventName,
  onStateChange,
  onToggleAddMode,
  onOpenEventsPage,
}: {
  state: LayersState["eventPositions"];
  spawnsDraft: EventSpawnGroup[];
  knownEventNames: string[];
  addModeEventName: string | null;
  onStateChange: (next: LayersState["eventPositions"]) => void;
  onToggleAddMode: (eventName: string) => void;
  onOpenEventsPage: (name: string) => void;
}) {
  const totalPoints = spawnsDraft.reduce(
    (acc, g) =>
      acc +
      (state.eventName && g.eventName !== state.eventName
        ? 0
        : g.positions.length),
    0,
  );
  const activeName = state.eventName;
  const addEnabled = !!activeName;
  return (
    <>
      <div
        className={cn(
          "space-y-2 pl-1 pt-2",
          !state.enabled && "opacity-50 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: EVENT_SPAWN_COLOR }}
            aria-hidden
          />
          <span className="text-muted-foreground">
            {totalPoints} position{totalPoints === 1 ? "" : "s"} visible
          </span>
          <InfoTooltip tagline="cfgeventspawns.xml — editable here too">
            Pick an event from the dropdown below to lock edits to just
            that event's positions. Drag its markers to move, click to
            remove, or hit the crosshair to click-to-add. Changes save
            with the same button at the top.
          </InfoTooltip>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Event filter / edit target
          </Label>
          <Select
            value={activeName ?? "__all__"}
            onValueChange={(v) =>
              onStateChange({
                ...state,
                eventName: v === "__all__" ? null : v,
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All events (read-only)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All events (read-only)</SelectItem>
              {knownEventNames.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!addEnabled}
            title={
              addEnabled
                ? `Click on the map to add a position for ${activeName}`
                : "Pick an event first"
            }
            onClick={() => activeName && onToggleAddMode(activeName)}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded border transition-colors",
              addModeEventName && addModeEventName === activeName
                ? "border-primary bg-primary/10 text-primary"
                : addEnabled
                  ? "border-border text-muted-foreground hover:bg-muted"
                  : "border-border/50 text-muted-foreground/40",
            )}
            aria-label="toggle event add-mode"
          >
            <Crosshair className="h-3 w-3" />
          </button>
          <span className="text-[11px] text-muted-foreground">
            {addModeEventName
              ? `Adding to ${addModeEventName}`
              : addEnabled
                ? "Click to enter add-mode"
                : "Select an event to edit"}
          </span>
        </div>
        {activeName ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => onOpenEventsPage(activeName)}
          >
            Open {activeName} →
          </Button>
        ) : null}
      </div>
    </>
  );
}

/** Visual reminder of where the user has clicked during calibration
 *  — a small numbered circle at each picked point so they can tell
 *  whether they clicked the right landmark before filling in the
 *  real coordinates. Renders nothing when no points are picked. */
function CalibrationLandmarks({
  p1,
  p2,
}: {
  p1: Partial<LandmarkPair>;
  p2: Partial<LandmarkPair>;
}) {
  const marks = [
    p1.picked ? { label: "1", pos: p1.picked } : null,
    p2.picked ? { label: "2", pos: p2.picked } : null,
  ].filter((m): m is { label: string; pos: { x: number; z: number } } =>
    Boolean(m),
  );
  if (marks.length === 0) return null;
  return (
    <>
      {marks.map((m) => (
        <Marker
          key={m.label}
          position={dayzToLatLng(m.pos.x, m.pos.z)}
          icon={calibPinIcon(m.label)}
          keyboard={false}
          interactive={false}
        />
      ))}
    </>
  );
}

/** Leaflet `DivIcon` for the two calibration landmarks. Memoised in
 *  a module-level map so switching panels doesn't re-string the SVG. */
const CALIB_ICON_CACHE = new Map<string, L.DivIcon>();
function calibPinIcon(label: string): L.DivIcon {
  const cached = CALIB_ICON_CACHE.get(label);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:9999px;background:#d47028;color:#0d0f0c;font-size:11px;font-weight:700;border:2px solid #e8e4d9;box-shadow:0 1px 3px rgba(0,0,0,0.5);">${label}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  CALIB_ICON_CACHE.set(label, icon);
  return icon;
}

function AlignmentControls({
  offsetX,
  offsetY,
  scale,
  onOffsetChange,
  onScaleChange,
  onReset,
}: {
  offsetX: number;
  offsetY: number;
  scale: number;
  onOffsetChange: (x: number, y: number) => void;
  onScaleChange: (s: number) => void;
  onReset: () => void;
}) {
  // Calibration moved out — see `CalibrationPanel`. This component
  // now exclusively handles offset / scale tweaks.
  const dirty = offsetX !== 0 || offsetY !== 0 || scale !== 1;
  const nudge = (dx: number, dy: number) =>
    onOffsetChange(offsetX + dx, offsetY + dy);

  return (
    <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Alignment
        </Label>
        <InfoTooltip tagline="Compensate for image padding">
          iZurvive / satellite exports usually include padding (sea,
          out-of-bounds) so the playfield doesn't line up 1:1 with
          the grid. Use the nudge buttons for small tweaks or the
          two-point calibration for a first-time alignment.
        </InfoTooltip>
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty}
          className={cn(
            "ml-auto text-[10px] transition-colors",
            dirty
              ? "text-primary underline-offset-2 hover:underline"
              : "text-muted-foreground/50",
          )}
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <AlignmentInput
          label="X (m)"
          value={offsetX}
          step={10}
          onChange={(v) => onOffsetChange(v, offsetY)}
        />
        <AlignmentInput
          label="Y (m)"
          value={offsetY}
          step={10}
          onChange={(v) => onOffsetChange(offsetX, v)}
        />
        <AlignmentInput
          label="Scale"
          value={scale}
          step={0.01}
          onChange={onScaleChange}
        />
      </div>

      {/* Nudge pad: 3×3 grid with arrows and scale +/-. Each click
          shifts by 10m / 0.01 scale — much nicer than typing. */}
      <div className="flex items-center gap-1.5">
        <div className="grid grid-cols-3 grid-rows-3 gap-0.5">
          <span />
          <NudgeBtn label="↑" onClick={() => nudge(0, 10)} />
          <span />
          <NudgeBtn label="←" onClick={() => nudge(-10, 0)} />
          <span className="flex items-center justify-center text-[9px] text-muted-foreground">
            10m
          </span>
          <NudgeBtn label="→" onClick={() => nudge(10, 0)} />
          <span />
          <NudgeBtn label="↓" onClick={() => nudge(0, -10)} />
          <span />
        </div>
        <div className="flex flex-col gap-0.5">
          <NudgeBtn
            label="＋"
            title="Scale up 1%"
            onClick={() => onScaleChange(scale + 0.01)}
          />
          <span className="flex items-center justify-center text-[9px] text-muted-foreground">
            zoom
          </span>
          <NudgeBtn
            label="−"
            title="Scale down 1%"
            onClick={() => onScaleChange(scale - 0.01)}
          />
        </div>
      </div>

      {/* Calibration deliberately NOT rendered here — it lives in
          a separate floating panel triggered from a "Calibrate"
          button at the top-right of the canvas. Reason: the modal
          / sidebar versions of this control covered the map and
          made it impossible to click landmarks. The standalone
          panel sits beside the map without blocking it. */}
    </div>
  );
}

/** Floating panel rendered next to the map canvas when the
 *  operator clicks the "Calibrate" button. Drives a 4-step
 *  guided wizard:
 *
 *    1a. Click a recognisable building's POSITION ON THE BACKDROP
 *    1b. Click the SAME BUILDING'S MARKER on the world map
 *    2a. Click a SECOND building's position on the backdrop
 *    2b. Click that second building's marker on the world map
 *
 *  Steps auto-advance after each click; on 2b the fit runs and the
 *  panel closes. While the wizard is active the parent toggles all
 *  layers off + the building placements layer on with no usage
 *  filter, so every building is visible as a click target. */
function CalibrationPanel({
  calibActive,
  calibRealPickSlot,
  calibP1,
  calibP2,
  hasPlacements,
  onCalibStart,
  onCalibCancel,
}: {
  calibActive: 1 | 2 | null;
  calibRealPickSlot: 1 | 2 | null;
  calibP1: Partial<LandmarkPair>;
  calibP2: Partial<LandmarkPair>;
  hasPlacements: boolean;
  onCalibStart: () => void;
  onCalibCancel: () => void;
}) {
  // Derive the current step from the existing P1/P2 + pick-mode
  // state. Source of truth lives in MapPage; this just renders.
  const inProgress =
    calibActive !== null ||
    calibRealPickSlot !== null ||
    !!(calibP1.picked || calibP2.picked);
  const step = !inProgress
    ? 0
    : calibActive === 1
      ? 1 // 1a — pick first landmark's position on backdrop
      : calibRealPickSlot === 1
        ? 2 // 1b — pick the matching real building
        : calibActive === 2
          ? 3 // 2a — pick second landmark on backdrop
          : calibRealPickSlot === 2
            ? 4 // 2b — pick the matching real building
            : 0;

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-background p-3 shadow-md">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Two-point calibration
        </Label>
        {inProgress ? (
          <button
            type="button"
            onClick={onCalibCancel}
            className="text-[10px] text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {!inProgress ? (
        <>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Pick two recognisable buildings and align them between
            backdrop and world. While calibrating, all overlays
            switch off and every building placement shows so you
            have unambiguous click targets.
          </p>
          <Button
            size="sm"
            className="h-7 w-full px-2 text-[11px]"
            onClick={onCalibStart}
            disabled={!hasPlacements}
            title={
              hasPlacements
                ? undefined
                : "Building placements aren't loaded yet — pull the workspace first"
            }
          >
            Start calibration
          </Button>
          {!hasPlacements ? (
            <p className="text-[10px] text-severity-warning">
              Building placements (mapgrouppos.xml) not loaded —
              calibration needs them as click targets.
            </p>
          ) : null}
        </>
      ) : (
        <ol className="space-y-1.5 text-[11px]">
          <StepLine
            num="1a"
            label="Pick a building's POSITION on the backdrop"
            done={!!calibP1.picked}
            active={step === 1}
          />
          <StepLine
            num="1b"
            label="Click the SAME building's marker on the map"
            done={!!calibP1.real}
            active={step === 2}
          />
          <StepLine
            num="2a"
            label="Pick a SECOND building on the backdrop"
            done={!!calibP2.picked}
            active={step === 3}
          />
          <StepLine
            num="2b"
            label="Click the second building's marker on the map"
            done={!!calibP2.real}
            active={step === 4}
          />
          <li className="pt-1 text-[10px] italic text-muted-foreground">
            Calibration applies automatically once step 2b is done.
          </li>
        </ol>
      )}
    </div>
  );
}

/** One row of the wizard checklist. Active step is highlighted
 *  + carries a dot; completed steps fade. */
function StepLine({
  num,
  label,
  done,
  active,
}: {
  num: string;
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded px-1 py-0.5",
        active
          ? "bg-primary/10 text-foreground"
          : done
            ? "text-muted-foreground/70"
            : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-4 w-6 shrink-0 items-center justify-center rounded font-mono text-[9px] tabular-nums",
          active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-severity-success/20 text-severity-success"
              : "bg-muted text-muted-foreground",
        )}
      >
        {done ? "✓" : num}
      </span>
      <span className={done ? "line-through" : undefined}>{label}</span>
    </li>
  );
}

function NudgeBtn({
  label,
  title,
  onClick,
}: {
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-5 w-5 items-center justify-center rounded border border-border/60 bg-background text-[11px] leading-none hover:border-primary/50 hover:text-primary"
    >
      {label}
    </button>
  );
}



function AlignmentInput({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  // Render with up to 3 decimals for scale, integer for offsets.
  const displayValue =
    step < 1 ? value.toFixed(3).replace(/\.?0+$/, "") : String(Math.round(value));
  return (
    <div className="space-y-0.5">
      <Label className="text-[10px] font-normal text-muted-foreground">
        {label}
      </Label>
      <input
        type="number"
        value={displayValue}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="h-7 w-full rounded border border-border/60 bg-background px-1.5 text-[11px] tabular-nums"
      />
    </div>
  );
}

function BuildingPlacementsPanel({
  state,
  knownUsages,
  placementsLoading,
  placementsMissing,
  placementsTotal,
  onStateChange,
  onOpenBuildings,
}: {
  state: LayersState["buildingPlacements"];
  knownUsages: string[];
  placementsLoading: boolean;
  placementsMissing: boolean;
  placementsTotal: number;
  onStateChange: (next: LayersState["buildingPlacements"]) => void;
  onOpenBuildings: () => void;
}) {
  // Sort filter dropdown: priority order first (Military, Industrial,
  // Town, …) then any other usages alphabetically.
  const orderedUsages = useMemo(() => {
    const known = new Set(knownUsages);
    const out: string[] = [];
    USAGE_PRIORITY.forEach((u) => {
      if (known.has(u)) {
        out.push(u);
        known.delete(u);
      }
    });
    Array.from(known)
      .sort()
      .forEach((u) => out.push(u));
    return out;
  }, [knownUsages]);

  return (
    <>
      <div
        className={cn(
          "space-y-2 pl-1 pt-2",
          !state.enabled && "opacity-50 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {placementsLoading ? (
              <>Loading…</>
            ) : placementsMissing ? (
              <>mapgrouppos.xml not extracted</>
            ) : (
              <>
                {placementsTotal.toLocaleString()} placement
                {placementsTotal === 1 ? "" : "s"}
              </>
            )}
          </span>
          <InfoTooltip tagline="Every building placed by the map PBO">
            One dot per `&lt;group&gt;` in{" "}
            <code>mapgrouppos.xml</code>. Colour encodes the dominant
            usage zone of each prototype — Military red, Industrial
            amber, Town blue, etc. Filter to a single usage to see
            loot-zone coverage at a glance.
          </InfoTooltip>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Filter by usage
          </Label>
          <Select
            value={state.usageFilter ?? "__all__"}
            onValueChange={(v) =>
              onStateChange({
                ...state,
                usageFilter: v === "__all__" ? null : v,
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="All usages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">
                All usages (colour by dominant)
              </SelectItem>
              {orderedUsages.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {state.enabled ? (
          <div className="grid grid-cols-3 gap-1 text-[10px]">
            {USAGE_PRIORITY.filter(
              (u) => !state.usageFilter || state.usageFilter === u,
            )
              .filter((u) => knownUsages.includes(u))
              .slice(0, 12)
              .map((u) => (
                <div key={u} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: USAGE_COLORS[u] }}
                    aria-hidden
                  />
                  <span className="truncate text-muted-foreground">{u}</span>
                </div>
              ))}
          </div>
        ) : null}

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={onOpenBuildings}
        >
          Open Buildings page →
        </Button>
      </div>
    </>
  );
}

function TerritoriesPanel({
  entries,
  environment,
  missingEnvironment,
  state,
  selected,
  dirtyByFilename,
  environmentDirty,
  blockStructural,
  loading,
  onStateChange,
  onSelect,
  onUpdateZone,
  onDeleteZone,
  onAddZone,
  onEditBinding,
  onAddAnimal,
  onRemoveAnimal,
}: {
  entries: TerritoryFileEntry[] | null;
  environment: CfgEnvironment | null;
  missingEnvironment: boolean;
  state: LayersState["territories"];
  selected: TerritoryZoneRef | null;
  dirtyByFilename: Record<string, boolean>;
  environmentDirty: boolean;
  /** True when a pending geometry or env edit would be clobbered by
   *  a disk-write from add/remove. Tooltip explains why; operator
   *  clears by pressing Save or Revert in the page header. */
  blockStructural: boolean;
  loading: boolean;
  onStateChange: (next: LayersState["territories"]) => void;
  onSelect: (ref: TerritoryZoneRef | null) => void;
  onUpdateZone: (
    ref: TerritoryZoneRef,
    mutator: (zone: TerritoryZone) => TerritoryZone,
  ) => void;
  onDeleteZone: (ref: TerritoryZoneRef) => void;
  onAddZone: (filename: string) => void;
  onEditBinding: (bindingIdx: number) => void;
  onAddAnimal: () => void;
  onRemoveAnimal: (filename: string) => void;
}) {
  const selectedEntry = selected
    ? entries?.find((e) => e.filename === selected.filename)
    : undefined;
  const selectedZone =
    selectedEntry?.data.territories[selected!.territoryIdx]?.zones[
      selected!.zoneIdx
    ];

  /** Map each geometry file's stem to the first binding index in
   *  cfgenvironment that points at it. When a file has no binding
   *  the zones still render but won't spawn anything — we surface
   *  that in the row. */
  const bindingIdxByStem = useMemo(() => {
    const out = new Map<string, number>();
    environment?.bindings.forEach((b, i) => {
      if (!out.has(b.fileUsable)) out.set(b.fileUsable, i);
    });
    return out;
  }, [environment]);

  return (
    <>
      <div
        className={cn(
          "space-y-1.5 pl-1 pt-2",
          !state.enabled && "opacity-50 pointer-events-none",
        )}
      >
        {missingEnvironment ? (
          <div className="rounded-md border border-severity-warning/40 bg-severity-warning/10 p-2 text-[11px] text-severity-warning">
            No <code>cfgenvironment.xml</code> — zones render but no
            animals spawn. Add a custom animal below to create one.
          </div>
        ) : null}
        {loading && !entries ? (
          <p className="text-[11px] text-muted-foreground">Loading…</p>
        ) : !entries || entries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No <code>env/</code> folder in this mission — DayZ ships
            animal &amp; infected territories here.
          </p>
        ) : (
          entries.map((entry) => {
            const count = entry.data.territories.reduce(
              (a, t) => a + t.zones.length,
              0,
            );
            const hidden = !!state.hiddenCategories[entry.category];
            const color = colorForTerritoryCategory(entry.category);
            const stem = entry.filename.replace(/\.xml$/, "");
            const boundIdx = bindingIdxByStem.get(stem);
            const hasBinding = boundIdx !== undefined;
            return (
              <div
                key={entry.filename}
                className="flex items-center gap-1 rounded-md px-1 py-1 text-xs hover:bg-muted/40"
              >
                <Checkbox
                  id={`terr-${entry.category}`}
                  checked={!hidden}
                  onCheckedChange={(v) =>
                    onStateChange({
                      ...state,
                      hiddenCategories: {
                        ...state.hiddenCategories,
                        [entry.category]: v !== true,
                      },
                    })
                  }
                />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: color }}
                  aria-hidden
                />
                <Label
                  htmlFor={`terr-${entry.category}`}
                  className="flex-1 cursor-pointer truncate text-xs font-normal"
                  title={
                    hasBinding
                      ? `Bound to: ${environment!.bindings[boundIdx].name} (${environment!.bindings[boundIdx].behavior})`
                      : "No cfgenvironment binding — zones won't spawn"
                  }
                >
                  {entry.displayName}{" "}
                  <span className="text-muted-foreground">({count})</span>
                  {!hasBinding ? (
                    <span
                      className="ml-1 text-[10px] text-severity-warning"
                      title="No cfgenvironment binding"
                    >
                      ⚠
                    </span>
                  ) : null}
                  {dirtyByFilename[entry.filename] ? (
                    <span
                      className="ml-1 text-[10px] text-accent"
                      title="Unsaved geometry changes"
                    >
                      ●
                    </span>
                  ) : null}
                </Label>
                <button
                  type="button"
                  onClick={() => onAddZone(entry.filename)}
                  title={`Add a zone (places at map centre — drag to position)`}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted"
                  aria-label={`add zone to ${entry.category}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
                {hasBinding ? (
                  <button
                    type="button"
                    onClick={() => onEditBinding(boundIdx!)}
                    title={`Edit cfgenvironment binding for ${entry.displayName}`}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted"
                    aria-label={`edit binding for ${entry.category}`}
                  >
                    <Settings className="h-3 w-3" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRemoveAnimal(entry.filename)}
                  disabled={blockStructural}
                  title={
                    blockStructural
                      ? "Save or revert pending territory edits before removing — add/remove writes to disk and would clobber them"
                      : `Remove ${entry.displayName} — deletes file + binding`
                  }
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-destructive/70 hover:bg-destructive/10 hover:text-destructive disabled:opacity-40 disabled:pointer-events-none"
                  aria-label={`remove ${entry.category}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
        {environmentDirty ? (
          <p className="text-[10px] text-accent">
            ● cfgenvironment.xml has unsaved edits — Save in the page
            header to commit.
          </p>
        ) : null}
      </div>
      {/* Adding a new animal is a management action, not a per-zone
          edit — it should stay clickable even when the layer is off
          (which otherwise freezes the panel body). Placing it outside
          the gated wrapper above means the operator can always add a
          new category from here without hunting for the visibility
          toggle first. */}
      <Button
        size="sm"
        variant="ghost"
        className="mt-2 h-7 w-full justify-start px-2 text-[11px] text-accent hover:bg-accent/10 disabled:opacity-40"
        onClick={onAddAnimal}
        disabled={blockStructural}
        title={
          blockStructural
            ? "Save or revert pending territory edits first — adding an animal writes to disk and would clobber them"
            : undefined
        }
      >
        <Plus className="mr-1.5 h-3 w-3" /> Add custom animal
      </Button>
      {selected && selectedEntry && selectedZone ? (
        <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/30 p-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold">
              {selectedEntry.displayName} · {selectedZone.name || "Zone"}
            </span>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-muted-foreground hover:text-foreground"
              title="Clear selection (Esc)"
            >
              ✕
            </button>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Name
            </Label>
            <input
              type="text"
              value={selectedZone.name}
              onChange={(e) =>
                onUpdateZone(selected, (z) => ({ ...z, name: e.target.value }))
              }
              className="w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px]"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                X
              </Label>
              <div className="rounded border border-border bg-background/40 px-2 py-1 font-mono">
                {Math.round(selectedZone.x)}
              </div>
            </div>
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Z
              </Label>
              <div className="rounded border border-border bg-background/40 px-2 py-1 font-mono">
                {Math.round(selectedZone.z)}
              </div>
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Radius {Math.round(selectedZone.r)}m
            </Label>
            <input
              type="range"
              min="10"
              max="1000"
              step="1"
              value={Math.round(selectedZone.r)}
              onChange={(e) =>
                onUpdateZone(selected, (z) => ({
                  ...z,
                  r: Number(e.target.value),
                }))
              }
              className="w-full"
            />
          </div>
          {/* Density pair only matters for infected files. Keep the
              controls visible either way — mods use dmin/dmax on
              non-zombie files too. */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Density min
              </Label>
              <input
                type="number"
                min="0"
                value={selectedZone.dmin}
                onChange={(e) =>
                  onUpdateZone(selected, (z) => ({
                    ...z,
                    dmin: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px]"
              />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Density max
              </Label>
              <input
                type="number"
                min="0"
                value={selectedZone.dmax}
                onChange={(e) =>
                  onUpdateZone(selected, (z) => ({
                    ...z,
                    dmax: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="w-full rounded border border-border bg-background/60 px-2 py-1 font-mono text-[11px]"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full justify-start px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onDeleteZone(selected)}
          >
            <Trash2 className="mr-1.5 h-3 w-3" /> Delete zone
          </Button>
        </div>
      ) : null}
    </>
  );
}

/** Small eye-button passed to CollapsibleSection's `rightSlot` so a
 *  section's collapse + layer-visibility toggles sit side-by-side
 *  without stealing each other's click. */
function LayerVisibilityToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={enabled ? "Hide this layer on the map" : "Show this layer on the map"}
      className="rounded-sm p-1 transition-colors hover:bg-muted"
    >
      {enabled ? (
        <Eye className="h-3.5 w-3.5 text-primary" />
      ) : (
        <EyeOff className="h-3.5 w-3.5 text-muted-foreground/60" />
      )}
    </button>
  );
}

/** Tier indices used by the Rust override API. The bit layout is
 *  Tier1 = bit 0 … Tier4 = bit 3, Unique = bit 4. Keep this list
 *  ordered so the dropdowns render in tier order. */
const TIER_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Tier1 (coastal)" },
  { value: 1, label: "Tier2" },
  { value: 2, label: "Tier3" },
  { value: 3, label: "Tier4 (endgame)" },
  { value: 4, label: "Unique" },
];

type EditAction = "passthrough" | "fillTier" | "clearTier" | "reassignTier";

const EDIT_ACTION_LABELS: Record<EditAction, string> = {
  passthrough: "Pass-through copy (no changes)",
  fillTier: "Fill a tier across every land cell",
  clearTier: "Clear a tier everywhere",
  reassignTier: "Reassign one tier to another",
};

function CeZonesPanel({
  overlays,
  atlasNote,
  atlasAvailable,
  atlasSource,
  atlasSourcePath,
  state,
  loading,
  error,
  profileId,
  onStateChange,
  onAfterWrite,
  paintActive,
  setPaintActive,
  paintTier,
  setPaintTier,
  brushRadiusM,
  setBrushRadiusM,
  paintMode,
  setPaintMode,
  editCount,
  committing,
  onSaveEdits,
  onDiscardEdits,
}: {
  overlays: CeZoneOverlay[];
  atlasNote: string | null;
  atlasAvailable: boolean;
  atlasSource: CeZoneSource | null;
  atlasSourcePath: string | null;
  state: LayersState["ceZones"];
  loading: boolean;
  error: string | null;
  profileId: string | null;
  onStateChange: (next: LayersState["ceZones"]) => void;
  onAfterWrite: () => void;
  paintActive: boolean;
  setPaintActive: (v: boolean) => void;
  paintTier: number;
  setPaintTier: (v: number) => void;
  brushRadiusM: number;
  setBrushRadiusM: (v: number) => void;
  paintMode: "set" | "erase";
  setPaintMode: (v: "set" | "erase") => void;
  editCount: number;
  committing: boolean;
  onSaveEdits: () => Promise<void>;
  onDiscardEdits: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const [action, setAction] = useState<EditAction>("passthrough");
  const [tier, setTier] = useState<number>(3);
  const [reassignFrom, setReassignFrom] = useState<number>(0);
  const [reassignTo, setReassignTo] = useState<number>(3);
  const [lastWrite, setLastWrite] = useState<{
    path: string;
    sizeKb: number;
    sourceWas: CeZoneSource;
    summary: string | null;
  } | null>(null);

  // Translate the form state into the discriminated union the Rust
  // command expects. `null` = pass-through copy (the source is read
  // and re-written byte-identical, used to materialise the vanilla
  // file into the mission folder before subsequent edits).
  const buildOverride = (): TierOverride | null => {
    switch (action) {
      case "passthrough":
        return null;
      case "fillTier":
        return { kind: "fillTier", tier };
      case "clearTier":
        return { kind: "clearTier", tier };
      case "reassignTier":
        return { kind: "reassignTier", from: reassignFrom, to: reassignTo };
    }
  };

  const reassignSelfNoop =
    action === "reassignTier" && reassignFrom === reassignTo;

  const runWrite = async () => {
    if (!profileId) return;
    if (reassignSelfNoop) {
      toast.error("Reassign source and target tiers must differ");
      return;
    }
    setWriting(true);
    try {
      const r = await tauri.ceZonesWriteOverride(profileId, buildOverride());
      setLastWrite({
        path: r.path,
        sizeKb: Math.round(r.bytes / 1024),
        sourceWas: r.sourceWas,
        summary: r.tierOverrideSummary,
      });
      const label = r.tierOverrideSummary ?? "pass-through copy";
      toast.success(
        `Wrote areaflags.map · ${label} · ${Math.round(r.bytes / 1024)} KB`,
        {
          description: r.path,
          duration: 15_000,
          action: {
            label: "Open folder",
            onClick: () => {
              // Open the mission directory (drop the file name).
              const dir = r.path.replace(/[/\\]areaflags\.map$/i, "");
              openPath(dir).catch((err) =>
                toast.error(`Couldn't open folder: ${errorMessage(err)}`),
              );
            },
          },
        },
      );
      // Refresh the overlay so the operator sees the new tier
      // geography right away instead of the previous state.
      onAfterWrite();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setWriting(false);
    }
  };

  if (error) {
    return <p className="text-xs text-severity-error">{error}</p>;
  }
  if (loading && overlays.length === 0) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Decoding areaflags.map…
      </p>
    );
  }
  if (!atlasAvailable || overlays.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {atlasNote ??
          "No CE zone data for this map. areaflags.map ships under "}
        {!atlasNote ? (
          <code>P:\DZ\worlds\&lt;map&gt;\ce\</code>
        ) : null}
        {!atlasNote ? " — mount the P: drive via Setup." : ""}
      </p>
    );
  }

  const toggleZone = (name: string) => {
    onStateChange({
      ...state,
      hiddenZones: {
        ...state.hiddenZones,
        [name]: !state.hiddenZones[name],
      },
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Loot tiers parsed from this mission's <code>areaflags.map</code>.
        Tier1 is starter loot; higher tiers are inland / military.
      </p>
      <div className="space-y-0.5">
        {overlays.map((o) => {
          const hidden = !!state.hiddenZones[o.name];
          return (
            <label
              key={o.name}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 text-xs hover:bg-muted/40"
            >
              <Checkbox
                checked={!hidden}
                onCheckedChange={() => toggleZone(o.name)}
              />
              <span
                className="inline-block h-3 w-3 rounded-sm border border-border/60"
                style={{ backgroundColor: o.color }}
              />
              <span className="flex-1">{o.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {(o.coverage * 100).toFixed(1)}%
              </span>
            </label>
          );
        })}
      </div>
      <div className="space-y-1 pt-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Opacity {Math.round(state.opacity * 100)}%
        </Label>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(state.opacity * 100)}
          onChange={(e) =>
            onStateChange({
              ...state,
              opacity: Number(e.target.value) / 100,
            })
          }
          className="w-full"
        />
      </div>
      <div className="space-y-1 rounded-md border border-dashed border-border/60 p-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Write to mission folder
        </p>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Saves <code>areaflags.map</code> directly into this
          profile's mission folder. DayZ reads that file at boot in
          preference to the vanilla copy, so changes take effect
          after a Push + server restart — no PBO packaging required.
        </p>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Source:{" "}
          <span className="font-mono text-foreground">
            {atlasSource === "mission"
              ? "mission override (already deployed)"
              : atlasSource === "vanilla"
                ? "vanilla (P: drive) — writing will create the first override"
                : "unavailable"}
          </span>
          {atlasSourcePath ? (
            <span className="block truncate font-mono text-muted-foreground/70">
              {atlasSourcePath}
            </span>
          ) : null}
        </p>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Action
          </Label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as EditAction)}
            className="w-full rounded border border-border bg-background/60 px-2 py-1 text-xs"
            disabled={writing}
          >
            {(Object.keys(EDIT_ACTION_LABELS) as EditAction[]).map((k) => (
              <option key={k} value={k}>
                {EDIT_ACTION_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        {action === "fillTier" || action === "clearTier" ? (
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tier
            </Label>
            <select
              value={tier}
              onChange={(e) => setTier(Number(e.target.value))}
              className="w-full rounded border border-border bg-background/60 px-2 py-1 text-xs"
              disabled={writing}
            >
              {TIER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {action === "reassignTier" ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                From
              </Label>
              <select
                value={reassignFrom}
                onChange={(e) => setReassignFrom(Number(e.target.value))}
                className="w-full rounded border border-border bg-background/60 px-2 py-1 text-xs"
                disabled={writing}
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                To
              </Label>
              <select
                value={reassignTo}
                onChange={(e) => setReassignTo(Number(e.target.value))}
                className="w-full rounded border border-border bg-background/60 px-2 py-1 text-xs"
                disabled={writing}
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
        {reassignSelfNoop ? (
          <p className="text-[10px] text-severity-warning">
            From and To must be different tiers.
          </p>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full"
          onClick={() => void runWrite()}
          disabled={writing || !profileId || reassignSelfNoop}
        >
          {writing ? (
            <>
              <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Writing…
            </>
          ) : (
            "Write to mission folder"
          )}
        </Button>
        {lastWrite ? (
          <div className="space-y-0.5 pt-1 font-mono text-[10px] leading-snug text-muted-foreground">
            <button
              type="button"
              onClick={() => {
                const dir = lastWrite.path.replace(
                  /[/\\]areaflags\.map$/i,
                  "",
                );
                openPath(dir).catch((err) =>
                  toast.error(`Couldn't open folder: ${errorMessage(err)}`),
                );
              }}
              className="block w-full truncate text-left text-primary underline-offset-2 hover:underline"
              title={`Open ${lastWrite.path}`}
            >
              {lastWrite.path}
            </button>
            <div>
              applied:{" "}
              <span className="text-foreground">
                {lastWrite.summary ?? "pass-through copy"}
              </span>
            </div>
            <div>
              {lastWrite.sizeKb} KB · was {lastWrite.sourceWas}
            </div>
          </div>
        ) : null}
      </div>
      <CeZonePainterControls
        paintActive={paintActive}
        setPaintActive={setPaintActive}
        paintTier={paintTier}
        setPaintTier={setPaintTier}
        brushRadiusM={brushRadiusM}
        setBrushRadiusM={setBrushRadiusM}
        paintMode={paintMode}
        setPaintMode={setPaintMode}
        editCount={editCount}
        committing={committing}
        onSaveEdits={onSaveEdits}
        onDiscardEdits={onDiscardEdits}
        layerEnabled={state.enabled}
      />
    </div>
  );
}

/** Brush/painter UI for per-cell tier edits. The painted edits are
 *  owned by `MapPage` (lives across panel collapse / re-mount and is
 *  consumed by `TierPaintLayer`); this component is purely a control
 *  surface. Disables itself when the CE zones layer toggle is off so
 *  the operator can't paint into invisible tiers. */
function CeZonePainterControls({
  paintActive,
  setPaintActive,
  paintTier,
  setPaintTier,
  brushRadiusM,
  setBrushRadiusM,
  paintMode,
  setPaintMode,
  editCount,
  committing,
  onSaveEdits,
  onDiscardEdits,
  layerEnabled,
}: {
  paintActive: boolean;
  setPaintActive: (v: boolean) => void;
  paintTier: number;
  setPaintTier: (v: number) => void;
  brushRadiusM: number;
  setBrushRadiusM: (v: number) => void;
  paintMode: "set" | "erase";
  setPaintMode: (v: "set" | "erase") => void;
  editCount: number;
  committing: boolean;
  onSaveEdits: () => Promise<void>;
  onDiscardEdits: () => void;
  layerEnabled: boolean;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border/60 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Paint tiers
        </p>
        <Button
          type="button"
          size="sm"
          variant={paintActive ? "default" : "outline"}
          className="h-6 px-2 text-[11px]"
          disabled={!layerEnabled}
          onClick={() => setPaintActive(!paintActive)}
        >
          {paintActive ? "Painting…" : "Start painting"}
        </Button>
      </div>
      {!layerEnabled ? (
        <p className="text-[10px] text-muted-foreground">
          Enable the CE zones layer (eye icon) to paint.
        </p>
      ) : null}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Brush
        </Label>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPaintMode("set")}
            className={`flex-1 rounded border px-2 py-1 text-[11px] ${
              paintMode === "set"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background/60 text-muted-foreground"
            }`}
          >
            Set tier
          </button>
          <button
            type="button"
            onClick={() => setPaintMode("erase")}
            className={`flex-1 rounded border px-2 py-1 text-[11px] ${
              paintMode === "erase"
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background/60 text-muted-foreground"
            }`}
          >
            Erase
          </button>
        </div>
      </div>
      {paintMode === "set" ? (
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Tier to paint
          </Label>
          <select
            value={paintTier}
            onChange={(e) => setPaintTier(Number(e.target.value))}
            className="w-full rounded border border-border bg-background/60 px-2 py-1 text-xs"
          >
            {TIER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="space-y-1">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Brush radius {brushRadiusM} m
        </Label>
        <input
          type="range"
          min={25}
          max={1000}
          step={25}
          value={brushRadiusM}
          onChange={(e) => setBrushRadiusM(Number(e.target.value))}
          className="w-full"
        />
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        {/* Cell-count footer. The "Saving stroke…" indicator lives
            as a floating banner over the map itself (see the
            `paintCommitting` block in MapPage) so it's visible
            without having to glance at the sidebar mid-stroke. The
            Save / Discard buttons still disable on `committing` so
            stale commits can't fire. */}
        <span className="text-[10px] text-muted-foreground">
          {editCount === 0
            ? "No pending edits"
            : `${editCount.toLocaleString()} cell${editCount === 1 ? "" : "s"} pending`}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px]"
            disabled={editCount === 0 || saving || committing}
            onClick={onDiscardEdits}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-6 px-2 text-[11px]"
            disabled={editCount === 0 || saving || committing}
            onClick={async () => {
              setSaving(true);
              try {
                await onSaveEdits();
              } finally {
                setSaving(false);
              }
            }}
            title={
              committing
                ? "Waiting for the current stroke to finish committing"
                : undefined
            }
          >
            {saving ? (
              <>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving…
              </>
            ) : (
              "Save edits"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LegendHint() {
  return (
    <div className="mt-auto rounded-md border border-dashed border-border/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
      <p className="mb-1 font-semibold text-foreground">Tips</p>
      <ul className="space-y-1 list-disc list-inside">
        <li>Crosshair icon = enter click-to-add mode.</li>
        <li>Drag a marker to move it.</li>
        <li>Click a marker for details + remove.</li>
        <li>Only one add-mode is active at a time.</li>
        <li>Save commits to both XML files at once.</li>
      </ul>
    </div>
  );
}

// ---------- Explainer ----------

function MapExplainer() {
  return (
    <Explainer
      title="How the map works"
      subtitle="background image is user-supplied; grid always visible."
      storageKey="dzcm.map.explainer.open"
    >
      <p>
        <strong className="text-foreground">Coordinates.</strong> DayZ
        uses <code>x</code> (east-west) and <code>z</code> (north-south)
        in world metres. The map here shows <code>0..size</code> on
        both axes with <code>z</code> running from south (bottom) to
        north (top). Live coordinates show in the bottom-left as you
        move the cursor.
      </p>
      <p>
        <strong className="text-foreground">Background image.</strong>{" "}
        Optional. Click "Load map image…" in the left panel and pick a
        PNG / JPG you already have — iZurvive export, topo render,
        community satellite. The image stretches across the full map
        bounds, so a roughly-square source looks best. The opacity
        slider lets the grid show through.
      </p>
      <p>
        <strong className="text-foreground">Editing.</strong> Both
        Player Spawns (fresh / hop / travel) and Event Positions are
        editable here. Drag to move, click for a remove popup.
        Click-to-add requires entering add-mode — use the crosshair
        next to a player-spawn kind, or pick an event in the Events
        panel and hit its crosshair. Events are locked to one at a
        time so stray drags don't mis-edit a neighbour event.
      </p>
      <p>
        <strong className="text-foreground">Save</strong> writes both
        files in one gesture — <code>cfgplayerspawnpoints.xml</code>{" "}
        and <code>cfgeventspawns.xml</code> — each only if it has
        unsaved changes. The toasts confirm which file was written.
      </p>
      <p className="italic">
        Deferred for later phases: infected territories, animal zones,
        contaminated areas, tier-coverage heatmap. Those will layer on
        top of whatever backdrop you've loaded.
      </p>
    </Explainer>
  );
}
