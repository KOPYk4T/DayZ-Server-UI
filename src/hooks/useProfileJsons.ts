import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ProfileJsonCatalog,
  ProfileJsonOverrideAction,
} from "@/types/ipc";

const KEY = {
  catalog: (id: string) => ["profile-jsons", id, "catalog"] as const,
  file: (id: string, path: string) =>
    ["profile-jsons", id, "file", path] as const,
};

export function useProfileJsonsCatalog() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<ProfileJsonCatalog>({
    queryKey: id ? KEY.catalog(id) : ["profile-jsons", "__none__"],
    queryFn: () => tauri.profileJsonsScan(id!),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useProfileJsonsOverride() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (args: {
      relativePath: string;
      action: ProfileJsonOverrideAction;
    }) => {
      if (!active) throw new Error("no active profile");
      return tauri.profileJsonsSetOverride(
        active.id,
        args.relativePath,
        args.action,
      );
    },
    onSuccess: (catalog) => {
      if (active) qc.setQueryData(KEY.catalog(active.id), catalog);
    },
  });
}

export function useProfileJsonsReset() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: () => {
      if (!active) throw new Error("no active profile");
      return tauri.profileJsonsResetOverrides(active.id);
    },
    onSuccess: (catalog) => {
      if (active) qc.setQueryData(KEY.catalog(active.id), catalog);
    },
  });
}

export function useProfileJsonFile(relativePath: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<string>({
    queryKey:
      id && relativePath
        ? KEY.file(id, relativePath)
        : ["profile-jsons", "__none__", "file"],
    queryFn: () => tauri.profileJsonsRead(id!, relativePath!),
    enabled: !!(id && relativePath),
    staleTime: 0,
  });
}

export function useProfileJsonsWrite() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (args: { relativePath: string; content: string }) => {
      if (!active) throw new Error("no active profile");
      return tauri.profileJsonsWrite(
        active.id,
        args.relativePath,
        args.content,
      );
    },
    onSuccess: (_void, args) => {
      if (!active) return;
      qc.invalidateQueries({
        queryKey: KEY.file(active.id, args.relativePath),
      });
      qc.invalidateQueries({ queryKey: KEY.catalog(active.id) });
    },
  });
}

export function useProfileJsonsDelete() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (relativePath: string) => {
      if (!active) throw new Error("no active profile");
      return tauri.profileJsonsDelete(active.id, relativePath);
    },
    onSuccess: (catalog, relativePath) => {
      if (!active) return;
      qc.setQueryData(KEY.catalog(active.id), catalog);
      qc.removeQueries({ queryKey: KEY.file(active.id, relativePath) });
    },
  });
}
