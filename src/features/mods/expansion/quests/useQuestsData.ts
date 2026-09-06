import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { ExpansionInventory } from "@/types/ipc";

import type { Quest, QuestNPC } from "./types";

function findFolder(
  inv: ExpansionInventory | null | undefined,
  name: string,
): string | null {
  return inv?.dataFolders.find((d) => d.name === name)?.relativePath ?? null;
}

export function useQuestsFolder(inv: ExpansionInventory | null | undefined) {
  // Quests/ is a data folder; Quests/Quests/ is the actual quest
  // files. We surface both to the UI.
  const questsRoot = findFolder(inv, "Quests");
  return {
    root: questsRoot,
    questsDir: questsRoot ? `${questsRoot}/Quests` : null,
    npcsDir: questsRoot ? `${questsRoot}/NPCs` : null,
    objectivesDir: questsRoot ? `${questsRoot}/Objectives` : null,
  };
}

export function useQuestList(questsDir: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery({
    queryKey: id && questsDir ? ["expansion-quest-list", id] : ["none"],
    queryFn: () => tauri.expansionListDir(id!, questsDir!),
    enabled: !!(id && questsDir),
    staleTime: 5_000,
  });
}

export function useQuest(path: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery({
    queryKey: id && path ? ["expansion-quest", id, path] : ["none"],
    queryFn: async () => {
      const raw = await tauri.expansionSettingsRead(id!, path!);
      return JSON.parse(raw) as Quest;
    },
    enabled: !!(id && path),
    staleTime: 0,
  });
}

export function useQuestSave() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { path: string; data: Quest }) => {
      if (!id) throw new Error("no profile");
      await tauri.expansionSettingsWrite(
        id,
        args.path,
        JSON.stringify(args.data, null, 4),
      );
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["expansion-quest", id, args.path] });
      qc.invalidateQueries({ queryKey: ["expansion-quest-list", id] });
    },
  });
}

export function useNpcList(npcsDir: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery({
    queryKey: id && npcsDir ? ["expansion-npc-list", id] : ["none"],
    queryFn: () => tauri.expansionListDir(id!, npcsDir!),
    enabled: !!(id && npcsDir),
    staleTime: 5_000,
  });
}

export function useNpc(path: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery({
    queryKey: id && path ? ["expansion-npc", id, path] : ["none"],
    queryFn: async () => {
      const raw = await tauri.expansionSettingsRead(id!, path!);
      return JSON.parse(raw) as QuestNPC;
    },
    enabled: !!(id && path),
    staleTime: 0,
  });
}

export function useNpcSave() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { path: string; data: QuestNPC }) => {
      if (!id) throw new Error("no profile");
      await tauri.expansionSettingsWrite(
        id,
        args.path,
        JSON.stringify(args.data, null, 4),
      );
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({ queryKey: ["expansion-npc", id, args.path] });
      qc.invalidateQueries({ queryKey: ["expansion-npc-list", id] });
    },
  });
}

/** Index of all NPCs by ID so quest editors can resolve QuestGiver /
 *  QuestTurnIn references to names. */
export function useNpcIndex(npcsDir: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery({
    queryKey: id && npcsDir ? ["expansion-npc-index", id] : ["none"],
    queryFn: async () => {
      const listing = await tauri.expansionListDir(id!, npcsDir!);
      const files = listing.entries.filter(
        (e) => !e.isDir && e.extension === "json",
      );
      const byId = new Map<number, { name: string; path: string }>();
      await Promise.all(
        files.map(async (f) => {
          try {
            const raw = await tauri.expansionSettingsRead(
              id!,
              f.relativePath,
            );
            const data = JSON.parse(raw) as QuestNPC;
            byId.set(data.ID, {
              name: data.NPCName || `NPC ${data.ID}`,
              path: f.relativePath,
            });
          } catch {
            /* malformed file — skip */
          }
        }),
      );
      return byId;
    },
    enabled: !!(id && npcsDir),
    staleTime: 10_000,
  });
}
