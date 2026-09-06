import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { PlayerSpawnPoints, PlayerSpawnsSnapshot } from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["player-spawns", id, "snapshot"] as const,
};

export function usePlayerSpawnsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<PlayerSpawnsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["player-spawns", "__none__"],
    queryFn: () => tauri.playerSpawnsGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function usePlayerSpawnsUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (data: PlayerSpawnPoints) => {
      if (!active) throw new Error("no active profile");
      return tauri.playerSpawnsUpdate(active.id, data);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}
