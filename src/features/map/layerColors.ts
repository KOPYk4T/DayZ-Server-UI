import type { PlayerSpawnKind } from "./types";

/** Colour coding shared by the layer toggle panel and the markers on
 *  the map. Kept in one place so the legend never drifts from what's
 *  actually painted. */
export const PLAYER_SPAWN_COLORS: Record<PlayerSpawnKind, string> = {
  fresh: "#3b82f6", // blue
  hop: "#a855f7", // purple
  travel: "#f97316", // orange
};

export const EVENT_SPAWN_COLOR = "#f59e0b"; // amber

/** Trader NPC placements from Expansion `.map` files. AI traders
 *  get a lighter shade to distinguish from static shopkeepers. */
export const TRADER_NPC_COLOR = "#06b6d4"; // cyan-500
export const TRADER_AI_COLOR = "#0891b2"; // cyan-600 (darker for AI)

/** Expansion safezones — green-family so the "safe" connotation
 *  reads without needing a legend. */
export const SAFEZONE_COLOR = "#22c55e"; // green-500
export const SAFEZONE_COLOR_SELECTED = "#16a34a"; // green-600

/** Expansion Quest NPCs. Purple/violet so they sit clearly apart
 *  from trader pins (cyan) and safezones (green) when all layers
 *  stack. */
export const QUEST_NPC_COLOR = "#a855f7"; // purple-500
export const QUEST_NPC_COLOR_SELECTED = "#9333ea"; // purple-600

/** Territory categories from `<mission>/env/*.xml`. Hand-picked
 *  palette keyed by the filename stem so colours stay stable across
 *  sessions and never collide with the layers above. Unknown
 *  categories (e.g. a mod adds `unicorn_territories.xml`) fall
 *  through to `TERRITORY_FALLBACK_COLOR`. */
export const TERRITORY_COLORS: Record<string, string> = {
  bear: "#b45309", // amber-700 — big brown beast
  wolf: "#6b7280", // gray-500
  fox: "#f97316", // orange-500
  hare: "#fbbf24", // amber-400
  hen: "#facc15", // yellow-400
  pig: "#fb7185", // rose-400
  red_deer: "#b91c1c", // red-700
  roe_deer: "#dc2626", // red-600
  sheep_goat: "#e5e7eb", // gray-200
  wild_boar: "#78350f", // amber-900
  cattle: "#a16207", // yellow-700
  domestic_animals: "#d97706", // amber-600
  zombie: "#7f1d1d", // red-900 — infected territories
};
export const TERRITORY_FALLBACK_COLOR = "#14b8a6"; // teal-500
export const TERRITORY_COLOR_SELECTED = "#ffffff"; // white outline on selection

export function colorForTerritoryCategory(category: string): string {
  return TERRITORY_COLORS[category] ?? TERRITORY_FALLBACK_COLOR;
}

/** Expansion Spawn Selection locations — amber/yellow. Distinct
 *  from every other layer so clustered spawn pins read at a glance
 *  even when traders/zones/safezones are stacked on top. */
export const SPAWN_SELECTION_COLOR = "#eab308"; // yellow-500
export const SPAWN_SELECTION_COLOR_SELECTED = "#ca8a04"; // yellow-600

/** Per-usage colour for building placement dots. Priority order:
 *  the first usage in this list is treated as the "dominant" usage
 *  when a prototype has multiple — e.g. `Industrial + Farm` paints
 *  as Industrial. Unknown usage → gray. */
export const USAGE_COLORS: Record<string, string> = {
  Military: "#dc2626", // red
  Police: "#f97316", // orange (close to Military)
  Prison: "#991b1b", // dark red
  Firefighter: "#ea580c", // deep orange
  Medic: "#ec4899", // pink
  School: "#a855f7", // purple
  Industrial: "#f59e0b", // amber
  Town: "#3b82f6", // blue
  Village: "#06b6d4", // cyan
  Farm: "#22c55e", // green
  Hunting: "#15803d", // dark green
  Coast: "#0ea5e9", // sky blue
  Office: "#6366f1", // indigo
  SeasonalEvent: "#d946ef", // fuchsia
  ContaminatedArea: "#84cc16", // lime
  Special: "#e879f9", // pink-fuchsia
  Lunapark: "#f472b6", // rose
  Underground: "#78716c", // stone
  AbandonedMine: "#a8a29e", // stone-400
  Camp: "#65a30d", // lime-600
  SatelliteStation: "#38bdf8", // sky-400
};

/** Priority order for picking a placement's "dominant" usage when
 *  the prototype has several. Military / Police / Prison top the
 *  list because they're the most interesting to visualise — mixed
 *  rural buildings should fall through to their highest-signal
 *  usage. */
export const USAGE_PRIORITY: string[] = [
  "Military",
  "Police",
  "Prison",
  "Firefighter",
  "Medic",
  "School",
  "Industrial",
  "Town",
  "Village",
  "Farm",
  "Hunting",
  "Coast",
];

export const UNKNOWN_USAGE_COLOR = "#6b7280"; // gray-500


/** Pick the dominant usage for a prototype (first hit in
 *  USAGE_PRIORITY, otherwise the first usage listed). Returns
 *  `null` for prototypes with no usages. */
export function dominantUsage(usages: readonly string[]): string | null {
  if (usages.length === 0) return null;
  for (const p of USAGE_PRIORITY) {
    if (usages.includes(p)) return p;
  }
  return usages[0];
}

export function colorForUsage(usage: string | null): string {
  if (!usage) return UNKNOWN_USAGE_COLOR;
  return USAGE_COLORS[usage] ?? UNKNOWN_USAGE_COLOR;
}

export function hexToRgb(hex: string): [number, number, number] {
  const s = hex.trim().replace(/^#/, "");
  if (s.length !== 6) return [107, 114, 128];
  const n = Number.parseInt(s, 16);
  if (Number.isNaN(n)) return [107, 114, 128];
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
