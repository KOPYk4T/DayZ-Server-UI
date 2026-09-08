import {
  Boxes,
  Building2,
  FileText,
  Layers,
  Map as MapIcon,
  Package,
  PackagePlus,
  Puzzle,
  ScrollText,
  ShirtIcon,
  Sliders,
  Store,
  UsersRound,
} from "lucide-react";

import { SidebarItem } from "@/components/layout/Sidebar";
import { detectedModules } from "@/features/mods/modules";
import { useModsScan } from "@/hooks/useMods";

/**
 * Top-level "Mods" sidebar section. Lists the mod-import landing
 * page, every detected mod (driven by the live mods scan), plus the
 * full DayZ Expansion submodule editor set when Expansion is the
 * detected mod.
 *
 * Originally the base Sidebar inlined this content under a "Game"
 * supergroup; that supergroup was removed during a sidebar rework
 * which left the Mods routes reachable only by URL. This component
 * is now rendered as its own top-level addon section (matching
 * Reskin's pattern) so the Expansion submodules are clickable
 * again from the menu.
 */
export function ModsSidebarSection() {
  const scan = useModsScan().data;
  const modules = detectedModules(scan);
  const expansionDetected = modules.some((m) => m.known === "expansion");

  return (
    <section className="mb-5">
      <div className="mb-1 flex items-center gap-1.5 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/90">
        <Package className="h-3.5 w-3.5 opacity-80" />
        <span>Mods</span>
      </div>
      <ul className="space-y-0.5">
        <SidebarItem
          to="/app/mod-settings"
          icon={Sliders}
          label="Mod settings"
          depth="menu"
        />
        <SidebarItem
          to="/app/mods"
          icon={PackagePlus}
          label="Mod imports"
          depth="menu"
        />
        {/* Generic per-mod configurator entries, emitted at sub
            depth so the indent reads as a child of "Mod imports".
            Driven by the live mods-scan so only mods we actually
            detect on the server show up. */}
        {modules
          .filter((m) => m.known !== "expansion")
          .map((mod) => (
            <SidebarItem
              key={mod.slug}
              to={`/app/mods/${mod.slug}`}
              icon={mod.icon ?? Puzzle}
              label={mod.label}
              depth="sub"
            />
          ))}

        {expansionDetected ? (
          <>
            <li className="mt-2 px-4 pt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
              DayZ Expansion
            </li>
            <SidebarItem
              to="/app/mods/expansion"
              icon={Layers}
              label="Overview"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/map"
              icon={MapIcon}
              label="Map editor"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/market"
              icon={Store}
              label="Market"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/traders"
              icon={Building2}
              label="Traders"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/quests"
              icon={ScrollText}
              label="Quests"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/quest-graph"
              icon={ScrollText}
              label="Quest graph"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/quest-npcs"
              icon={UsersRound}
              label="Quest NPCs"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/objectives"
              icon={Boxes}
              label="Objectives"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/player-spawn-gear"
              icon={ShirtIcon}
              label="Player spawn gear"
              depth="menu"
            />
            <SidebarItem
              to="/app/mods/expansion/loadouts"
              icon={FileText}
              label="Loadouts"
              depth="menu"
            />
          </>
        ) : null}
      </ul>
    </section>
  );
}
