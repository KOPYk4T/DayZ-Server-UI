import { ReskinClassesPage } from "@/features/reskin/ReskinClassesPage";
import { ReskinConfigClassesPage } from "@/features/reskin/ReskinConfigClassesPage";
import { ReskinEnvironmentPage } from "@/features/reskin/ReskinEnvironmentPage";
import { ReskinExternalPbosPage } from "@/features/reskin/ReskinExternalPbosPage";
import { ReskinLibraryPage } from "@/features/reskin/ReskinLibraryPage";
import { ReskinModSourcesPage } from "@/features/reskin/ReskinModSourcesPage";
import { ReskinWizardPage } from "@/features/reskin/ReskinWizardPage";

import { registerAddon } from "./registry";
import { ReskinSidebarSection } from "./ReskinSidebarSection";
import type { AddonRoute } from "./types";

const routes: AddonRoute[] = [
  { path: "reskin", element: <ReskinEnvironmentPage /> },
  { path: "reskin/classes", element: <ReskinClassesPage /> },
  { path: "reskin/library", element: <ReskinLibraryPage /> },
  { path: "reskin/wizard", element: <ReskinWizardPage /> },
  { path: "reskin/pbos", element: <ReskinExternalPbosPage /> },
  { path: "reskin/mod-sources", element: <ReskinModSourcesPage /> },
  { path: "reskin/config", element: <ReskinConfigClassesPage /> },
];

registerAddon({
  // Internal id stays "reskin" to keep backwards-compat with
  // persisted enablement state. User-facing label is "Server
  // Modpack" — set via the sidebar component.
  id: "reskin",
  name: "Server Modpack",
  description:
    "Pack a single server mod from three sources: reskinned vanilla items with custom textures, any external .pbo you drop in, and author-written config.cpp class overrides (e.g. a SuperBear variant with adjusted stats). Generates config.cpp, converts source art to .paa, packs + signs the addon, copies external PBOs alongside, and emits a types.xml for CE import. Requires Bohemia / Mikero tooling in tools/ and a mounted P: drive with unpacked DayZ game data.",
  routes,
  SidebarSection: ReskinSidebarSection,
});
