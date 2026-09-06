import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { ItemType, ItemsSnapshot } from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["items", id, "snapshot"] as const,
  raw: (id: string, name: string) => ["items", id, "raw", name] as const,
};

export function useItemsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<ItemsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["items", "__none__"],
    queryFn: () => tauri.itemsList(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useItemsUpsert() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (items: ItemType[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.itemsUpsert(active.id, items);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useItemsDelete() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (names: string[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.itemsDelete(active.id, names);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useItemsDisable() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (names: string[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.itemsDisable(active.id, names);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useItemRawXml(name: string | null) {
  const active = useProfileStore((s) => s.active);
  return useQuery<string>({
    queryKey:
      active && name
        ? KEY.raw(active.id, name)
        : ["items", "__none__", "raw"],
    queryFn: () => tauri.itemsRawXml(active!.id, name!),
    enabled: !!(active && name),
  });
}

export function useSerializePreview() {
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (items: ItemType[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.itemsSerializePreview(active.id, items);
    },
  });
}
