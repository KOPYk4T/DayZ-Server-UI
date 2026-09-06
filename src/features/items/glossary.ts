/**
 * Single source of truth for end-user explanations around `types.xml`.
 *
 * Every label that needs a tooltip pulls from here so the copy stays
 * consistent across the filter panel, table headers, detail drawer form,
 * and the add-item wizard. Where values are dynamic (usage tags, tiers,
 * categories), the tooltip combines these vanilla references with what
 * the user's current workspace actually uses.
 */

export interface FieldDef {
  /** Short 1-2 sentence description — this is what goes in the tooltip body. */
  description: string;
  /** Optional one-line tagline shown in bold at the top of the tooltip. */
  tagline?: string;
  /** Hard-coded vanilla reference values, where applicable. */
  vanillaValues?: string[];
}

// ---------- Core item fields (PDR §5.3, Appendix B-D) ----------

export const FIELDS: Record<string, FieldDef> = {
  name: {
    tagline: "Classname — the in-game type identifier",
    description:
      "Must be unique across vanilla + mods + custom. Usually matches the in-game item's class (e.g. AK101). Changing a classname is effectively renaming an item; other files (events, spawnabletypes, gear presets) referencing the old name will break.",
  },
  nominal: {
    tagline: "Target number of this item active in the world",
    description:
      "Central Economy tries to keep the live count at this value. Raising nominal means more of this item on the map; 0 disables natural spawning (items can still be placed via events if flags allow).",
  },
  min: {
    tagline: "Guaranteed minimum count",
    description:
      "If the live count drops below min, CE force-spawns until it's reached. min should be lower than nominal, otherwise CE never reaches a stable state.",
  },
  lifetime: {
    tagline: "Seconds the item persists in the world",
    description:
      "After this many seconds on the ground (or in an unused location), CE cleans the item up. Common values: 14400 (4 h), 3888000 (45 d, vehicles/tents). Values below 60 s are almost always a typo.",
  },
  restock: {
    tagline: "Seconds before CE replaces a removed item",
    description:
      "0 means \"bulk respawn all missing copies at server restart.\" Larger values stagger respawns over time, which is easier on the CE engine.",
  },
  quantmin: {
    tagline: "Minimum fill percentage for stackables (−1 = not stackable)",
    description:
      "For ammo boxes, magazines, drinks, etc. CE spawns the item with a random fill in [quantmin, quantmax] percent. Both −1 means the item isn't stackable.",
  },
  quantmax: {
    tagline: "Maximum fill percentage for stackables (−1 = not stackable)",
    description:
      "Pair with quantmin. Valid range 0 — 100. Both −1 disables stack randomisation.",
  },
  cost: {
    tagline: "CE priority weighting",
    description:
      "Used as a tie-breaker when multiple items could fill the same spawn slot. Higher cost → CE prefers this item. Typical values cluster around 100. Don't confuse with in-game trader price.",
  },
  category: {
    tagline: "Coarse item group; must be defined in cfglimitsdefinition.xml",
    description:
      "Exactly one per item. Used by CE for overall balance. Unknown categories silently drop the item from the economy.",
    vanillaValues: [
      "weapons",
      "explosives",
      "clothes",
      "containers",
      "tools",
      "vehiclesparts",
      "food",
      "books",
    ],
  },
  usage: {
    tagline: "Location zones where the item can spawn",
    description:
      "Each usage must be declared in cfglimitsdefinition.xml and mapped to buildings in mapgroupproto.xml. Vanilla caps at 4 per item. An item with no usage tags will never spawn from buildings (only from events with deloot=1).",
    vanillaValues: [
      "Military",
      "Police",
      "Firefighter",
      "Medic",
      "Hunting",
      "Farm",
      "Village",
      "Town",
      "Industrial",
      "School",
      "Office",
      "Coast",
      "Prison",
      "Lunapark",
      "SeasonalEvent",
      "Historical",
      "ContaminatedArea",
      "Tourist",
    ],
  },
  value: {
    tagline: "Loot tier — controls how far inland the item spawns",
    description:
      "Tier1 is coastal / starter loot, Tier4 is deep-inland / military-high-tier. An item with no tier is effectively invisible to tier-gated spawn logic.",
    vanillaValues: ["Tier1", "Tier2", "Tier3", "Tier4", "Unique"],
  },
  tag: {
    tagline: "Physical loot-point placement inside buildings",
    description:
      "Restricts which slots in mapgroupproto accept this item. Mismatched tags mean the item won't spawn even though usage/tier match.",
    vanillaValues: ["shelves", "floor", "ground"],
  },
  source: {
    tagline: "Where the effective definition is coming from",
    description:
      "Vanilla = Bohemia's db/types.xml. Mod = a mod override registered in cfgeconomycore.xml. Custom = your own override in custom/types_custom.xml. Saving a vanilla item always creates a Custom override — vanilla files are never mutated.",
  },
};

// ---------- Flags (types.xml <flags/> attributes) ----------

export interface FlagDef {
  key: keyof ItemFlagsSnake;
  short: string;
  description: string;
  typicalValue: 0 | 1;
}

// Mirrors `ItemFlags` shape in `src/types/ipc.ts`.
export interface ItemFlagsSnake {
  count_in_cargo: 0 | 1;
  count_in_hoarder: 0 | 1;
  count_in_map: 0 | 1;
  count_in_player: 0 | 1;
  crafted: 0 | 1;
  deloot: 0 | 1;
}

export const FLAGS: FlagDef[] = [
  {
    key: "count_in_cargo",
    short: "Count instances stored in a container's cargo",
    description:
      "Normally 0. Instances inside a backpack / crate shouldn't inflate CE's view of how many are on the map, otherwise spawns dry up.",
    typicalValue: 0,
  },
  {
    key: "count_in_hoarder",
    short: "Count instances stored inside hoarder items (barrels, tents, base storage)",
    description:
      "Normally 0. Prevents a full base storage from blocking further world spawns. Set to 1 only for items you never want duplicated no matter where they live.",
    typicalValue: 0,
  },
  {
    key: "count_in_map",
    short: "Count instances placed in the world",
    description:
      "Almost always 1. This is the main CE spawn-count signal. Setting this to 0 means CE never knows the item exists and will keep spawning more.",
    typicalValue: 1,
  },
  {
    key: "count_in_player",
    short: "Count instances carried by a player",
    description:
      "Normally 0. Once a player picks an item up it should leave the economy so new copies can spawn in the world.",
    typicalValue: 0,
  },
  {
    key: "crafted",
    short: "Item can be produced by crafting",
    description:
      "Informational. CE uses this to avoid double-counting crafted outputs in some edge cases. Set to 1 only if the item is a recognised crafting product (rags, etc.).",
    typicalValue: 0,
  },
  {
    key: "deloot",
    short: "Dynamic-event-only loot",
    description:
      "1 = CE does not spawn this item from buildings. It only appears as children of dynamic events (helicrashes, police cars). Used for high-tier military gear.",
    typicalValue: 0,
  },
];

// ---------- Filter helpers ----------

export const FILTER_TOOLTIPS = {
  search:
    "Matches classnames and categories. Tip: paste a partial classname like 'AK' to narrow the list.",
  source:
    "Pick which origins to show. Use Custom-only to review everything you've modified.",
  stackable:
    "Filter by whether quantmin/quantmax define a percent range. 'Only' shows stackable items (ammo, food, drinks); 'None' shows non-stackables (guns, clothes).",
  includeZeroNominal:
    "When off, hides items CE won't spawn (nominal = 0). Useful for focusing on the live economy.",
} as const;

/**
 * Build a tooltip body for a filter / form field that offers a value set.
 * Combines (a) a human description, (b) the vanilla reference values,
 * and (c) the values actually present in the user's loaded workspace.
 */
export function valueHint(field: FieldDef, present: readonly string[]): string {
  const bits: string[] = [field.description];
  if (field.vanillaValues?.length) {
    bits.push(`Vanilla: ${field.vanillaValues.join(", ")}.`);
  }
  if (present.length) {
    bits.push(`Currently in use: ${present.join(", ")}.`);
  }
  return bits.join(" ");
}
