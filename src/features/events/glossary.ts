import type { FieldDef } from "@/features/items/glossary";

/** Per-field help copy for dynamic events (PDR §5.3, §9.2). */
export const EVENT_FIELDS: Record<string, FieldDef> = {
  name: {
    tagline: "Event name — unique key",
    description:
      "Referenced by cfgeventspawns.xml for fixed positions and by cfgspawnabletypes for loadouts. Renaming an event breaks both links.",
  },
  nominal: {
    tagline: "Target live count of this event",
    description:
      "CE tries to keep this many instances active. Different from item nominal — here it's event groups, not individual loot pieces.",
  },
  min: {
    tagline: "Minimum active instances",
    description: "CE force-spawns until this count is reached.",
  },
  max: {
    tagline: "Cap on active instances",
    description:
      "0 means no explicit cap beyond nominal. Otherwise must be >= min.",
  },
  lifetime: {
    tagline: "Seconds an event stays active before CE cleans it up",
    description:
      "Typical heli crash is 3600 (1h). Short-lived infected events are ~600.",
  },
  restock: {
    tagline: "Seconds before CE replaces a cleared event",
    description:
      "0 means immediate eligibility for re-spawn. Larger values pace event cycles.",
  },
  saferadius: {
    tagline: "Exclusion radius around players (metres)",
    description:
      "Event won't spawn within this distance of a player. Should be >= distanceradius so the event doesn't overlap the player's loaded entities.",
  },
  distanceradius: {
    tagline: "Minimum distance from existing events of the same kind",
    description:
      "Prevents clustering of heli crashes / police cars / shipwrecks.",
  },
  cleanupradius: {
    tagline: "Radius CE scans for staleness before cleanup",
    description:
      "Event is removed when no player has been inside this radius for its lifetime.",
  },
  secondary: {
    tagline: "Optional secondary event chain",
    description:
      "Name of another event to trigger alongside this one (e.g. infected follow-up at a helicrash). Blank = none.",
  },
  position: {
    tagline: "How the event picks its coordinates",
    description:
      "Fixed = spawns ONLY at the (x, z) entries for its name in cfgeventspawns.xml — no entries, no spawns ever. Random = the event's own scripted logic decides where to place it (usually anywhere on the map, sometimes bound to a trigger area set up by the mod or vanilla script); cfgeventspawns entries are ignored for these. Most vehicle / wreck / police-car events are fixed; infected and wildlife events are usually random.",
  },
  limit: {
    tagline: "How CE counts the event — and who actually places it",
    description:
      "Child: each child counts as 1 toward nominal. Parent: only one per event group. Mixed (vanilla default): parent counts + children are extras. Custom: CE hands placement over to scripted logic. Vanilla Infected* and animal events use custom — they're placed by the infected-territories / animal-zone systems, NOT by cfgeventspawns. That's why custom-limit events with position=\"fixed\" can have no positions and still spawn normally in-game.",
  },
  active: {
    tagline: "0 or 1 — quick-disable",
    description:
      "Flip to 0 to stop CE spawning the event without deleting it. Equivalent to disabling an item.",
  },
  flags: {
    tagline: "deletable / init_random / remove_damaged",
    description:
      "deletable=1 lets CE clean up on lifetime expiry. init_random=1 jitters first spawn. remove_damaged=1 removes destroyed-vehicle events instead of leaving wrecks.",
  },
  children: {
    tagline: "Classnames CE will spawn as part of this event",
    description:
      "Each child is a classname plus optional loot-count range. Typically the event vehicle/wreck plus loot containers. Children with lootmin/max > 0 drop loot from spawnabletypes.",
  },
  positions: {
    tagline: "Fixed coordinates (x / z / yaw)",
    description:
      "Only used for fixed-position events. x/z are DayZ world metres; yaw is degrees or -1 for random. Optional group tag clusters positions.",
  },
};

/**
 * Per-column help for the Children editor inside the event drawer.
 * These are attributes on each `<child>` entry.
 */
export const CHILD_FIELDS: Record<string, FieldDef> = {
  classname: {
    tagline: "What the event spawns",
    description:
      "Classname of the entity to place as part of this event — the wreck / vehicle / infected / loot container. Must be defined by vanilla DayZ or an installed mod. Green 'known' badge means we found it in a loaded types.xml; amber 'unknown' is fine for mod classes without CE metadata.",
  },
  lootmin: {
    tagline: "Minimum loot pieces attached to this child",
    description:
      "Lower bound for how many loot pieces CE places into this child's cargo/attachments. CE picks a random number in [lootmin, lootmax]. 0 means the child can spawn empty. Loot is drawn from this classname's entry in cfgspawnabletypes.xml.",
  },
  lootmax: {
    tagline: "Maximum loot pieces attached to this child",
    description:
      "Upper bound for the random loot count. Set equal to lootmin to force a fixed count. 0 on both disables loot on this child entirely — useful when the child is pure scenery (e.g. a wreck model with no containers inside).",
  },
  min: {
    tagline: "Minimum instances of this child per event trigger",
    description:
      "How many copies of this classname the event spawns when it fires. 1 is typical for the main entity (one wreck per helicrash). 0 makes the child optional, paired with a higher max for random variety.",
  },
  max: {
    tagline: "Maximum instances of this child per event trigger",
    description:
      "Upper bound. For a heli wreck you'd use 1/1. For 'up to 3 loot crates' you'd use 0/3 or 1/3. Vanilla events are almost always 1/1 for the main wreck and 0/N for optional extras.",
  },
};

/**
 * Per-column help for the Positions editor inside the event drawer.
 * These map to `<pos x z a [group]/>` attributes in cfgeventspawns.xml.
 */
export const POSITION_FIELDS: Record<string, FieldDef> = {
  x: {
    tagline: "World X coordinate (east-west), in metres",
    description:
      "DayZ map coordinate. Chernarus is 0–15360, Livonia is 0–12800, Sakhal similar. Same value you'd pass to admin-tool teleport commands. Measure off the in-game map or use an online Chernarus+ coordinates overlay.",
  },
  z: {
    tagline: "World Z coordinate (north-south), in metres",
    description:
      "DayZ uses x/z for the horizontal plane — 'y' is vertical (height), which CE files ignore. Larger z = further north. Do not confuse with the traditional x/y convention from map software.",
  },
  a: {
    tagline: "Yaw (rotation) in degrees, or -1 for random",
    description:
      "0° faces north, 90° faces east. -1 makes CE pick a random yaw each time the event spawns — useful for wrecks and debris so they don't all face the same way.",
  },
  group: {
    tagline: "Optional cluster tag",
    description:
      "Lets a script pick positions as a set (e.g. 'heli_1' for coordinated wreck + debris positions). Most events leave this blank. Writing a value when nothing consumes it is harmless — CE ignores unknown groups.",
  },
};
