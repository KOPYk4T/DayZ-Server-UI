import { Navigate } from "react-router-dom";

import { ExpansionMapPage } from "@/features/mods/expansion/ExpansionMapPage";
import { LoadoutsPage as ExpansionLoadoutsPage } from "@/features/mods/expansion/loadouts/LoadoutsPage";
import { MarketPage } from "@/features/mods/expansion/market/MarketPage";
import { PlayerSpawnGearPage } from "@/features/mods/expansion/playerspawngear/PlayerSpawnGearPage";
import { NpcsPage } from "@/features/mods/expansion/quests/NpcsPage";
import { ObjectivesPage } from "@/features/mods/expansion/quests/objectives/ObjectivesPage";
import { QuestGraphPage } from "@/features/mods/expansion/quests/QuestGraphPage";
import { QuestsPage } from "@/features/mods/expansion/quests/QuestsPage";
import { TradersPage } from "@/features/mods/expansion/traders/TradersPage";
import { MOD_MODULES } from "@/features/mods/modules";
import { ModsPage } from "@/features/mods/ModsPage";

import { registerAddon } from "./registry";
import { ModsSidebarSection } from "./ModsSidebarSection";
import type { AddonRoute } from "./types";

const routes: AddonRoute[] = [
  { path: "mods", element: <ModsPage /> },
  ...MOD_MODULES.map((mod) => {
    const Page = mod.page;
    return { path: `mods/${mod.slug}`, element: <Page /> };
  }),
  { path: "mods/expansion/market", element: <MarketPage /> },
  { path: "mods/expansion/traders", element: <TradersPage /> },
  { path: "mods/expansion/map", element: <ExpansionMapPage /> },
  { path: "mods/expansion/quests", element: <QuestsPage /> },
  { path: "mods/expansion/quest-graph", element: <QuestGraphPage /> },
  {
    path: "mods/expansion/player-spawn-gear",
    element: <PlayerSpawnGearPage />,
  },
  { path: "mods/expansion/quest-npcs", element: <NpcsPage /> },
  { path: "mods/expansion/objectives", element: <ObjectivesPage /> },
  { path: "mods/expansion/loadouts", element: <ExpansionLoadoutsPage /> },
  // Back-compat redirects: the two old dedicated pages merged into
  // the map editor's mode tabs.
  {
    path: "mods/expansion/trader-placements",
    element: <Navigate to="/app/mods/expansion/map?mode=traders" replace />,
  },
  {
    path: "mods/expansion/trader-zones",
    element: <Navigate to="/app/mods/expansion/map?mode=zones" replace />,
  },
];

registerAddon({
  id: "mods",
  name: "Mods",
  description:
    "Import mod CE files (types.xml, spawnabletypes, events, globals) and configure DayZ Expansion submodules — Market, Traders, Quests, NPCs, Objectives, Map, Player Spawn Gear, Loadouts.",
  routes,
  // The base Sidebar used to inline these entries inside a "Game"
  // supergroup, but that supergroup was removed in a rework. The
  // section now renders as a top-level addon block alongside the
  // Reskin section so the Expansion submodules stay reachable from
  // the menu.
  SidebarSection: ModsSidebarSection,
});
