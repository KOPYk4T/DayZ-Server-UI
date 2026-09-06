import {
  Boxes,
  FileCode,
  FolderTree,
  HardDrive,
  Library,
  Package,
  Package2,
  Palette,
} from "lucide-react";

import { SidebarItem } from "@/components/layout/Sidebar";

/**
 * "Server Modpack" — the pack-your-own-mod workspace. Groups the
 * reskinner, the external-PBO collector, and the config.cpp class
 * authoring view. All three feed the same PBO the build pipeline
 * produces.
 */
export function ReskinSidebarSection() {
  return (
    <section className="mb-5">
      <div className="mb-1 flex items-center gap-1.5 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground/90">
        <Package2 className="h-3.5 w-3.5 opacity-80" />
        <span>Server Modpack</span>
      </div>
      <ul className="space-y-0.5">
        <SidebarItem
          to="/app/reskin/library"
          icon={Library}
          label="Overview &amp; build"
          depth="menu"
        />
        <SidebarItem
          to="/app/reskin/wizard"
          icon={Palette}
          label="New reskin"
          depth="menu"
        />
        <SidebarItem
          to="/app/reskin/pbos"
          icon={Package}
          label="External PBOs"
          depth="menu"
        />
        <SidebarItem
          to="/app/reskin/mod-sources"
          icon={FolderTree}
          label="Mod sources"
          depth="menu"
        />
        <SidebarItem
          to="/app/reskin/config"
          icon={FileCode}
          label="Config classes"
          depth="menu"
        />
        <SidebarItem
          to="/app/reskin/classes"
          icon={Boxes}
          label="Vanilla classes"
          depth="menu"
        />
        <SidebarItem
          to="/app/reskin"
          icon={HardDrive}
          label="Setup"
          depth="menu"
        />
      </ul>
    </section>
  );
}
