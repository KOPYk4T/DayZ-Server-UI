/**
 * DayZ-Expansion `SpawnSettings.json` — mission-side file at
 * `mpmissions/<map>/expansion/settings/SpawnSettings.json`.
 *
 * Covers three concerns:
 *  - **Spawn selection** — `SpawnLocations[]` placed on the world
 *    map editor.
 *  - **Starting clothing + gear** — 11 per-slot clothing pools,
 *    4 per-slot gear pools, plus singular primary/secondary weapon
 *    slots. Edited on `/app/mods/expansion/player-spawn-gear`.
 *  - **Loadouts mode** — when `UseLoadouts: 1`, Expansion ignores
 *    the clothing / gear arrays above and randomly picks from
 *    `MaleLoadouts[]` / `FemaleLoadouts[]` — both are refs to
 *    `ExpansionMod/Loadouts/*.json` (shared with AI).
 *
 * Unknown / mod-added fields round-trip via `[extra: string]:
 * unknown` on every shape below.
 *
 * Reference: `[Server-Hosting]-SpawnSettings.md` +
 * `[Server-Hosting]-Setting-up-Spawn-Selection.md`.
 */

import type { Vec3 } from "../quests/objectives/types";

export interface SpawnLocation {
  Name: string;
  /** Candidate spawn positions. If only one is present, players
   *  always spawn at that one. The first entry drives the 2D
   *  marker rendered in the player's spawn-pick menu — so keep the
   *  "anchor" at index 0 when you add more. */
  Positions: Vec3[];
  /** Per-location cooldown flag. Takes effect only when the file's
   *  `EnableRespawnCooldowns` flag is set. */
  UseCooldown?: 0 | 1;
  [extra: string]: unknown;
}

/** 11 clothing pools. Expansion picks one classname at random from
 *  each non-empty pool on spawn (when `UseLoadouts: 0`). Empty
 *  pools = leave the slot bare. */
export interface SpawnClothing {
  EnableCustomClothing?: 0 | 1;
  SetRandomHealth?: 0 | 1;
  Headgear: string[];
  Glasses: string[];
  Masks: string[];
  Tops: string[];
  Vests: string[];
  Gloves: string[];
  Pants: string[];
  Belts: string[];
  Shoes: string[];
  Armbands: string[];
  Backpacks: string[];
  [extra: string]: unknown;
}

/** One item inside a StartingGear pool. `Quantity: -1` means
 *  "fill to max" — relevant for stackables like ammo or food
 *  (the sample uses `Apple` with `-1`). Recursive `Attachments`
 *  mirrors the DayZ nesting (magazine → bullets, vest → holster
 *  → pistol → mag, etc.). */
export interface SpawnGearItem {
  ClassName: string;
  Quantity: number;
  Attachments: SpawnGearItem[];
  [extra: string]: unknown;
}

export interface SpawnStartingGear {
  EnableStartingGear?: 0 | 1;
  ApplyEnergySources?: 0 | 1;
  SetRandomHealth?: 0 | 1;
  UpperGear: SpawnGearItem[];
  PantsGear: SpawnGearItem[];
  BackpackGear: SpawnGearItem[];
  VestGear: SpawnGearItem[];
  /** Singular — `{}` when unset. A populated object has the same
   *  `{ ClassName, Quantity, Attachments }` shape as the pool
   *  entries. Kept as `SpawnGearItem | Record<string, never>` so
   *  the empty case round-trips as `{}` (what Expansion writes). */
  PrimaryWeapon: SpawnGearItem | Record<string, never>;
  SecondaryWeapon: SpawnGearItem | Record<string, never>;
  [extra: string]: unknown;
}

/** Entry in `MaleLoadouts` / `FemaleLoadouts`. `Loadout` is the
 *  stem of a file under `profiles/ExpansionMod/Loadouts/` — the
 *  same folder the AI module uses. */
export interface SpawnLoadoutRef {
  Loadout: string;
  Chance: number;
  [extra: string]: unknown;
}

export interface SpawnSettings {
  m_Version: number;
  EnableSpawnSelection?: 0 | 1;
  SpawnOnTerritory?: 0 | 1;
  SpawnLocations: SpawnLocation[];
  StartingClothing?: SpawnClothing;
  StartingGear?: SpawnStartingGear;
  /** When 1, the clothing / gear arrays are ignored and Expansion
   *  picks from `Male/FemaleLoadouts[]` — which reference files
   *  under `ExpansionMod/Loadouts/` just like AI bots do. */
  UseLoadouts?: 0 | 1;
  MaleLoadouts?: SpawnLoadoutRef[];
  FemaleLoadouts?: SpawnLoadoutRef[];
  SpawnHealthValue?: number;
  SpawnEnergyValue?: number;
  SpawnWaterValue?: number;
  EnableRespawnCooldowns?: 0 | 1;
  RespawnCooldown?: number;
  TerritoryRespawnCooldown?: number;
  PunishMultispawn?: 0 | 1;
  PunishCooldown?: number;
  PunishTimeframe?: number;
  CreateDeathMarker?: 0 | 1;
  BackgroundImagePath?: string;
  /** Everything else — script-mod additions, newer Expansion
   *  versions — round-trips through the index signature. */
  [extra: string]: unknown;
}

export const EMPTY_CLOTHING: SpawnClothing = {
  EnableCustomClothing: 1,
  SetRandomHealth: 1,
  Headgear: [],
  Glasses: [],
  Masks: [],
  Tops: [],
  Vests: [],
  Gloves: [],
  Pants: [],
  Belts: [],
  Shoes: [],
  Armbands: [],
  Backpacks: [],
};

export const EMPTY_STARTING_GEAR: SpawnStartingGear = {
  EnableStartingGear: 1,
  ApplyEnergySources: 1,
  SetRandomHealth: 1,
  UpperGear: [],
  PantsGear: [],
  BackpackGear: [],
  VestGear: [],
  PrimaryWeapon: {},
  SecondaryWeapon: {},
};

export const DEFAULT_SPAWN_SETTINGS: SpawnSettings = {
  m_Version: 12,
  EnableSpawnSelection: 1,
  SpawnOnTerritory: 0,
  SpawnLocations: [],
  StartingClothing: { ...EMPTY_CLOTHING },
  StartingGear: { ...EMPTY_STARTING_GEAR },
  UseLoadouts: 0,
  MaleLoadouts: [],
  FemaleLoadouts: [],
  SpawnHealthValue: 100,
  SpawnEnergyValue: 500,
  SpawnWaterValue: 500,
  EnableRespawnCooldowns: 1,
  RespawnCooldown: 120,
  TerritoryRespawnCooldown: 240,
  PunishMultispawn: 1,
  PunishCooldown: 120,
  PunishTimeframe: 300,
  CreateDeathMarker: 1,
  BackgroundImagePath: "",
};

export function defaultLocation(name: string, pos: Vec3): SpawnLocation {
  return {
    Name: name,
    Positions: [pos],
    UseCooldown: 0,
  };
}

export function defaultGearItem(className = ""): SpawnGearItem {
  return { ClassName: className, Quantity: 1, Attachments: [] };
}

export function isGearItemSet(
  g: SpawnGearItem | Record<string, never> | undefined,
): g is SpawnGearItem {
  return !!g && typeof (g as SpawnGearItem).ClassName === "string";
}

export function parseSpawnSettings(raw: string): SpawnSettings {
  const parsed = JSON.parse(raw) as Partial<SpawnSettings>;
  return {
    ...DEFAULT_SPAWN_SETTINGS,
    ...parsed,
    SpawnLocations: (parsed.SpawnLocations ?? []) as SpawnLocation[],
  } as SpawnSettings;
}

export function serializeSpawnSettings(s: SpawnSettings): string {
  return JSON.stringify(s, null, 4);
}
