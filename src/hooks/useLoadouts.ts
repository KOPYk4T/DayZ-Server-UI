import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  LoadoutsSnapshot,
  RandomPreset,
  SpawnableType,
} from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["loadouts", id, "snapshot"] as const,
  spawnableRaw: (id: string, name: string) =>
    ["loadouts", id, "spawnable-raw", name] as const,
  presetRaw: (id: string, name: string) =>
    ["loadouts", id, "preset-raw", name] as const,
};

export function useLoadoutsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<LoadoutsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["loadouts", "__none__"],
    queryFn: () => tauri.loadoutsList(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useSpawnablesUpsert() {
  const active = useProfileStore((s) => s.active);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (spawnables: SpawnableType[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.spawnablesUpsert(active.id, spawnables);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useSpawnablesDelete() {
  const active = useProfileStore((s) => s.active);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.spawnablesDelete(active.id, names);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useSpawnableRawXml(name: string | null) {
  const active = useProfileStore((s) => s.active);
  return useQuery<string>({
    queryKey:
      active && name
        ? KEY.spawnableRaw(active.id, name)
        : ["loadouts", "__none__", "spawnable-raw"],
    queryFn: () => tauri.spawnablesRawXml(active!.id, name!),
    enabled: !!(active && name),
  });
}

export function usePresetsUpsert() {
  const active = useProfileStore((s) => s.active);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (presets: RandomPreset[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.presetsUpsert(active.id, presets);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function usePresetsDelete() {
  const active = useProfileStore((s) => s.active);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.presetsDelete(active.id, names);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function usePresetRawXml(name: string | null) {
  const active = useProfileStore((s) => s.active);
  return useQuery<string>({
    queryKey:
      active && name
        ? KEY.presetRaw(active.id, name)
        : ["loadouts", "__none__", "preset-raw"],
    queryFn: () => tauri.presetsRawXml(active!.id, name!),
    enabled: !!(active && name),
  });
}
