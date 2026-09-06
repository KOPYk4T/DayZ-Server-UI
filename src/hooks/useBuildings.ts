import { useQuery } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  BuildingPlacementsSnapshot,
  BuildingsSnapshot,
} from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["buildings", id, "snapshot"] as const,
  placements: (id: string) => ["buildings", id, "placements"] as const,
};

export function useBuildingsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<BuildingsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["buildings", "__none__"],
    queryFn: () => tauri.buildingsGet(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

/** Separate query for the placement list — only fetched when the
 *  map layer is enabled, because it's large (~11k rows for vanilla
 *  Chernarus) and parse + IPC adds a noticeable delay. */
export function useBuildingPlacementsSnapshot(enabled: boolean) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<BuildingPlacementsSnapshot>({
    queryKey: id ? KEY.placements(id) : ["buildings", "__none__", "placements"],
    queryFn: () => tauri.buildingsPlacementsGet(id!),
    enabled: !!id && enabled,
    staleTime: 60_000,
  });
}
