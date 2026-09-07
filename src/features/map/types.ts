export type PlayerSpawnKind = "fresh" | "hop" | "travel";

export type MapLayerId =
  | "player-spawns"
  | "event-positions"
  | "building-placements"
  | "territories";

/** Sidebar section keys — used to persist which sections the user has
 *  collapsed. Decoupled from `MapLayerId` because "map settings" is a
 *  section but not a map layer. */
export type MapSectionId =
  | "mapSettings"
  | "playerSpawns"
  | "events"
  | "buildings"
  | "territories"
  | "ceZones";

export interface PlayerSpawnsLayerState {
  enabled: boolean;
  /** Which of the 3 kinds are shown; independent of the overall
   *  layer toggle so users can filter to one colour at a time. */
  kinds: Record<PlayerSpawnKind, boolean>;
}

export interface EventPositionsLayerState {
  enabled: boolean;
  /** Filter to positions belonging to a specific event name. `null`
   *  shows all known events. */
  eventName: string | null;
}

export interface BuildingPlacementsLayerState {
  enabled: boolean;
  /** When set, only placements whose prototype has this usage
   *  zone in its metadata are drawn. `null` = every placement,
   *  coloured by its prototype's dominant usage. */
  usageFilter: string | null;
}

export interface TerritoriesLayerState {
  enabled: boolean;
  /** Per-category visibility. Absent key = visible (so new categories
   *  a mod adds show up automatically without a migration). */
  hiddenCategories: Record<string, boolean>;
}

export interface CeZonesLayerState {
  enabled: boolean;
  /** Per-zone visibility. Absent key = visible (so new tier/usage
   *  masks show up automatically when a mod drops in a new PNG). */
  hiddenZones: Record<string, boolean>;
  /** Shared across all enabled zone overlays, 0..1. */
  opacity: number;
}

export interface LayersState {
  playerSpawns: PlayerSpawnsLayerState;
  eventPositions: EventPositionsLayerState;
  buildingPlacements: BuildingPlacementsLayerState;
  territories: TerritoriesLayerState;
  ceZones: CeZonesLayerState;
}

export const DEFAULT_LAYERS: LayersState = {
  playerSpawns: {
    enabled: true,
    kinds: { fresh: true, hop: true, travel: true },
  },
  eventPositions: {
    enabled: true,
    eventName: null,
  },
  buildingPlacements: {
    // Off by default — the data set is large and most users only
    // want it on when they're answering a coverage question.
    enabled: false,
    usageFilter: null,
  },
  territories: {
    // Off by default — only servers that use env/ care, and even
    // then the zones are large enough to dominate the canvas.
    enabled: false,
    hiddenCategories: {},
  },
  ceZones: {
    // Off by default — the masks are large PNGs that cover the whole
    // map and are only useful when operators are reasoning about
    // CE tier / usage distribution.
    enabled: false,
    hiddenZones: {},
    opacity: 0.45,
  },
};
