export const ZONES_TIERS_EXPLAINER = {
  title: "What this page controls",
  body: "cfglimitsdefinition.xml declares the *valid names* every item in types.xml is allowed to reference. Add a tag here first, then assign it to items — an item referencing an undeclared usage / value / category / tag is effectively invisible to CE for that dimension and silently fails to spawn.",
  bullets: [
    {
      heading: "Categories",
      body: "High-level groups every item belongs to — vanilla uses weapons, explosives, clothes, containers, tools, vehiclesparts, food, books. Used by CE for overall balance. Unknown categories silently drop the item from the economy.",
    },
    {
      heading: "Tags",
      body: "Physical loot-point placement inside buildings — vanilla uses shelves, floor, ground. Items with tags that don't match any building prototype's loot point won't spawn from that building.",
    },
    {
      heading: "Usage flags",
      body: "Location zones (Military, Police, Hunting, Farm, …). Items carrying a usage flag spawn only at building prototypes in mapgroupproto.xml that declare the same usage. Vanilla caps at 4 usage tags per item. The bitfield `value` attribute is optional on most DayZ versions.",
    },
    {
      heading: "Value flags",
      body: "Loot tiers (Tier1 coastal/starter → Tier4 inland military, plus Unique). CE gates spawns by tier coverage across the map — you add a Tier5, no building allows Tier5, nothing spawns at Tier5.",
    },
  ],
} as const;

export const LIMIT_FIELDS = {
  name: {
    tagline: "The identifier used by types.xml",
    description:
      "Case-sensitive. References must match exactly. Renaming a flag here breaks every item that referenced the old name — cross-ref warnings will surface them on the Items page immediately.",
  },
  value: {
    tagline: "Bitmask integer (optional)",
    description:
      "Modern DayZ uses powers of two for efficient flag checks — 1, 2, 4, 8, 16, … Leave blank if your cfglimitsdefinition.xml doesn't include it; CE assigns an implicit value. If you do fill it, pick a power of two that isn't already taken by another flag of the same kind.",
  },
  impact: {
    tagline: "Item count referencing this name",
    description:
      "How many items in the merged registry (vanilla + mods + customs) list this flag. Removing a flag while items still reference it leaves those items orphaned with an 'unknown' warning on the Items page.",
  },
};
