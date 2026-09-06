import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ExpansionDirListing,
  ExpansionInventory,
} from "@/types/ipc";

import type { MarketCategory } from "./types";
import type { Trader } from "../traders/types";
import { splitCategoryRef } from "../traders/types";

/** List of Market category files (filename stems + paths). */
export function useMarketCategoryList(inv: ExpansionInventory | null | undefined) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const marketPath = inv
    ? inv.dataFolders.find((d) => d.name === "Market")?.relativePath
    : null;
  return useQuery({
    queryKey: id && marketPath ? ["expansion-market-list", id] : ["none"],
    queryFn: () => tauri.expansionListDir(id!, marketPath!),
    enabled: !!(id && marketPath),
    staleTime: 5_000,
  });
}

/** Parsed content of one Market category. */
export function useMarketCategory(relativePath: string | null) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  return useQuery({
    queryKey:
      id && relativePath
        ? ["expansion-market-category", id, relativePath]
        : ["none"],
    queryFn: async () => {
      const raw = await tauri.expansionSettingsRead(id!, relativePath!);
      return { raw, data: JSON.parse(raw) as MarketCategory };
    },
    enabled: !!(id && relativePath),
    staleTime: 0,
  });
}

export function useMarketCategorySave() {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { path: string; data: MarketCategory }) => {
      if (!id) throw new Error("no profile");
      const text = JSON.stringify(args.data, null, 4);
      await tauri.expansionSettingsWrite(id, args.path, text);
    },
    onSuccess: (_r, args) => {
      qc.invalidateQueries({
        queryKey: ["expansion-market-category", id, args.path],
      });
      qc.invalidateQueries({ queryKey: ["expansion-market-list", id] });
    },
  });
}

/**
 * Loads every trader file + indexes which market categories each one
 * references. Used by both the Market editor ("used by N traders")
 * and the Trader editor.
 */
export function useTradersIndex(inv: ExpansionInventory | null | undefined) {
  const active = useProfileStore((s) => s.active);
  const id = active?.id ?? null;
  const tradersPath = inv
    ? inv.dataFolders.find((d) => d.name === "Traders")?.relativePath
    : null;
  return useQuery({
    queryKey:
      id && tradersPath ? ["expansion-traders-index", id] : ["none"],
    queryFn: async () => {
      const listing: ExpansionDirListing = await tauri.expansionListDir(
        id!,
        tradersPath!,
      );
      const files = listing.entries.filter(
        (e) => !e.isDir && e.extension === "json",
      );
      const traders: { path: string; name: string; data: Trader }[] = [];
      await Promise.all(
        files.map(async (f) => {
          try {
            const raw = await tauri.expansionSettingsRead(
              id!,
              f.relativePath,
            );
            const data = JSON.parse(raw) as Trader;
            traders.push({
              path: f.relativePath,
              name: f.name.replace(/\.json$/i, ""),
              data,
            });
          } catch {
            /* silently skip malformed files — the JSON editor can fix them */
          }
        }),
      );
      // Index: categoryName -> [{ trader, tier }]
      const usage = new Map<
        string,
        { traderName: string; tier: number | null }[]
      >();
      for (const t of traders) {
        for (const catRef of t.data.Categories ?? []) {
          const { name, tier } = splitCategoryRef(catRef);
          const key = name.toLowerCase();
          if (!usage.has(key)) usage.set(key, []);
          usage.get(key)!.push({ traderName: t.name, tier });
        }
      }
      return { traders, usage };
    },
    enabled: !!(id && tradersPath),
    staleTime: 5_000,
  });
}
