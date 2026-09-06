/**
 * Documentation catalogue for vanilla DayZ `globals.xml` entries.
 *
 * The file's schema is just `<var name="…" type="…" value="…"/>` —
 * DayZ doesn't ship machine-readable docs for what each name
 * *means*, so we hand-maintain this table. Anything not in the
 * catalogue still renders fine — just without the explanatory
 * tooltip / group.
 *
 * Sources cross-checked with:
 *   - DayZ Central Economy docs (community wiki)
 *   - vanilla Chernarus+ 1.26 globals.xml
 *   - scalespeeder / Dayz Admin Handbook
 */

export interface GlobalInfo {
  /** Grouping used by the UI for section headers. */
  group: GlobalGroup;
  /** Short one-line description. */
  summary: string;
  /** Longer explainer shown in tooltip. */
  detail?: string;
  /** Optional hint range. Values outside are still accepted. */
  min?: number;
  max?: number;
  /** Unit suffix for the input ("s" for seconds, "m" for metres). */
  unit?: string;
  /** Suggested default — seeded when the library picker inserts this
   *  var into a fresh globals.xml. Follows Bohemia vanilla values
   *  where published; otherwise a sensible starting number. */
  defaultType?: "integer" | "float" | "string";
  defaultValue?: string;
}

export type GlobalGroup =
  | "cleanup"
  | "animals"
  | "infected"
  | "time"
  | "login"
  | "damage"
  | "flags"
  | "misc";

export const GLOBAL_GROUPS: { id: GlobalGroup; label: string }[] = [
  { id: "cleanup", label: "Cleanup timers" },
  { id: "animals", label: "Animals" },
  { id: "infected", label: "Infected" },
  { id: "time", label: "Time & acceleration" },
  { id: "login", label: "Login / logout" },
  { id: "damage", label: "Damage & ruin" },
  { id: "flags", label: "Flags & toggles" },
  { id: "misc", label: "Other" },
];

export const GLOBAL_CATALOG: Record<string, GlobalInfo> = {
  // ---------- Cleanup ----------
  CleanupAvoidanceRadius: {
    group: "cleanup",
    summary: "Radius around a player where CE refuses to clean up loot.",
    detail:
      "Metres. Items within this distance of any player won't be despawned by the cleanup loop — prevents loot vanishing mid-inspection. 0 disables the check.",
    unit: "m",
    min: 0,
    defaultType: "integer",
    defaultValue: "40",
  },
  CleanupLifetimeDeadAnimal: {
    group: "cleanup",
    summary: "Seconds a dead animal carcass persists before despawning.",
    detail:
      "Seconds between kill and cleanup. Higher lets players butcher returning carcasses; lower keeps the world tidy.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "600",
  },
  CleanupLifetimeDeadInfected: {
    group: "cleanup",
    summary: "Seconds a dead infected body persists.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "300",
  },
  CleanupLifetimeDeadPlayer: {
    group: "cleanup",
    summary: "Seconds a dead player body persists (vanilla 3600).",
    detail:
      "Controls how long a corpse stays lootable. Shorter = harder to recover gear after a long travel back.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "3600",
  },
  CleanupLifetimeDefault: {
    group: "cleanup",
    summary: "Fallback lifetime for anything not matched elsewhere.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "45",
  },
  CleanupLifetimeLimit: {
    group: "cleanup",
    summary: "Maximum lifetime a player action can assign to an item.",
    detail:
      "Caps the lifetime CE assigns when a player interacts with an item, preventing scripts from extending persistence indefinitely.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "1800",
  },
  CleanupLifetimeRuined: {
    group: "cleanup",
    summary: "Seconds a ruined item stays on the ground before CE takes it.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "600",
  },
  IdleModeCountdown: {
    group: "flags",
    summary: "Seconds of inactivity before the server enters idle mode.",
    detail:
      "When no players are online, CE and spawning pause once this many seconds elapse. Saves CPU on empty servers.",
    unit: "s",
    defaultType: "integer",
    defaultValue: "45",
  },

  // ---------- Animals ----------
  AnimalMaxCount: {
    group: "animals",
    summary: "Hard cap on total animals the CE will keep alive at once.",
    defaultType: "integer",
    defaultValue: "45",
  },
  WolfMaxCount: {
    group: "animals",
    summary: "Max wolves at any time across the whole map.",
    defaultType: "integer",
    defaultValue: "15",
  },

  // ---------- Infected ----------
  ZombieMaxCount: {
    group: "infected",
    summary: "Hard cap on infected spawned by CE.",
    defaultType: "integer",
    defaultValue: "1000",
  },

  // ---------- Login / logout ----------
  TimeLogin: {
    group: "login",
    summary:
      "Seconds a player is treated as 'in login protection' after joining.",
    detail:
      "During this window, the player is immune to damage — prevents spawn-camping right after join.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "30",
  },
  TimeLogout: {
    group: "login",
    summary:
      "Seconds the player's body remains in world after they disconnect.",
    detail:
      "While this timer runs, the body is targetable / lootable by others. 0 = despawn on disconnect.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "30",
  },

  // ---------- Damage ----------
  DamageMultipliers: {
    group: "damage",
    summary: "Global multiplier for outgoing damage (0..n).",
    defaultType: "float",
    defaultValue: "1",
  },
  DamageMultiplierExplosion: {
    group: "damage",
    summary: "Multiplier for explosive damage.",
    defaultType: "float",
    defaultValue: "1",
  },

  // ---------- Flags ----------
  RespawnOnlyAtOpenTents: {
    group: "flags",
    summary: "1 = respawn only works at tents marked open.",
    detail:
      "When 1, respawns redirect to the closest open tent / shelter rather than the usual spawn pool. 0 = vanilla pool.",
    defaultType: "integer",
    defaultValue: "0",
  },
  DisableBaseDamage: {
    group: "flags",
    summary: "1 = skip damage ticks on built bases.",
    defaultType: "integer",
    defaultValue: "0",
  },
  DisableContainerDamage: {
    group: "flags",
    summary: "1 = skip damage ticks on storage containers (tents, barrels).",
    defaultType: "integer",
    defaultValue: "0",
  },
  DisableRespawnDialog: {
    group: "flags",
    summary: "1 = hide the Respawn button in the pause menu.",
    detail:
      "Prevents voluntary suicide-to-respawn. Players who die still respawn normally.",
    defaultType: "integer",
    defaultValue: "0",
  },
  DisableRespawnInUnconsciousness: {
    group: "flags",
    summary: "1 = block respawn while the player is unconscious.",
    defaultType: "integer",
    defaultValue: "0",
  },
  RespawnTime: {
    group: "login",
    summary: "Seconds between death and being allowed to respawn.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "0",
  },
  LogoutTime: {
    group: "login",
    summary: "Seconds from pressing Exit to the character actually logging out.",
    unit: "s",
    min: 0,
    defaultType: "integer",
    defaultValue: "15",
  },

  // ---------- Time ----------
  TimeStartTime: {
    group: "time",
    summary: "In-game time of day the server starts on (seconds).",
    detail:
      "Seconds since midnight. 32400 = 09:00. Combine with `TimeAcceleration` in serverDZ.cfg to get the day/night cycle you want.",
    unit: "s",
    defaultType: "integer",
    defaultValue: "32400",
  },
  TimeStartDate: {
    group: "time",
    summary:
      "Starting calendar date — usually encoded as YYYYMMDD or an epoch.",
    detail:
      "Consult community docs for the exact format your CE version expects. Some builds treat this as an ISO date string.",
    defaultType: "string",
    defaultValue: "",
  },

  // ---------- Misc / common extras ----------
  WorldFloraGrowthTime: {
    group: "misc",
    summary: "Seconds between crop growth stages on server-managed plots.",
    unit: "s",
    defaultType: "integer",
    defaultValue: "10800",
  },
  WorldWetnessWeatherCoef: {
    group: "misc",
    summary:
      "Multiplier for how fast rain / wet weather soaks clothing.",
    defaultType: "float",
    defaultValue: "1",
  },
  WorldDryingIvsWeatherCoef: {
    group: "misc",
    summary:
      "Multiplier for how fast dry weather pulls moisture out of clothing.",
    defaultType: "float",
    defaultValue: "1",
  },
  TravelMaxHorizontalDistance: {
    group: "misc",
    summary:
      "Max horizontal metres a player can travel via in-game teleport interactions.",
    unit: "m",
    defaultType: "integer",
    defaultValue: "50",
  },
  TravelMaxVerticalDistance: {
    group: "misc",
    summary:
      "Max vertical metres a player can travel via in-game teleport interactions.",
    unit: "m",
    defaultType: "integer",
    defaultValue: "10",
  },
  LootingRadius: {
    group: "misc",
    summary: "Radius in which items count as 'looted' for CE cleanup purposes.",
    unit: "m",
    defaultType: "integer",
    defaultValue: "40",
  },
};

export function groupFor(name: string): GlobalGroup {
  return GLOBAL_CATALOG[name]?.group ?? "misc";
}

export function infoFor(name: string): GlobalInfo | undefined {
  return GLOBAL_CATALOG[name];
}
