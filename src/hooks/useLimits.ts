import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { LimitsDefinition, LimitsSnapshot } from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["limits", id, "snapshot"] as const,
};

export function useLimitsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<LimitsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["limits", "__none__"],
    queryFn: () => tauri.limitsGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useLimitsUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (definition: LimitsDefinition) => {
      if (!active) throw new Error("no active profile");
      return tauri.limitsUpdate(active.id, definition);
    },
    onSuccess: (snap) => {
      if (active) {
        qc.setQueryData(KEY.snapshot(active.id), snap);
        // Items validation also re-runs with the new limits; invalidate.
        qc.invalidateQueries({ queryKey: ["items", active.id, "snapshot"] });
      }
    },
  });
}
