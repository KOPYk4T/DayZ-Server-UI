/**
 * Cross-reference indexes for the Items "Linked In" panel.
 *
 * Given the events and loadouts snapshots already cached by TanStack
 * Query, build four lookup indexes keyed by classname so the UI can
 * answer "everywhere this item is referenced" in O(1) per lookup:
 *
 * 1. `loadoutByParent` — does a cfgspawnabletypes entry exist whose
 *    parent (`name=`) is this classname? i.e. this item itself has a
 *    loadout attached to it.
 * 2. `usedInLoadouts` — the reverse: which other spawnables list this
 *    classname as an attachment or cargo item?
 * 3. `usedInEvents` — which dynamic events have this classname as a
 *    `<child>` (or `<childEx>`)?
 * 4. `usedInPresets` — which random presets list this classname in
 *    their item pool?
 *
 * Preset references are ignored in `usedInLoadouts` (those spawnable
 * items use `preset=` instead of `name=`).
 */

import type {
  DynamicEvent,
  EventsSnapshot,
  LoadoutsSnapshot,
  PresetKind,
  RandomPreset,
  SpawnableType,
} from "@/types/ipc";

export interface SpawnableItemRef {
  parentName: string;
  where: "attachments" | "cargo";
  groupIndex: number;
  slotName?: string | null;
}

export interface EventChildRef {
  eventName: string;
  childIndex: number;
  lootmin: number;
  lootmax: number;
  min: number;
  max: number;
  /** True when the child appears in `<extended><childrenEx>` rather than `<children>`. */
  extended: boolean;
}

export interface PresetMembershipRef {
  presetName: string;
  kind: PresetKind;
  /** The per-item chance inside the preset pool. */
  chance: number;
}

export interface ItemLinks {
  /** The spawnable whose parent classname EQUALS this item. */
  loadout: SpawnableType | null;
  usedInLoadouts: SpawnableItemRef[];
  usedInEvents: EventChildRef[];
  usedInPresets: PresetMembershipRef[];
  /** Total count excluding `loadout` (loadout is shown separately). */
  referencedFromCount: number;
  /** True if any of the four dimensions has a reference. */
  hasAny: boolean;
}

export interface LinkIndexes {
  loadoutByParent: Map<string, SpawnableType>;
  usedInLoadouts: Map<string, SpawnableItemRef[]>;
  usedInEvents: Map<string, EventChildRef[]>;
  usedInPresets: Map<string, PresetMembershipRef[]>;
}

export function emptyIndexes(): LinkIndexes {
  return {
    loadoutByParent: new Map(),
    usedInLoadouts: new Map(),
    usedInEvents: new Map(),
    usedInPresets: new Map(),
  };
}

export function buildLinkIndexes(
  events: EventsSnapshot | undefined,
  loadouts: LoadoutsSnapshot | undefined,
): LinkIndexes {
  const idx = emptyIndexes();

  if (loadouts) {
    for (const s of loadouts.spawnables) {
      idx.loadoutByParent.set(s.name, s);
      collectSpawnableRefs(s, idx.usedInLoadouts);
    }
    for (const p of loadouts.presets) {
      collectPresetRefs(p, idx.usedInPresets);
    }
  }
  if (events) {
    for (const e of events.events) {
      collectEventChildRefs(e, idx.usedInEvents);
    }
  }

  return idx;
}

function collectSpawnableRefs(
  s: SpawnableType,
  out: Map<string, SpawnableItemRef[]>,
) {
  s.attachments.forEach((g, gi) => {
    for (const it of g.items) {
      if (!it.name || it.preset) continue;
      appendRef(out, it.name, {
        parentName: s.name,
        where: "attachments",
        groupIndex: gi,
        slotName: g.slotName ?? null,
      });
    }
  });
  s.cargo.forEach((g, gi) => {
    for (const it of g.items) {
      if (!it.name || it.preset) continue;
      appendRef(out, it.name, {
        parentName: s.name,
        where: "cargo",
        groupIndex: gi,
      });
    }
  });
}

function collectEventChildRefs(
  e: DynamicEvent,
  out: Map<string, EventChildRef[]>,
) {
  e.children.forEach((c, i) => {
    if (!c.type) return;
    appendRef(out, c.type, {
      eventName: e.name,
      childIndex: i,
      lootmin: c.lootmin,
      lootmax: c.lootmax,
      min: c.min,
      max: c.max,
      extended: false,
    });
  });
  e.childrenEx.forEach((c, i) => {
    if (!c.type) return;
    appendRef(out, c.type, {
      eventName: e.name,
      childIndex: i,
      lootmin: c.lootmin,
      lootmax: c.lootmax,
      min: c.min,
      max: c.max,
      extended: true,
    });
  });
}

function collectPresetRefs(
  p: RandomPreset,
  out: Map<string, PresetMembershipRef[]>,
) {
  for (const it of p.items) {
    if (!it.name) continue;
    appendRef(out, it.name, {
      presetName: p.name,
      kind: p.kind,
      chance: it.chance,
    });
  }
}

function appendRef<K, V>(map: Map<K, V[]>, key: K, ref: V) {
  const existing = map.get(key);
  if (existing) {
    existing.push(ref);
  } else {
    map.set(key, [ref]);
  }
}

export function getItemLinks(idx: LinkIndexes, name: string): ItemLinks {
  const loadout = idx.loadoutByParent.get(name) ?? null;
  const usedInLoadouts = idx.usedInLoadouts.get(name) ?? [];
  const usedInEvents = idx.usedInEvents.get(name) ?? [];
  const usedInPresets = idx.usedInPresets.get(name) ?? [];
  const referencedFromCount =
    usedInLoadouts.length + usedInEvents.length + usedInPresets.length;
  return {
    loadout,
    usedInLoadouts,
    usedInEvents,
    usedInPresets,
    referencedFromCount,
    hasAny: loadout !== null || referencedFromCount > 0,
  };
}

/**
 * Small summary that the items table row can render as icon+counts. Keep
 * the shape stable — the table column is width-constrained and needs to
 * know all three numbers without reading the full detail.
 */
export interface ItemLinkCounts {
  hasLoadout: boolean;
  inLoadouts: number;
  inEvents: number;
  inPresets: number;
}

export function getItemLinkCounts(
  idx: LinkIndexes,
  name: string,
): ItemLinkCounts {
  return {
    hasLoadout: idx.loadoutByParent.has(name),
    inLoadouts: idx.usedInLoadouts.get(name)?.length ?? 0,
    inEvents: idx.usedInEvents.get(name)?.length ?? 0,
    inPresets: idx.usedInPresets.get(name)?.length ?? 0,
  };
}
