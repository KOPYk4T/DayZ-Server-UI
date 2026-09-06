import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";

import { OBJECTIVE_TYPE_FOLDER } from "../types";
import {
  DEFAULT_OBJECTIVES,
  OBJECTIVE_FILENAME_PREFIX,
  parseObjective,
  serializeObjective,
  type Objective,
} from "./types";

export interface ObjectiveEntry {
  /** Workspace-relative path — the key react-query uses so per-file
   *  saves don't invalidate the whole index. */
  relativePath: string;
  /** `Objective_T_4.json`. */
  fileName: string;
  /** Parent folder name = objective type folder (`Travel`,
   *  `AIPatrol`, …). */
  typeFolder: string;
  /** Inferred from the folder name; null for folders outside the
   *  known set (mod forks could add new ones). */
  objectiveType: number | null;
  /** Surfaced once the file is read. Null while loading. */
  id: number | null;
  title: string | null;
}

function objectivesRoot(
  profilesRel: string | null | undefined,
): string | null {
  if (!profilesRel) return null;
  return `${profilesRel.replace(/\/$/, "")}/ExpansionMod/Quests/Objectives`;
}

/** List every objective file across every type folder. Walks each
 *  known subfolder in parallel so the operator sees the full index
 *  regardless of which types their server uses. */
export function useObjectivesIndex(): {
  entries: ObjectiveEntry[];
  isLoading: boolean;
} {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const profilesRel = active?.paths.profilesRelative ?? null;
  const root = objectivesRoot(profilesRel);

  const query = useQuery<ObjectiveEntry[]>({
    queryKey:
      profileId && root
        ? ["expansion-objectives-index", profileId, root]
        : ["none"],
    queryFn: async () => {
      if (!profileId || !root) return [];
      const out: ObjectiveEntry[] = [];
      for (const [typeStr, folder] of Object.entries(
        OBJECTIVE_TYPE_FOLDER,
      )) {
        const typeNum = Number(typeStr);
        try {
          const listing = await tauri.expansionListDir(
            profileId,
            `${root}/${folder}`,
          );
          for (const e of listing.entries) {
            if (e.isDir) continue;
            if (e.extension !== "json") continue;
            out.push({
              relativePath: e.relativePath,
              fileName: e.name,
              typeFolder: folder,
              objectiveType: typeNum,
              id: null,
              title: null,
            });
          }
        } catch {
          // Folder doesn't exist yet — skip silently; mod servers
          // rarely use all 10 objective types.
        }
      }
      out.sort((a, b) => {
        const bucket = a.typeFolder.localeCompare(b.typeFolder);
        return bucket !== 0 ? bucket : a.fileName.localeCompare(b.fileName);
      });
      return out;
    },
    enabled: !!(profileId && root),
    staleTime: 10_000,
  });

  return { entries: query.data ?? [], isLoading: query.isLoading };
}

/** Read + parse a single objective file. */
export function useObjective(path: string | null) {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  return useQuery<Objective>({
    queryKey: profileId && path ? ["expansion-objective", profileId, path] : ["none"],
    queryFn: async () => {
      const raw = await tauri.expansionSettingsRead(profileId!, path!);
      return parseObjective(raw);
    },
    enabled: !!(profileId && path),
    staleTime: 0,
  });
}

/** Save an objective back to its file. */
export function useObjectiveSave() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { path: string; data: Objective }) => {
      if (!profileId) throw new Error("no profile");
      await tauri.expansionSettingsWrite(
        profileId,
        args.path,
        serializeObjective(args.data),
      );
    },
    onSuccess: (_r, args) => {
      qc.setQueryData(
        ["expansion-objective", profileId, args.path],
        args.data,
      );
      qc.invalidateQueries({
        queryKey: ["expansion-objectives-index", profileId],
      });
    },
  });
}

/** Create a new objective file of the given type. Filename follows
 *  the shipped `Objective_<prefix>_<ID>.json` convention. */
export function useObjectiveCreate() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const profilesRel = active?.paths.profilesRelative ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { objectiveType: number; id: number }) => {
      const root = objectivesRoot(profilesRel);
      if (!profileId || !root) throw new Error("no profile");
      const folder = OBJECTIVE_TYPE_FOLDER[args.objectiveType];
      if (!folder) {
        throw new Error(`unknown objective type ${args.objectiveType}`);
      }
      const prefix = OBJECTIVE_FILENAME_PREFIX[args.objectiveType] ?? "X";
      const path = `${root}/${folder}/Objective_${prefix}_${args.id}.json`;
      const base = DEFAULT_OBJECTIVES[args.objectiveType];
      if (!base) {
        throw new Error(`no default for type ${args.objectiveType}`);
      }
      const data: Objective = { ...base, ID: args.id };
      await tauri.expansionSettingsWrite(
        profileId,
        path,
        serializeObjective(data),
      );
      return { path, data };
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["expansion-objectives-index", profileId],
      });
    },
  });
}

/** Resolve `{ ObjectiveType, ID }` references in a Quest's
 *  `Objectives[]` array back to the on-disk file. Loads each
 *  referenced file in parallel; any unresolved reference surfaces
 *  as `null`. */
export function useQuestObjectiveResolutions(
  refs: Array<{ ObjectiveType: number; ID: number }>,
): Map<string, { path: string; title: string } | null> {
  const { entries } = useObjectivesIndex();
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;

  // Candidate path per (type, id) — matches filename by ID substring
  // + type folder. The naming convention isn't strictly enforced by
  // Expansion; we fall back to loading the file when necessary to
  // check the actual ID.
  const byTypeAndId: Map<string, ObjectiveEntry[]> = new Map();
  for (const e of entries) {
    if (e.objectiveType === null) continue;
    const key = String(e.objectiveType);
    const bucket = byTypeAndId.get(key) ?? [];
    bucket.push(e);
    byTypeAndId.set(key, bucket);
  }

  // For each reference, find candidate files with a matching
  // filename pattern `*_<ID>.json` in the right type folder.
  const candidates: Array<{
    key: string;
    path: string | null;
  }> = refs.map((r) => {
    const bucket = byTypeAndId.get(String(r.ObjectiveType)) ?? [];
    const match =
      bucket.find((e) => e.fileName.match(new RegExp(`_${r.ID}\\.json$`))) ??
      null;
    return {
      key: `${r.ObjectiveType}:${r.ID}`,
      path: match?.relativePath ?? null,
    };
  });

  const queries = useQueries({
    queries: candidates.map((c) => ({
      queryKey:
        profileId && c.path
          ? ["expansion-objective", profileId, c.path]
          : ["none", c.key],
      queryFn: async () => {
        if (!profileId || !c.path) return null;
        const raw = await tauri.expansionSettingsRead(profileId, c.path);
        return parseObjective(raw);
      },
      enabled: !!(profileId && c.path),
      staleTime: 10_000,
    })),
  });

  const out = new Map<string, { path: string; title: string } | null>();
  candidates.forEach((c, i) => {
    const data = queries[i].data;
    if (!data || !c.path) {
      out.set(c.key, null);
      return;
    }
    out.set(c.key, {
      path: c.path,
      title: data.ObjectiveText || c.path,
    });
  });
  return out;
}
