import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  CfgEnvironment,
  TerritoriesSnapshot,
  TerritoryBinding,
  TerritoryFile,
} from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["territories", id, "snapshot"] as const,
};

export function useTerritoriesSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<TerritoriesSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["territories", "__none__"],
    queryFn: () => tauri.territoriesList(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useTerritoryFileUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (args: { filename: string; data: TerritoryFile }) => {
      if (!active) throw new Error("no active profile");
      return tauri.territoriesUpdate(active.id, args.filename, args.data);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useCfgEnvironmentUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (data: CfgEnvironment) => {
      if (!active) throw new Error("no active profile");
      return tauri.cfgenvironmentUpdate(active.id, data);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useTerritoriesAddAnimal() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (args: { filename: string; binding: TerritoryBinding }) => {
      if (!active) throw new Error("no active profile");
      return tauri.territoriesAddAnimal(active.id, args.filename, args.binding);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useTerritoriesRemoveAnimal() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (filename: string) => {
      if (!active) throw new Error("no active profile");
      return tauri.territoriesRemoveAnimal(active.id, filename);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}
