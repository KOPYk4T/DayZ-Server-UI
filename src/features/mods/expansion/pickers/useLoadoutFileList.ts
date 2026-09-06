import { useQuery } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";

/**
 * Returns the list of loadout file stems under
 * `profiles/<profiles_relative>/ExpansionMod/Loadouts/`.
 *
 * Shared by `LoadoutPicker` so every autocomplete across the app
 * reads from the same source of truth — keeps stale lists from
 * diverging between the Quests NPC form, trader `.map` gear
 * keywords, and AI-patrol loadouts.
 */
export function useLoadoutFileList(): string[] {
  const active = useProfileStore((s) => s.active);
  const profilesRel = active?.paths.profilesRelative.replace(/\/$/, "") ?? null;
  const profileId = active?.id ?? null;
  const query = useQuery<string[]>({
    queryKey: profilesRel
      ? ["expansion-ai-loadout-list", profileId, profilesRel]
      : ["none"],
    queryFn: async () => {
      if (!profileId || !profilesRel) return [];
      try {
        const listing = await tauri.expansionListDir(
          profileId,
          `${profilesRel}/ExpansionMod/Loadouts`,
        );
        return listing.entries
          .filter((e) => !e.isDir && e.extension === "json")
          .map((e) => e.name.replace(/\.json$/i, ""))
          .sort((a, b) => a.localeCompare(b));
      } catch {
        // Folder doesn't exist yet (no loadouts authored, or
        // Expansion not installed) — silent empty list.
        return [];
      }
    },
    enabled: !!(profileId && profilesRel),
    staleTime: 30_000,
  });
  return query.data ?? [];
}
