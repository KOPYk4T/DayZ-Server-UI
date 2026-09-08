import {
  Boxes,
  Building2,
  EyeOff,
  FileText,
  Map as MapIcon,
  MapPin,
  PackageSearch,
  Shield,
  ShirtIcon,
  Sliders,
  Target,
  Workflow,
} from "lucide-react";

import { LandingPage } from "@/features/landing/LandingPage";
import { useEventsSnapshot } from "@/hooks/useEvents";
import { useGearSetsSnapshot } from "@/hooks/useGearSets";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useLoadoutsSnapshot } from "@/hooks/useLoadouts";
import { usePlayerSpawnsSnapshot } from "@/hooks/usePlayerSpawns";

export function MissionLandingPage() {
  const items = useItemsSnapshot();
  const events = useEventsSnapshot();
  const loadouts = useLoadoutsSnapshot();
  const gearSets = useGearSetsSnapshot();
  const spawns = usePlayerSpawnsSnapshot();

  const itemCount = items.data?.items.length ?? 0;
  const eventCount = events.data?.events.length ?? 0;
  const eventPositions = (events.data?.spawns ?? []).reduce(
    (acc, g) => acc + g.positions.length,
    0,
  );
  const spawnablesCount = loadouts.data?.spawnables.length ?? 0;
  const presetsCount = loadouts.data?.presets.length ?? 0;
  const gearSetCount = gearSets.data?.data.loadouts.length ?? 0;
  const spawnTotal =
    (spawns.data?.data.fresh.length ?? 0) +
    (spawns.data?.data.hop.length ?? 0) +
    (spawns.data?.data.travel.length ?? 0);

  return (
    <LandingPage
      title="Mission"
      intro="Everything that ships inside the mpmissions/ tree — the CE loot loop, the mission-level rules, and the world placements that decide where players and events land. Changes here only take effect after the next push."
      stats={[
        {
          label: "Types",
          value: itemCount.toLocaleString(),
          icon: Boxes,
          hint: "types.xml + overrides",
        },
        {
          label: "Events",
          value: eventCount.toLocaleString(),
          icon: Target,
          hint: `${eventPositions.toLocaleString()} positions`,
        },
        {
          label: "Loadouts",
          value: spawnablesCount.toLocaleString(),
          icon: PackageSearch,
          hint: `${presetsCount.toLocaleString()} random presets`,
        },
        {
          label: "Player spawns",
          value: spawnTotal.toLocaleString(),
          icon: MapPin,
          hint: "fresh · hop · travel",
        },
      ]}
      sections={[
        {
          to: "/app/items",
          label: "Types",
          description:
            "The types.xml economy — nominal, min, lifetime, usage zones, value tiers. Vanilla + mod + your custom overrides, all merged.",
          icon: Boxes,
          stat: `${itemCount.toLocaleString()} classes`,
        },
        {
          to: "/app/events",
          label: "Events",
          description:
            "events.xml dynamic events (vehicles, infected territories, heli crashes) + cfgeventspawns.xml positions. Timers, child pools, flags.",
          icon: Target,
          stat: `${eventCount.toLocaleString()} events · ${eventPositions.toLocaleString()} positions`,
        },
        {
          to: "/app/loadouts",
          label: "Loadouts",
          description:
            "cfgspawnabletypes.xml (what an item spawns with) and cfgrandompresets.xml (named random pools).",
          icon: PackageSearch,
          stat: `${spawnablesCount.toLocaleString()} spawnables`,
        },
        {
          to: "/app/gear-sets",
          label: "Gear Sets",
          description:
            "Starting gear — cfggameplay spawn presets or cfgPlayerSpawnGear.json. What a fresh spawn actually carries.",
          icon: ShirtIcon,
          stat: `${gearSetCount.toLocaleString()} gear set(s)`,
        },
        {
          to: "/app/player-spawns",
          label: "Player Spawns",
          description:
            "cfgplayerspawnpoints.xml — the three spawn kinds and their positions on the map.",
          icon: MapPin,
          stat: `${spawnTotal.toLocaleString()} spawn points`,
        },
        {
          to: "/app/zones-tiers",
          label: "Zones & Tiers",
          description:
            "cfgeconomycore wiring for usage zones, tier values, and the limits definition they reference.",
          icon: Shield,
        },
        {
          to: "/app/buildings",
          label: "Buildings",
          description:
            "mapgrouppos.xml placements + mapgroupproto.xml prototypes. What buildings exist, where, and how many loot points each exposes.",
          icon: Building2,
        },
        {
          to: "/app/gameplay",
          label: "Gameplay",
          description:
            "cfggameplay.json — stamina, shock, drowning, movement, base-building tolerances, UI flags.",
          icon: Sliders,
        },
        {
          to: "/app/ignorelist",
          label: "CE ignore list",
          description:
            "cfgignorelist.xml — classnames the CE skips loading. Useful to suppress a modded item without removing the mod.",
          icon: EyeOff,
        },
        {
          to: "/app/map",
          label: "Map",
          description:
            "Unified 2D view of spawns, event positions, and building placements. The fastest way to sanity-check world coverage.",
          icon: MapIcon,
        },
        {
          to: "/app/spawn-flow",
          label: "Spawn flow",
          description:
            "How the Central Economy picks what spawns where — three loops (loot, events, players), which files feed each. Start here if you're new.",
          icon: Workflow,
          badge: "diagram",
        },
      ]}
      footer={
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <FileText className="mr-1.5 inline h-3 w-3" />
          All edits land in the workspace first. Review the file list on
          <strong>Sync</strong> before Sync to local or Push to Remote.
        </div>
      }
    />
  );
}
