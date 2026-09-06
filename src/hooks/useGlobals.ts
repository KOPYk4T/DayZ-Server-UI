import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { Globals, GlobalsSnapshot } from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["globals", id, "snapshot"] as const,
};

export function useGlobalsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<GlobalsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["globals", "__none__"],
    queryFn: () => tauri.globalsGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useGlobalsUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (data: Globals) => {
      if (!active) throw new Error("no active profile");
      return tauri.globalsUpdate(active.id, data);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}
