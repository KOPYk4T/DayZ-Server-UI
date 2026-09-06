import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { ServerCfg, ServerCfgSnapshot } from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["server-cfg", id, "snapshot"] as const,
};

export function useServerCfgSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<ServerCfgSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["server-cfg", "__none__"],
    queryFn: () => tauri.serverCfgGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useServerCfgUpdate() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (data: ServerCfg) => {
      if (!active) throw new Error("no active profile");
      return tauri.serverCfgUpdate(active.id, data);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}
