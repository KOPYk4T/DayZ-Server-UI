import { useQuery } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type { ModsScan } from "@/types/ipc";

const KEY = {
  scan: (id: string) => ["mods", id, "scan"] as const,
};

export function useModsScan() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<ModsScan>({
    queryKey: id ? KEY.scan(id) : ["mods", "__none__"],
    queryFn: () => tauri.modsScan(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}
