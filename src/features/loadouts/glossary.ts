import type { FieldDef } from "@/features/items/glossary";

/**
 * Plain-English definitions for every concept visible on the Loadouts
 * page. Kept in one place so the copy stays consistent between the
 * page explainer, drawer banners, column tooltips, and the README.
 */
export const LOADOUT_FIELDS: Record<string, FieldDef> = {
  spawnableName: {
    tagline: "The PARENT classname this loadout applies to",
    description:
      "Every entry on the Spawnables list is the rule for a single parent — a weapon, container, vehicle, wreck, corpse — that CE already knows how to spawn from types.xml. When CE picks this parent for a natural spawn, it runs the loadout below to decide what attaches to it and what goes in its cargo. If the parent classname isn't in types.xml, nothing here ever fires.",
  },
  hoarder: {
    tagline: "Mark as hoarder item (rare)",
    description:
      "A handful of vanilla spawnables flag themselves hoarder=\"1\" so CE counts them differently against base-storage limits. 99% of entries leave this off.",
  },
  attachmentsGroup: {
    tagline: "Items that slot ONTO the parent",
    description:
      "For weapons: optics, magazines, suppressors, buttstocks, handguards. For clothing: patches, modular pouches. Each attachments group is an independent roll: multiple groups on one spawnable = multiple chances to add slot items, one per group.",
  },
  cargoGroup: {
    tagline: "Items that go INSIDE the parent's inventory",
    description:
      "Loose items inside a crate, ammo inside a jacket's pockets, a first-aid kit inside a vehicle trunk. Same group + pool semantics as attachments — just a different destination on the spawned parent.",
  },
  groupChance: {
    tagline: "Probability this group fires on one spawn (0.0–1.0)",
    description:
      "Rolled once each time CE spawns the parent. 0.5 = 50% chance this group contributes anything at all. 1.0 = always fires. When the group doesn't fire, none of its items spawn. Groups are INDEPENDENT — a spawnable with two attachments groups at 0.5 each will have 25% no-attachment spawns, 50% one-attachment spawns, 25% both-attachment spawns.",
  },
  slotName: {
    tagline: "Label for humans, ignored by CE",
    description:
      "Helps you keep two similar groups straight (\"this one is the optic group, that one is mags\"). CE doesn't read it. Use it whenever a parent has more than one group of the same kind.",
  },
  itemName: {
    tagline: "Classname to slot / drop in cargo when picked",
    description:
      "Must be a valid classname from vanilla types.xml or a loaded mod. Unknown classnames silently fail at runtime — CE rolls the slot but nothing appears. The picker's green 'known' badge confirms we found it in the registry.",
  },
  itemChance: {
    tagline: "Weight inside this group's pool (0.0–1.0)",
    description:
      "When the group's outer chance wins, CE picks ONE item from the pool using these weights. Values don't need to sum to 1 — CE normalises. Tip: `chance=1.0` for a single 'this always' item; `0.3 / 0.3 / 0.3` for a rough three-way random; `0.9 / 0.1` for 'this one usually, that one rarely'. Effective per-spawn probability of an item = group chance × (item chance / sum of item chances in group).",
  },
  itemPreset: {
    tagline: "Reference a named pool from cfgrandompresets instead",
    description:
      "Swaps the group's item list for a preset. The preset (defined on the Presets tab) owns the item pool, so many spawnables can share the same 'scopes' or 'civilian mags' roster and you edit it once. The preset's kind MUST match the group — attachment groups only accept attachment presets, cargo groups only cargo presets.",
  },
  presetName: {
    tagline: "Preset identifier — referenced from spawnable items",
    description:
      "Spawnable items reference presets by this exact name via `preset=\"<name>\"`. Renaming a preset silently breaks every spawnable that referenced the old name — search first. Names are case-sensitive.",
  },
  presetKind: {
    tagline: "cargo (inside-inventory) or attachments (on-slots)",
    description:
      "The element name in cfgrandompresets.xml determines the kind. CE will only pull from presets whose kind matches the referring group — an attachments group referencing a cargo preset fires but lands nothing on the spawned parent.",
  },
  presetChance: {
    tagline: "Base chance the preset contributes an item when referenced (0.0–1.0)",
    description:
      "Multiplies with the referring group's chance. If an attachments group at 0.8 references a preset at 0.5, the combined chance of the preset producing an item for this parent is 0.8 × 0.5 = 0.4. Below the item level, the preset's items use their own chances exactly like inline groups.",
  },
};

// ---------- Page-level strings ----------

export const LOADOUTS_TAGLINE =
  "Two files that decide what goes on and inside everything CE spawns.";

export const LOADOUTS_HOW_IT_WORKS = {
  title: "How Loadouts work",
  bullets: [
    {
      heading: "Spawnables (cfgspawnabletypes.xml)",
      body: "Rules for parent classnames. When CE picks an M4A1 to spawn naturally, it looks up the M4A1 entry here and uses it to decide whether to add an optic, a magazine, anything in cargo. Each row on the Spawnables tab = one parent's rules.",
    },
    {
      heading: "Random presets (cfgrandompresets.xml)",
      body: "Reusable item pools with names. A 'scopeSet' preset might be {ACOG 40%, PSO-1 30%, PU 30%}. Spawnable groups reference a preset by name instead of spelling out the pool, so many parents can share — and you edit in one place.",
    },
    {
      heading: "Attachments vs cargo",
      body: "Attachments slot ONTO the parent (optic, mag, patches). Cargo goes INSIDE it (ammo in a jacket, loot in a crate). A spawnable can have many groups of each kind; each group is an independent roll when the parent spawns.",
    },
    {
      heading: "Two chances combine",
      body: "Every group has a group chance (does the group fire this spawn?). When it fires, CE picks ONE item from the pool weighted by per-item chance. Effective probability of a specific item = group chance × (item chance / sum of item chances). The effective-% badges next to each item row show the maths live.",
    },
    {
      heading: "What saving does",
      body: "Writes an override into custom/spawnabletypes_custom.xml or custom/cfgrandompresets_custom.xml (never vanilla). CE uses your values for all future natural spawns on the next server restart. Existing in-world items aren't re-rolled — they live out their lifetime, then CE replaces them under the new rules.",
    },
  ],
};

export const SPAWNABLE_EMPTY_HINT =
  "Spawnables without any groups never add attachments or cargo — CE spawns the parent bare. Add an attachments group or a cargo group to give CE something to roll.";

export const PRESET_EMPTY_HINT =
  "A preset with no items never contributes anything — CE rolls nothing when referenced. Add at least one item.";

/** Effective per-spawn probability of `item_i` inside a group:
 *  group_chance × (item_chance_i / sum of item chances in group).
 *  Returns 0 when the group has no items or sum=0.
 */
export function effectiveProbability(
  groupChance: number,
  itemChance: number,
  totalItemChance: number,
): number {
  if (totalItemChance <= 0) return 0;
  return groupChance * (itemChance / totalItemChance);
}

export function formatProbability(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p >= 0.995) return "≈100%";
  if (p <= 0.005 && p > 0) return "<1%";
  return `${Math.round(p * 100)}%`;
}
