import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  CeImportEntry,
  ImportRequest,
  RemoveImportRequest,
} from "@/types/ipc";

const KEY = {
  list: (id: string) => ["ce-imports", id] as const,
};

export function useCeImportScan() {
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (sourceDir: string) => {
      if (!active) throw new Error("no active profile");
      return tauri.ceImportScan(active.id, sourceDir);
    },
  });
}

export function useCeImportApply() {
  const active = useProfileStore((s) => s.active);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: ImportRequest) => {
      if (!active) throw new Error("no active profile");
      return tauri.ceImportApply(active.id, request);
    },
    onSuccess: () => {
      // The newly-registered CE files will change the Items snapshot on
      // next load; invalidate so the Items page refetches.
      if (active) {
        qc.invalidateQueries({ queryKey: ["items", active.id, "snapshot"] });
        qc.invalidateQueries({ queryKey: ["ce-imports", active.id] });
        qc.invalidateQueries({ queryKey: ["profiles", active.id, "status"] });
      }
    },
  });
}

export function useCeImportsList(enabled = true) {
  const active = useProfileStore((s) => s.active);
  return useQuery<CeImportEntry[]>({
    queryKey: active ? KEY.list(active.id) : ["ce-imports", "__none__"],
    queryFn: () => tauri.ceImportsList(active!.id),
    enabled: enabled && !!active,
    staleTime: 15_000,
  });
}

export function useCeImportsRemove() {
  const active = useProfileStore((s) => s.active);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: RemoveImportRequest) => {
      if (!active) throw new Error("no active profile");
      return tauri.ceImportsRemove(active.id, request);
    },
    onSuccess: () => {
      if (active) {
        qc.invalidateQueries({ queryKey: KEY.list(active.id) });
        qc.invalidateQueries({ queryKey: ["items", active.id, "snapshot"] });
        qc.invalidateQueries({ queryKey: ["profiles", active.id, "status"] });
      }
    },
  });
}
