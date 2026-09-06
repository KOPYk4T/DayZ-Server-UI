/**
 * DayZ-Expansion quest-objective shapes. One file per objective
 * lives at `profiles/ExpansionMod/Quests/Objectives/<TypeFolder>/
 * Objective_*.json`.
 *
 * Every concrete objective shares the `CommonObjectiveFields` set
 * (ConfigVersion, ID, ObjectiveType, ObjectiveText, TimeLimit,
 * Active). Per-type fields are modelled explicitly so the editor
 * can render the right form; unknown fields round-trip via the
 * `[extra: string]: unknown` index signature so mod forks or
 * future Expansion versions can't get silently dropped.
 *
 * Reference: `examples/ExpansionMod/Quests/Objectives/*` plus the
 * wiki's `<Type>-Objective-Configuration.md` pages.
 */

export type Vec3 = [number, number, number];

export interface CommonObjectiveFields {
  ConfigVersion: number;
  ID: number;
  ObjectiveType: number;
  ObjectiveText: string;
  /** Seconds. `-1` disables the limit. */
  TimeLimit: number;
  Active: 0 | 1;
  [extra: string]: unknown;
}

// ---------- Type 3: Travel ----------

export interface TravelObjective extends CommonObjectiveFields {
  ObjectiveType: 3;
  Position: Vec3;
  MaxDistance: number;
  MarkerName: string;
  ShowDistance: 0 | 1;
  TriggerOnEnter: 0 | 1;
  TriggerOnExit: 0 | 1;
}

// ---------- Type 2: Target (kill) ----------

export interface TargetObjective extends CommonObjectiveFields {
  ObjectiveType: 2;
  Position: Vec3;
  MaxDistance: number;
  MinDistance: number;
  /** Number of targets to kill. */
  Amount: number;
  /** Classnames that count toward the kill count. Empty = any. */
  ClassNames: string[];
  CountSelfKill: 0 | 1;
  CountAIPlayers: 0 | 1;
  /** Weapons the player must use. Empty = any. */
  AllowedWeapons: string[];
  /** Classnames that explicitly *don't* count. */
  ExcludedClassNames: string[];
  /** AI factions allowed as targets. Empty = any. */
  AllowedTargetFactions: string[];
  /** Hitzones that count (`Head`, `Torso`, …). Empty = any. */
  AllowedDamageZones: string[];
}

// ---------- Collection-style item (used by Collection + Delivery) ----------

export interface CollectionItem {
  Amount: number;
  ClassName: string;
  /** Per-item quantity floor & ceiling (-1 = ignore). Both fields
   *  round-trip verbatim so a mod's extended quantity semantics
   *  survive editing. */
  QuantityPercent: number;
  MinQuantityPercent: number;
  [extra: string]: unknown;
}

// ---------- Type 4: Collection (gather items) ----------

export interface CollectionObjective extends CommonObjectiveFields {
  ObjectiveType: 4;
  Collections: CollectionItem[];
  ShowDistance: 0 | 1;
  AddItemsToNearbyMarketZone: 0 | 1;
  /** 1 = any of the Collections entries completes; 0 = all. */
  NeedAnyCollection: 0 | 1;
}

// ---------- Type 5: Delivery (carry item to a place) ----------

export interface DeliveryObjective extends CommonObjectiveFields {
  ObjectiveType: 5;
  Collections: CollectionItem[];
  ShowDistance: 0 | 1;
  AddItemsToNearbyMarketZone: 0 | 1;
  MaxDistance: number;
  MarkerName: string;
}

// ---------- Type 6: Treasure Hunt ----------

export interface TreasureLoot {
  Name: string;
  Attachments: unknown[];
  Chance: number;
  QuantityPercent: number;
  Min: number;
  Max: number;
  [extra: string]: unknown;
}

export interface TreasureHuntObjective extends CommonObjectiveFields {
  ObjectiveType: 6;
  ShowDistance: 0 | 1;
  /** Classname of the container that holds the loot. Must inherit
   *  `ExpansionQuestContainerBase`. */
  ContainerName: string;
  DigInStash: 0 | 1;
  MarkerName: string;
  /** Bitfield: 2 = world only, 4 = map only, 6 = both. */
  MarkerVisibility: number;
  /** Candidate positions. Expansion picks one at quest start. */
  Positions: Vec3[];
  /** Max items picked from `Loot[]` per run. `0` = all. */
  LootItemsAmount: number;
  /** Radius around the chosen position at which the container
   *  spawns + objective completes. */
  MaxDistance: number;
  Loot: TreasureLoot[];
}

// ---------- Type 7: AI Patrol (kill a roaming AI group) ----------

export interface AISpawnBlock {
  Name: string;
  Persist: 0 | 1;
  Faction: string;
  Formation: string;
  FormationScale: number;
  FormationLooseness: number;
  Loadout: string;
  Units: string[];
  NumberOfAI: number;
  Behaviour: string;
  Speed: string;
  UnderThreatSpeed: string;
  CanBeLooted: 0 | 1;
  UnlimitedReload: 0 | 1;
  MinAccuracy: number;
  MaxAccuracy: number;
  ThreatDistanceLimit: number;
  DamageMultiplier: number;
  DamageReceivedMultiplier: number;
  SniperProneDistanceThreshold: number;
  RespawnTime: number;
  DespawnTime: number;
  MinDistanceRadius: number;
  MaxDistanceRadius: number;
  DespawnRadius: number;
  Waypoints: Vec3[];
  [extra: string]: unknown;
}

export interface AIPatrolObjective extends CommonObjectiveFields {
  ObjectiveType: 7;
  MaxDistance: number;
  MinDistance: number;
  AllowedWeapons: string[];
  AllowedDamageZones: string[];
  AISpawn: AISpawnBlock;
}

// ---------- Type 8: AI Camp (multiple AI groups clustered at a spot) ----------

export interface AICampObjective extends CommonObjectiveFields {
  ObjectiveType: 8;
  InfectedDeletionRadius: number;
  MaxDistance: number;
  MinDistance: number;
  AllowedWeapons: string[];
  AllowedDamageZones: string[];
  AISpawns: AISpawnBlock[];
}

// ---------- Type 9: AI VIP / Escort ----------

export interface AIVIPObjective extends CommonObjectiveFields {
  ObjectiveType: 9;
  Position: Vec3;
  MaxDistance: number;
  MarkerName: string;
  ShowDistance: 0 | 1;
  CanLootAI: 0 | 1;
  NPCLoadoutFile: string;
  NPCClassName: string;
  NPCName: string;
}

// ---------- Type 10: Action ----------

export interface ActionObjective extends CommonObjectiveFields {
  ObjectiveType: 10;
  ActionNames: string[];
  AllowedClassNames: string[];
  ExcludedClassNames: string[];
  ExecutionAmount: number;
}

// ---------- Type 11: Crafting ----------

export interface CraftingObjective extends CommonObjectiveFields {
  ObjectiveType: 11;
  ItemNames: string[];
  ExecutionAmount: number;
}

// ---------- Discriminated union ----------

export type Objective =
  | TravelObjective
  | TargetObjective
  | CollectionObjective
  | DeliveryObjective
  | TreasureHuntObjective
  | AIPatrolObjective
  | AICampObjective
  | AIVIPObjective
  | ActionObjective
  | CraftingObjective;

/** Default values for every type. Used by the "new objective" flow
 *  so a fresh file loads with all required fields filled in. */
export const DEFAULT_OBJECTIVES: Record<number, Objective> = {
  3: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 3,
    ObjectiveText: "Reach the destination",
    TimeLimit: -1,
    Active: 1,
    Position: [0, 0, 0],
    MaxDistance: 20,
    MarkerName: "Destination",
    ShowDistance: 1,
    TriggerOnEnter: 1,
    TriggerOnExit: 0,
  },
  2: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 2,
    ObjectiveText: "Defeat targets",
    TimeLimit: -1,
    Active: 1,
    Position: [0, 0, 0],
    MaxDistance: 150,
    MinDistance: -1,
    Amount: 1,
    ClassNames: [],
    CountSelfKill: 0,
    CountAIPlayers: 0,
    AllowedWeapons: [],
    ExcludedClassNames: [],
    AllowedTargetFactions: [],
    AllowedDamageZones: [],
  },
  4: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 4,
    ObjectiveText: "Collect items",
    TimeLimit: -1,
    Active: 1,
    Collections: [],
    ShowDistance: 1,
    AddItemsToNearbyMarketZone: 0,
    NeedAnyCollection: 0,
  },
  5: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 5,
    ObjectiveText: "Deliver items",
    TimeLimit: -1,
    Active: 1,
    Collections: [],
    ShowDistance: 1,
    AddItemsToNearbyMarketZone: 0,
    MaxDistance: 20,
    MarkerName: "Delivery",
  },
  6: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 6,
    ObjectiveText: "Find the treasure",
    TimeLimit: -1,
    Active: 1,
    ShowDistance: 1,
    ContainerName: "ExpansionQuestSeaChest",
    DigInStash: 1,
    MarkerName: "???",
    MarkerVisibility: 4,
    Positions: [],
    LootItemsAmount: 0,
    MaxDistance: 20,
    Loot: [],
  },
  7: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 7,
    ObjectiveText: "Eliminate the AI patrol",
    TimeLimit: -1,
    Active: 1,
    MaxDistance: -1,
    MinDistance: -1,
    AllowedWeapons: [],
    AllowedDamageZones: [],
    AISpawn: emptyAISpawn(),
  },
  8: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 8,
    ObjectiveText: "Clear the AI camp",
    TimeLimit: -1,
    Active: 1,
    InfectedDeletionRadius: 500,
    MaxDistance: -1,
    MinDistance: -1,
    AllowedWeapons: [],
    AllowedDamageZones: [],
    AISpawns: [],
  },
  9: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 9,
    ObjectiveText: "Escort the VIP",
    TimeLimit: -1,
    Active: 1,
    Position: [0, 0, 0],
    MaxDistance: 20,
    MarkerName: "Escort destination",
    ShowDistance: 1,
    CanLootAI: 0,
    NPCLoadoutFile: "",
    NPCClassName: "",
    NPCName: "",
  },
  10: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 10,
    ObjectiveText: "Perform the action",
    TimeLimit: -1,
    Active: 1,
    ActionNames: [],
    AllowedClassNames: [],
    ExcludedClassNames: [],
    ExecutionAmount: 1,
  },
  11: {
    ConfigVersion: 28,
    ID: 1,
    ObjectiveType: 11,
    ObjectiveText: "Craft the item",
    TimeLimit: -1,
    Active: 1,
    ItemNames: [],
    ExecutionAmount: 1,
  },
};

function emptyAISpawn(): AISpawnBlock {
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

/** Parse + round-trip guard. Unknown fields survive via the
 *  `[extra: string]: unknown` index signature on the concrete
 *  types. */
export function parseObjective(raw: string): Objective {
  return JSON.parse(raw) as Objective;
}

export function serializeObjective(obj: Objective): string {
  return JSON.stringify(obj, null, 4);
}

/** The `Objective_<prefix>_<ID>.json` filename convention used by
 *  the shipped examples. Operators can deviate; the parser doesn't
 *  require a specific filename (the `ObjectiveType` field is
 *  authoritative). */
export const OBJECTIVE_FILENAME_PREFIX: Record<number, string> = {
  2: "TA",
  3: "T",
  4: "C",
  5: "D",
  6: "TH",
  7: "AIP",
  8: "AIC",
  9: "AIESCORT",
  10: "A",
  11: "CR",
};
