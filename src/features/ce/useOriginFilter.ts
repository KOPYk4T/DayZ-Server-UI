import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { OriginId, RecordWithOrigin } from "./origin";
import {
  collectFilesForOrigin,
  collectOrigins,
  filterByOrigin,
} from "./origin";

/**
 * Filter state for the origin chip + file drill-down rows. Backed
 * by URL search params so a filtered view survives reload, can be
 * pasted into Discord, and the back button works.
 *
 * URL shape (per-page, namespaced via `paramPrefix` to avoid
 * clashes when multiple lists live on the same page — Loadouts has
 * separate Spawnables and Presets tabs):
 *
 *   ?<prefix>mods=Expansion,vanilla
 *   ?<prefix>file=mods%2FExpansion%2Fmarket_types.xml
 *
 * `mods=` is comma-separated origin ids. `file=` is at most one
 * workspace-relative XML path. Selecting a file when more than one
 * mod is selected is invalid (the UI hides the file row in that
 * case) but the state machine is permissive — extra params just
 * pass through to the filter as-is.
 */
export function useOriginFilter<T extends RecordWithOrigin>({
  records,
  paramPrefix = "",
}: {
  records: ReadonlyArray<T>;
  /** Optional URL-param namespace. Pass e.g. `"sp"` for the
   *  Spawnables tab and `"rp"` for Random Presets so they don't
   *  clobber each other on the same page. Defaults to empty. */
  paramPrefix?: string;
}) {
  const [params, setParams] = useSearchParams();
  const modsKey = `${paramPrefix}mods`;
  const fileKey = `${paramPrefix}file`;

  const selectedOrigins = useMemo<Set<OriginId>>(() => {
    const raw = params.get(modsKey);
    if (!raw) return new Set();
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }, [params, modsKey]);

  const selectedFile = params.get(fileKey);

  // Valid origins recomputed each render so chip counts update as
  // records refetch. Cheap — single pass over the list.
  const origins = useMemo(() => collectOrigins(records), [records]);
  const filesForSelectedOrigin = useMemo(() => {
    // Only show file drill-down when exactly one origin is picked
    // and that origin is a mod (vanilla / custom usually have a
    // single bulk file each, no useful drill-down).
    if (selectedOrigins.size !== 1) return [];
    const [only] = selectedOrigins;
    if (!only.startsWith("mod:")) return [];
    return collectFilesForOrigin(records, only);
  }, [records, selectedOrigins]);

  const filtered = useMemo(
    () => filterByOrigin(records, selectedOrigins, selectedFile),
    [records, selectedOrigins, selectedFile],
  );

  const writeParams = useCallback(
    (mut: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mut(next);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const toggleOrigin = useCallback(
    (id: OriginId) => {
      writeParams((p) => {
        const set = new Set(
          (p.get(modsKey) ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
        if (set.has(id)) set.delete(id);
        else set.add(id);
        if (set.size === 0) p.delete(modsKey);
        else p.set(modsKey, Array.from(set).join(","));
        // Drill-down file is only meaningful when one origin is
        // selected — clear it when the selection changes.
        p.delete(fileKey);
      });
    },
    [writeParams, modsKey, fileKey],
  );

  const setOnlyOrigin = useCallback(
    (id: OriginId | null) => {
      writeParams((p) => {
        if (!id) {
          p.delete(modsKey);
        } else {
          p.set(modsKey, id);
        }
        p.delete(fileKey);
      });
    },
    [writeParams, modsKey, fileKey],
  );

  const setFile = useCallback(
    (file: string | null) => {
      writeParams((p) => {
        if (!file) p.delete(fileKey);
        else p.set(fileKey, file);
      });
    },
    [writeParams, fileKey],
  );

  const clearAll = useCallback(() => {
    writeParams((p) => {
      p.delete(modsKey);
      p.delete(fileKey);
    });
  }, [writeParams, modsKey, fileKey]);

  return {
    /** Records after origin + file filtering. */
    filtered,
    /** All distinct origins with counts (for the chip row). */
    origins,
    /** When exactly one mod origin is selected, distinct files
     *  inside it; otherwise empty. */
    filesForSelectedOrigin,
    selectedOrigins,
    selectedFile,
    toggleOrigin,
    setOnlyOrigin,
    setFile,
    clearAll,
    /** True when at least one filter is active. */
    isFiltered: selectedOrigins.size > 0 || !!selectedFile,
  };
}
