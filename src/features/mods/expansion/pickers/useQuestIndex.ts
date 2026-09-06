import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import { useModsScan } from "@/hooks/useMods";
import type { ExpansionInventory } from "@/types/ipc";

export interface QuestIndexEntry {
  id: number;
  title: string;
  path: string;
}

/**
 * Builds an index of all known quest definitions across the
 * workspace: `{ id, title, path }` per entry. Powers `QuestPicker`
 * so every quest-ID field resolves to a friendly title on display
 * and offers autocomplete on input.
 *
 * Reads from `<ExpansionMod>/Quests/Quests/*.json` — the same
 * folder `QuestsPage` loads. Parallel fetch per file with a
 * 10s stale window; cheap on the 50-100-quest tier, inexpensive
 * even at 500.
 */
export function useQuestIndex(): {
  entries: QuestIndexEntry[];
  byId: Map<number, QuestIndexEntry>;
  isLoading: boolean;
} {
  const scan = useModsScan();
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;

  const questsDir = useMemo(() => {
    const inv = scan.data?.expansion as ExpansionInventory | undefined;
    const questsRoot =
      inv?.dataFolders.find((d) => d.name === "Quests")?.relativePath ?? null;
    return questsRoot ? `${questsRoot}/Quests` : null;
  }, [scan.data]);

  const query = useQuery<QuestIndexEntry[]>({
    queryKey:
      id && questsDir ? ["expansion-quest-index", id, questsDir] : ["none"],
    queryFn: async () => {
      if (!id || !questsDir) return [];
      const listing = await tauri.expansionListDir(id, questsDir);
      const files = listing.entries.filter(
        (e) => !e.isDir && e.extension === "json",
      );
      const entries: QuestIndexEntry[] = [];
      await Promise.all(
        files.map(async (f) => {
          try {
            const raw = await tauri.expansionSettingsRead(id, f.relativePath);
            const data = JSON.parse(raw) as {
              ID?: number;
              Title?: string;
            };
            if (typeof data.ID === "number") {
              entries.push({
                id: data.ID,
                title:
                  data.Title?.trim() ||
                  f.name.replace(/\.json$/i, ""),
                path: f.relativePath,
              });
            }
          } catch {
            /* malformed file — skip */
          }
        }),
      );
      entries.sort((a, b) => a.id - b.id);
      return entries;
    },
    enabled: !!(id && questsDir),
    staleTime: 10_000,
  });

  const entries = query.data ?? [];
  const byId = new Map<number, QuestIndexEntry>(
    entries.map((e) => [e.id, e]),
  );
  return { entries, byId, isLoading: query.isLoading };
}
