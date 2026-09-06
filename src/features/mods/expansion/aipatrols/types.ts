/**
 * DayZ-Expansion AIPatrolSettings — single mission-side file at
 * `mpmissions/<map>/expansion/settings/AIPatrolSettings.json`.
 *
 * The wiki page `[Server-Hosting]-AIPatrolSettings.md` enumerates
 * every patrol field. We type the ones operators commonly tune; all
 * other fields round-trip via `[extra: string]: unknown` so mod-
 * forks and newer Expansion versions aren't clobbered.
 *
 * We reuse the per-unit spawn schema from the objectives editor
 * (`objectives/types.AISpawnBlock`) — mission-level AI patrols and
 * in-quest AI patrol/camp objectives share the same shape, so a
 * single editor can target both surfaces.
 */

import type { Vec3 } from "../quests/objectives/types";

export interface AIPatrol {
  /** Unique-ish identifier. Waypoints + spawn share this name on
   *  the admin side. */
  Name: string;
  /** Persist the patrol across server restarts. */
  Persist: 0 | 1;
  Faction: string;
  /** `Vee`, `Column`, etc. — formations supported by the eAI mod. */
  Formation: string;
  FormationScale: number;
  FormationLooseness: number;
  /** Filename stem under `ExpansionMod/Loadouts/`. */
  Loadout: string;
  /** Unit classnames (eAI prefabs) to roll from. */
  Units: string[];
  /** Negative = random 1..|N|. */
  NumberOfAI: number;
  /** `HALT` / `LOOP` / `ALTERNATE` / `ROAMING` / … */
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
  /** `-1` = no respawn. */
  RespawnTime: number;
  DespawnTime: number;
  MinDistanceRadius: number;
  MaxDistanceRadius: number;
  DespawnRadius: number;
  Waypoints: Vec3[];
  /** Spawn the patrol anchored to a building/object classname
   *  instead of in-world — waypoints become object-local offsets. */
  ObjectClassName?: string;
  /** Filename stem under `ExpansionMod/AI/LootDrops/`. */
  LootDropOnDeath?: string;
  LoadBalancingCategory?: string;
  [extra: string]: unknown;
}

export interface AIPatrolSettings {
  m_Version: number;
  /** Global defaults inherited by individual patrols when a field
   *  is omitted. Kept untyped because Expansion adds to this list
   *  across versions — round-tripping is enough. */
  Patrols: AIPatrol[];
  [extra: string]: unknown;
}

/** Minimum-viable default when the file is absent. Operators will
 *  usually inherit from Expansion's shipped template; this just
 *  stops the editor dead-ending on "file not found". */
export const DEFAULT_AIPATROL_SETTINGS: AIPatrolSettings = {
  m_Version: 11,
  Patrols: [],
};

export function defaultPatrol(name: string, pos: Vec3): AIPatrol {
  return {
    Name: name,
    Persist: 0,
    Faction: "",
    Formation: "Vee",
    FormationScale: 1.5,
    FormationLooseness: 0,
    Loadout: "",
    Units: [],
    NumberOfAI: 3,
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
    Waypoints: [pos],
  };
}

export function parseAIPatrolSettings(raw: string): AIPatrolSettings {
  const parsed = JSON.parse(raw) as Partial<AIPatrolSettings>;
  return {
    ...DEFAULT_AIPATROL_SETTINGS,
    ...parsed,
    Patrols: (parsed.Patrols ?? []) as AIPatrol[],
  } as AIPatrolSettings;
}

export function serializeAIPatrolSettings(s: AIPatrolSettings): string {
  return JSON.stringify(s, null, 4);
}
