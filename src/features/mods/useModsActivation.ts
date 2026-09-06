import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ModActivationState,
  ModsActivationStore,
  UserAddedModInput,
} from "@/types/ipc";

/** React Query wrapper around the per-profile activation store.
 *  Single source of truth for "is mod X active for the current
 *  profile". */
export function useModsActivation() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery<ModsActivationStore>({
    queryKey: id ? ["mods-activation", id] : ["none"],
    queryFn: () => tauri.modsActivationGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

/** Read-only convenience: returns `"on"` for anything the store
 *  doesn't know, matching the backend default. */
export function useModActivationState(modId: string): ModActivationState {
  const q = useModsActivation();
  return q.data?.activation[modId] ?? "on";
}

export function useSetModActivation() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modId,
      on,
    }: {
      modId: string;
      on: boolean;
    }) => {
      if (!id) throw new Error("no profile");
      return tauri.modsActivationSet(id, modId, on);
    },
    onSuccess: (store) => {
      qc.setQueryData(["mods-activation", id], store);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAddUserMod() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (spec: UserAddedModInput) => {
      if (!id) throw new Error("no profile");
      return tauri.modsActivationAddUserMod(id, spec);
    },
    onSuccess: (store) => {
      qc.setQueryData(["mods-activation", id], store);
      toast.success("mod added");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useRemoveUserMod() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modId: string) => {
      if (!id) throw new Error("no profile");
      return tauri.modsActivationRemoveUserMod(id, modId);
    },
    onSuccess: (store) => {
      qc.setQueryData(["mods-activation", id], store);
      toast.success("mod removed");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
