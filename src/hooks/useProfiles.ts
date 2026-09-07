import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import { useUIStore } from "@/stores/uiStore";
import type {
  ProfileDraft,
  ProfileSecrets,
  ServerProfile,
} from "@/types/ipc";

const KEY = {
  all: ["profiles"] as const,
  one: (id: string) => ["profiles", id] as const,
  status: (id: string) => ["profiles", id, "status"] as const,
};

export function useProfileList() {
  return useQuery<ServerProfile[]>({
    queryKey: KEY.all,
    queryFn: tauri.profilesList,
    staleTime: 10_000,
  });
}

export function useProfile(id: string | null) {
  return useQuery<ServerProfile>({
    queryKey: id ? KEY.one(id) : ["profiles", "__none__"],
    queryFn: () => tauri.profilesGet(id!),
    enabled: !!id,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { draft: ProfileDraft; secrets: ProfileSecrets }) =>
      tauri.profilesCreate(input.draft, input.secrets),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: KEY.all });
      qc.invalidateQueries({ queryKey: ["profiles", p.id, "secrets"] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const activeProfile = useProfileStore((s) => s.active);
  const setActive = useProfileStore((s) => s.setActive);
  return useMutation({
    mutationFn: (input: {
      id: string;
      draft: ProfileDraft;
      secrets: ProfileSecrets | null;
    }) => tauri.profilesUpdate(input.id, input.draft, input.secrets),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: KEY.all });
      qc.setQueryData(KEY.one(p.id), p);
      qc.invalidateQueries({ queryKey: ["profiles", p.id, "secrets"] });
      qc.invalidateQueries({ queryKey: KEY.status(p.id) });
      // Keep the in-app "active profile" banner + downstream hooks in
      // sync when the user edits the profile they're currently viewing.
      if (activeProfile?.id === p.id) setActive(p);
    },
  });
}

export function useDuplicateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauri.profilesDuplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.all }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  const setActive = useProfileStore((s) => s.setActive);
  const setActiveId = useUIStore((s) => s.setActiveProfileId);
  const activeId = useUIStore((s) => s.activeProfileId);
  return useMutation({
    mutationFn: (id: string) => tauri.profilesDelete(id),
    onSuccess: (_v, id) => {
      if (activeId === id) {
        setActive(null);
        setActiveId(null);
      }
      qc.invalidateQueries({ queryKey: KEY.all });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => tauri.connectionTest(id),
  });
}

export function useSecretsPresence(id: string | null) {
  return useQuery({
    queryKey: id ? ["profiles", id, "secrets"] : ["profiles", "__none__"],
    queryFn: () => tauri.profilesSecretsPresence(id!),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useTestConnectionDraft() {
  return useMutation({
    mutationFn: (args: {
      draft: ProfileDraft;
      secrets?: ProfileSecrets | null;
      existingId?: string | null;
    }) => tauri.connectionTestDraft(args),
  });
}

export function useWorkspaceStatus(id: string | null) {
  return useQuery({
    queryKey: id ? KEY.status(id) : ["profiles", "__none__", "status"],
    queryFn: () => tauri.syncStatus(id!),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

export function usePull(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!id) throw new Error("no active profile");
      return tauri.syncPull(id);
    },
    onSuccess: () => {
      // A pull replaces the entire workspace tree, so any cached
      // page state (items, events, loadouts, mods scan, buildings,
      // Expansion settings, gear sets, globals, server-cfg, …) is
      // now stale. Invalidate every query so the user lands on
      // fresh data regardless of which page they switch to next.
      qc.invalidateQueries();
    },
  });
}

export function usePush(id: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!id) throw new Error("no active profile");
      return tauri.syncPush(id);
    },
    onSuccess: () => {
      if (id) {
        qc.invalidateQueries({ queryKey: KEY.status(id) });
        qc.invalidateQueries({ queryKey: ["profiles", id, "backups"] });
      }
      qc.invalidateQueries({ queryKey: KEY.all });
    },
  });
}

export function useBackups(id: string | null) {
  return useQuery({
    queryKey: id ? ["profiles", id, "backups"] : ["profiles", "__none__"],
    queryFn: () => tauri.syncBackupsList(id!),
    enabled: !!id,
  });
}

export function useLocalDiff(id: string | null) {
  return useQuery({
    queryKey: id ? ["profiles", id, "local-diff"] : ["profiles", "__none__"],
    queryFn: () => tauri.syncLocalDiff(id!),
    enabled: !!id,
  });
}

export function useWorkspaceLog(id: string | null) {
  return useQuery({
    queryKey: id ? ["profiles", id, "workspace-log"] : ["profiles", "__none__"],
    queryFn: () => tauri.syncWorkspaceLog(id!),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useRemoteDiff() {
  return useMutation({
    mutationFn: (id: string) => tauri.syncDiffAgainstRemote(id),
  });
}
