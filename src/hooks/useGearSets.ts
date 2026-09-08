import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  GearSetsSnapshot,
  GenerateFromInitCResult,
  InitCScan,
} from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["gear-sets", id, "snapshot"] as const,
  initCScan: (id: string) => ["gear-sets", id, "init-c-scan"] as const,
};

export function useGearSetsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<GearSetsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["gear-sets", "__none__"],
    queryFn: () => tauri.gearSetsGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useInitCScan(enabled: boolean) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<InitCScan>({
    queryKey: id ? KEY.initCScan(id) : ["gear-sets", "__none__", "init-c"],
    queryFn: () => tauri.gearSetsScanInitC(id!),
    enabled: !!id && enabled,
    staleTime: 10_000,
  });
}

export function useGenerateGearSetsFromInitC() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation<GenerateFromInitCResult, unknown, void>({
    mutationFn: () => {
      if (!active) throw new Error("no active profile");
      return tauri.gearSetsGenerateFromInitC(active.id);
    },
    onSuccess: () => {
      if (active) {
        qc.invalidateQueries({ queryKey: KEY.snapshot(active.id) });
      }
    },
  });
}

export function useGearSetsUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (data: import("@/types/ipc").PlayerSpawnGear) => {
      if (!active) throw new Error("no active profile");
      return tauri.gearSetsUpdate(active.id, data);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useGearSetsUpdateKits() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (kits: import("@/types/ipc").SpawnKit[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.gearSetsUpdateKits(active.id, kits);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}
