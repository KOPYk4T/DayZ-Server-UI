/**
 * DayZ-Expansion AI loadout shape — one JSON file per loadout preset
 * under `profiles/ExpansionMod/Loadouts/`. The structure is
 * **recursive**: each item can define its own InventoryAttachments
 * (slot → items) and InventoryCargo (items placed in the item's
 * cargo space).
 *
 * We model the top level + one level of depth explicitly so the
 * typed editor can manipulate the common case (bot wears jacket →
 * jacket cargo contains medkit). Deeper nesting (medkit inside an
 * ammo box inside cargo of a vest) round-trips untouched and is
 * accessed via the Raw JSON editor per-item.
 *
 * Reference:
 * https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/
 * (AI / Loadouts section).
 */

export interface LoadoutQuantity {
  Min: number;
  Max: number;
}

export interface LoadoutHealthRange {
  Min: number;
  Max: number;
  Zone: string;
}

export interface LoadoutItem {
  ClassName: string;
  /** Include-by-reference — name of another loadout file to splice
   *  in. Empty string = inline. */
  Include: string;
  Chance: number;
  Quantity: LoadoutQuantity;
  Health: LoadoutHealthRange[];
  /** Recursive nested attachments (slot-keyed). */
  InventoryAttachments: LoadoutAttachmentSlot[];
  /** Recursive nested cargo (item-keyed). */
  InventoryCargo: LoadoutItem[];
  ConstructionPartsBuilt: string[];
  /** Alternative presentation — "pick one of these sets" at spawn. */
  Sets: LoadoutItem[];
  [extra: string]: unknown;
}

export interface LoadoutAttachmentSlot {
  SlotName: string;
  Items: LoadoutItem[];
  [extra: string]: unknown;
}

/** The top-level loadout file shares the `LoadoutItem` shape — the
 *  root `ClassName` is empty. `InventoryAttachments` is the
 *  "dressed bot" view. */
export type Loadout = LoadoutItem;

export const DEFAULT_LOADOUT_ITEM: LoadoutItem = {
  ClassName: "",
  Include: "",
  Chance: 1.0,
  Quantity: { Min: 0, Max: 0 },
  Health: [],
  InventoryAttachments: [],
  InventoryCargo: [],
  ConstructionPartsBuilt: [],
  Sets: [],
};

export const DEFAULT_LOADOUT: Loadout = {
  ...DEFAULT_LOADOUT_ITEM,
};

/** Canonical DayZ attachment slot names, for the "add slot" dropdown.
 *  Users can still type custom slot names (mod-added slots, e.g.
 *  Expansion's `TacticalShirt`). */
export const COMMON_SLOT_NAMES: string[] = [
  "Headgear",
  "Mask",
  "Eyewear",
  "Body",
  "Vest",
  "Hips",
  "Legs",
  "Feet",
  "Back",
  "Shoulder",
  "Melee",
  "Hands",
  "Gloves",
  "Armband",
  "NVG",
  "Chemlight",
];

/** Short summary of what an item carries, for the list view. */
export function summariseItem(it: LoadoutItem): string {
  const parts: string[] = [];
  const att = it.InventoryAttachments?.length ?? 0;
  const crg = it.InventoryCargo?.length ?? 0;
  const sets = it.Sets?.length ?? 0;
  if (att) parts.push(`${att} slot${att === 1 ? "" : "s"}`);
  if (crg) parts.push(`${crg} cargo`);
  if (sets) parts.push(`${sets} sets`);
  return parts.join(" · ") || "bare";
}

/** Count how many items are nested (recursive) — catches cases where
 *  a loadout is nominally "simple" but has deep sets that won't
 *  surface in the typed view. */
export function countDeepItems(it: LoadoutItem): number {
  let n = 1;
  for (const slot of it.InventoryAttachments ?? []) {
    for (const sub of slot.Items ?? []) n += countDeepItems(sub);
  }
  for (const sub of it.InventoryCargo ?? []) n += countDeepItems(sub);
  for (const sub of it.Sets ?? []) n += countDeepItems(sub);
  return n;
}
