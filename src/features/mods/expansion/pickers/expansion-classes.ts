/**
 * Built-in DayZ-Expansion classname catalogs.
 *
 * Sourced from the upstream wiki (`DayZ-Expansion-Scripts.wiki`):
 *   - `[Server-Hosting]-Setting-up-Trader-Entities-and-NPCs.md` — trader catalog
 *   - `[Server-Hosting]-Quest-NPC-Configuration.md`             — quest NPC catalog
 *   - `AI-Camp-Objective-Configuration.md`                       — eAI prefab catalog
 *   - `[Server-Hosting]-Adding-a-ATM.md`                         — ATM objects
 *   - `[Server-Hosting]-P2P-Market-Trader-Configuration.md`      — P2P trader pattern
 *
 * The same 31-character roster is reused across all four categories
 * (trader / quest NPC / eAI prefab / P2P trader) so we declare it
 * once and derive each variant by string concatenation. Operators
 * with custom mod-fork classes can still type any string into the
 * pickers — these constants only power autocomplete.
 */

/** Male character names — also the suffix for `eAI_SurvivorM_*`. */
const MALE_NAMES: readonly string[] = [
  "Mirek",
  "Denis",
  "Boris",
  "Cyril",
  "Elias",
  "Francis",
  "Guo",
  "Hassan",
  "Indar",
  "Jose",
  "Kaito",
  "Lewis",
  "Manua",
  "Niki",
  "Oliver",
  "Peter",
  "Quinn",
  "Rolf",
  "Seth",
  "Taiki",
];

/** Female character names — also the suffix for `eAI_SurvivorF_*`. */
const FEMALE_NAMES: readonly string[] = [
  "Linda",
  "Maria",
  "Frida",
  "Gabi",
  "Helga",
  "Irena",
  "Judy",
  "Keiko",
  "Eva",
  "Naomi",
  "Baty",
];

/** All 31 names — used by the gender-agnostic trader / quest NPC
 *  variants where the engine doesn't split on gender at the class
 *  level (the model under the hood does, but the Expansion wrapper
 *  classes don't carry the M/F suffix). */
const ALL_NAMES: readonly string[] = [...MALE_NAMES, ...FEMALE_NAMES];

// ---------- eAI prefabs (patrol Units, AI camp/patrol objectives) ----------

/** All 31 eAI survivor prefab classnames. Used for the patrol
 *  `Units[]` array, AI camp / AI patrol quest objectives, and any
 *  eAI spawn block. Each prefab inherits from a vanilla DayZ
 *  `SurvivorM_*` / `SurvivorF_*` class with eAI scripting layered
 *  on top. */
export const EXPANSION_AI_PREFABS: readonly string[] = [
  ...MALE_NAMES.map((n) => `eAI_SurvivorM_${n}`),
  ...FEMALE_NAMES.map((n) => `eAI_SurvivorF_${n}`),
];

// ---------- Trader NPCs ----------

/** Static (non-walking) trader NPC entities. The engine doesn't
 *  give them a navmesh — they pose at their configured position
 *  and never wander. */
export const EXPANSION_TRADER_NPCS_STATIC: readonly string[] = ALL_NAMES.map(
  (n) => `ExpansionTrader${n}`,
);

/** AI (walking) trader NPC entities. They use the same eAI
 *  pathfinding as patrol prefabs but run trader interaction
 *  scripts instead of combat behaviour. */
export const EXPANSION_TRADER_NPCS_AI: readonly string[] = ALL_NAMES.map(
  (n) => `ExpansionTraderAI${n}`,
);

/** Static "trader" objects — fruit, lockers, the gold/silver
 *  exchange machine. Render as a fixed prop and accept the same
 *  trader-config bindings as a humanoid trader. Useful for
 *  faceless / lore-friendly traders on stash maps. */
export const EXPANSION_TRADER_OBJECTS: readonly string[] = [
  "ExpansionTraderPumpkin",
  "ExpansionTraderZucchini",
  "ExpansionExchangeMachine",
  "ExpansionTraderLockerClosedV1",
  "ExpansionTraderLockerClosedV2",
  "ExpansionTraderLockerClosedV3",
  "ExpansionTraderLockerClosedBlueV1",
  "ExpansionTraderLockerClosedBlueV2",
  "ExpansionTraderLockerClosedBlueV3",
];

/** Aggregate of every default trader-side classname (humanoids
 *  static + AI, plus prop objects). Pickers that don't care about
 *  the static-vs-AI distinction render this list flat. */
export const EXPANSION_TRADER_CLASSES: readonly string[] = [
  ...EXPANSION_TRADER_NPCS_STATIC,
  ...EXPANSION_TRADER_NPCS_AI,
  ...EXPANSION_TRADER_OBJECTS,
];

// ---------- Quest NPCs ----------

/** Static quest-giver NPCs. Same model + identity as the trader
 *  series; different inheritance chain so quest-side scripts
 *  hook into them without colliding with trader scripts. */
export const EXPANSION_QUEST_NPCS_STATIC: readonly string[] = ALL_NAMES.map(
  (n) => `ExpansionQuestNPC${n}`,
);

/** AI (walking) quest-giver NPCs. */
export const EXPANSION_QUEST_NPCS_AI: readonly string[] = ALL_NAMES.map(
  (n) => `ExpansionQuestNPCAI${n}`,
);

/** Aggregate of every default quest-NPC classname (static + AI). */
export const EXPANSION_QUEST_NPC_CLASSES: readonly string[] = [
  ...EXPANSION_QUEST_NPCS_STATIC,
  ...EXPANSION_QUEST_NPCS_AI,
];

// ---------- P2P trader NPCs ----------

/** P2P market AI trader NPCs. The wiki only ships an example
 *  (`ExpansionP2PTraderAIJudy`) but the convention mirrors the
 *  regular trader pattern — every roster name has a P2P variant
 *  in the Expansion-P2P PBO. */
export const EXPANSION_P2P_TRADER_NPCS_AI: readonly string[] = ALL_NAMES.map(
  (n) => `ExpansionP2PTraderAI${n}`,
);

/** P2P market static trader NPCs (non-walking). */
export const EXPANSION_P2P_TRADER_NPCS_STATIC: readonly string[] =
  ALL_NAMES.map((n) => `ExpansionP2PTrader${n}`);

// ---------- ATMs ----------

/** Default Expansion ATM entities. */
export const EXPANSION_ATMS: readonly string[] = [
  "ExpansionATMLocker",
  "ExpansionATM_1",
  "ExpansionATM_2",
  "ExpansionATM_3",
];

// ---------- Personal storage ----------

/** Default personal-storage entities shipped with Expansion. The
 *  wiki only documents `ExpansionPersonalStorageChest`; mod-forks
 *  add more. */
export const EXPANSION_PERSONAL_STORAGE: readonly string[] = [
  "ExpansionPersonalStorageChest",
];
