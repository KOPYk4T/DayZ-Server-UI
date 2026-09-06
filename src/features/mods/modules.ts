/**
 * Registry of per-mod configurator modules.
 *
 * Each known mod (DayZ Expansion, TraderPlus, Dr Jones, Community
 * Framework, …) gets one entry here. The Mods overview page, the
 * sidebar, and the router all iterate the same list — add a module
 * to register it everywhere.
 *
 * A module is "detected" when `isDetected(scan)` returns true against
 * the latest `mods_scan` result. Detection decides whether the
 * sidebar shows a sub-entry and whether the jump card appears on the
 * Mods overview.
 *
 * Each module also declares which vanilla systems it *overrides*.
 * Vanilla editors subscribe to the cross-awareness index (see
 * `crossAwareness.ts`) and show a banner when any currently-active
 * mod overrides the system they're editing.
 */

import type { ReactElement } from "react";
import { Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ExpansionPage } from "@/features/mods/expansion/ExpansionPage";
import type { KnownModKind, ModsScan } from "@/types/ipc";

/**
 * Vanilla subsystems that mods can supersede or extend. A mod
 * declaring `overrides: ["player-spawns"]` causes the vanilla Player
 * Spawns page to show a "Expansion also configures this here →"
 * banner when that mod is active.
 *
 * Adding a new value: extend this union, add the matching banner
 * consumer in the vanilla editor (usually a one-line
 * `useOverridingMods("…")` call), and declare it on any mod module
 * whose feature set supersedes it.
 */
export type VanillaSystem =
  | "player-spawns"
  | "spawn-gear"
  | "events"
  | "types"
  | "serverdz-cfg"
  | "map-markers"
  | "raid-damage"
  | "territories"
  | "ai-loadouts";

export interface ModModule {
  /** Maps to `KnownModKind` on `ModInfo`. Also used as a stable id. */
  known: KnownModKind;
  /** Display label shown on the jump card, sidebar, and page header. */
  label: string;
  /** Route path fragment under `/app/mods/`. E.g. `"expansion"`. */
  slug: string;
  /** Sidebar icon. */
  icon: LucideIcon;
  /** One-line summary for the jump card on the Mods overview. Should
   *  be short and derived from live scan data (counts, versions…). */
  summary: (scan: ModsScan) => string;
  /** True when the module should show up in the sidebar and on the
   *  overview. Typically checks both CE registration and a mod
   *  folder on disk, whichever is available. */
  isDetected: (scan: ModsScan) => boolean;
  /** The full-page configurator component rendered at
   *  `/app/mods/<slug>`. */
  page: () => ReactElement;
  /** Vanilla systems that this mod supersedes or competes with.
   *  Consumed by `useOverridingMods(system)` to render a banner in
   *  the matching vanilla editor. Empty array = no overrides. */
  overrides: VanillaSystem[];
}

export const MOD_MODULES: ModModule[] = [
  {
    known: "expansion",
    label: "DayZ Expansion",
    slug: "expansion",
    icon: Layers,
    summary: (scan) => {
      const inv = scan.expansion;
      if (!inv) {
        return "Mod present — settings tree not found yet. Boot the server with Expansion loaded once.";
      }
      return `${inv.settingsFiles.length} settings file${
        inv.settingsFiles.length === 1 ? "" : "s"
      } · ${inv.dataFolders.length} data folder${
        inv.dataFolders.length === 1 ? "" : "s"
      }`;
    },
    isDetected: (scan) =>
      scan.expansion != null ||
      scan.mods.some((m) => m.known === "expansion"),
    page: ExpansionPage,
    overrides: [
      // SpawnSelection replaces cfgplayerspawnpoints.xml.
      "player-spawns",
      // Expansion SpawnGear replaces cfgPlayerSpawnGear.json.
      "spawn-gear",
      // Expansion Book / map marker system replaces vanilla init-
      // time markers.
      "map-markers",
      // DamageSystemSettings + RaidSettings override vanilla raid /
      // damage behaviour.
      "raid-damage",
      // TerritorySettings supersedes parts of vanilla base-building
      // gating.
      "territories",
      // AI/Loadouts JSON replaces cfgrandompresets for AI loadout
      // authoring.
      "ai-loadouts",
    ],
  },
];

export function detectedModules(scan: ModsScan | null | undefined): ModModule[] {
  if (!scan) return [];
  return MOD_MODULES.filter((m) => m.isDetected(scan));
}

export function moduleBySlug(slug: string): ModModule | null {
  return MOD_MODULES.find((m) => m.slug === slug) ?? null;
}

/** Look up a module by its `known` key (the `ModInfo.known` / mod id
 *  we persist in the activation store). Returns `null` when the mod
 *  has no dedicated module yet — the caller should fall back to the
 *  generic page or banner text. */
export function moduleByKnown(known: KnownModKind): ModModule | null {
  return MOD_MODULES.find((m) => m.known === known) ?? null;
}
