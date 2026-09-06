import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  DynamicEvent,
  EventSpawnGroup,
  EventsSnapshot,
} from "@/types/ipc";

const KEY = {
  snapshot: (id: string) => ["events", id, "snapshot"] as const,
  raw: (id: string, name: string) => ["events", id, "raw", name] as const,
};

export function useEventsSnapshot() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<EventsSnapshot>({
    queryKey: id ? KEY.snapshot(id) : ["events", "__none__"],
    queryFn: () => tauri.eventsList(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useEventsUpsert() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (input: {
      events: DynamicEvent[];
      spawns: EventSpawnGroup[];
    }) => {
      if (!active) throw new Error("no active profile");
      return tauri.eventsUpsert(active.id, input.events, input.spawns);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useEventsDelete() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  return useMutation({
    mutationFn: (names: string[]) => {
      if (!active) throw new Error("no active profile");
      return tauri.eventsDelete(active.id, names);
    },
    onSuccess: (snap) => {
      if (active) qc.setQueryData(KEY.snapshot(active.id), snap);
    },
  });
}

export function useEventRawXml(name: string | null) {
  const active = useProfileStore((s) => s.active);
  return useQuery<string>({
    queryKey:
      active && name
        ? KEY.raw(active.id, name)
        : ["events", "__none__", "raw"],
    queryFn: () => tauri.eventsRawXml(active!.id, name!),
    enabled: !!(active && name),
  });
}
