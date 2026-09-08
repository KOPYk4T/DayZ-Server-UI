import type { ItemType } from "@/types/ipc";

/** How several flags inside one CE dimension combine. */
export type FlagMatch = "any" | "all";

export interface ItemFilters {
  search: string;
  sources: { vanilla: boolean; mod: boolean; custom: boolean };
  /** Empty = any category. An item has at most one, so this is always OR. */
  categories: string[];
  usages: string[];
  values: string[];
  tags: string[];
  usageMatch: FlagMatch;
  valueMatch: FlagMatch;
  tagMatch: FlagMatch;
  showZeroNominal: boolean;
  showStackables: "any" | "only" | "exclude";
}

export const DEFAULT_FILTERS: ItemFilters = {
  search: "",
  sources: { vanilla: true, mod: true, custom: true },
  categories: [],
  usages: [],
  values: [],
  tags: [],
  usageMatch: "any",
  valueMatch: "any",
  tagMatch: "any",
  showZeroNominal: true,
  showStackables: "any",
};

export function toggleFlag(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((x) => x !== name) : [...list, name];
}

/**
 * CE matching, mirrored for the Types searcher:
 *   - Several flags on the *same* dimension (usage / value / tag) are OR
 *     on the item — Town + Village means it can spawn in either.
 *   - Distinct dimensions AND together — Military + Tier4 only matches
 *     items that carry both. That is how a loot point is chosen.
 * `all` is the stricter search: the item must list every selected flag.
 */
export function matchesFlags(
  have: readonly string[],
  selected: readonly string[],
  mode: FlagMatch,
): boolean {
  if (selected.length === 0) return true;
  if (mode === "all") return selected.every((s) => have.includes(s));
  return selected.some((s) => have.includes(s));
}

/** `?usage=Town,Village` or `?usage=Town&usage=Village`. */
export function readListParam(
  params: URLSearchParams,
  key: string,
): string[] | undefined {
  const raw = params.getAll(key);
  if (raw.length === 0) return undefined;
  const list = raw.flatMap((s) =>
    s.split(",").map((x) => x.trim()).filter(Boolean),
  );
  return list.length > 0 ? list : undefined;
}

export function readMatchParam(
  params: URLSearchParams,
  key: string,
): FlagMatch | undefined {
  const raw = params.get(key);
  if (raw === "any" || raw === "all") return raw;
  return undefined;
}

export function applyFilters(items: ItemType[], f: ItemFilters): ItemType[] {
  const needle = f.search.trim().toLowerCase();
  return items.filter((it) => {
    if (!f.sources[it.source]) return false;
    if (needle) {
      if (
        !it.name.toLowerCase().includes(needle) &&
        !(it.category ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }
    }
    if (f.categories.length > 0) {
      if (!it.category || !f.categories.includes(it.category)) return false;
    }
    if (!matchesFlags(it.usage, f.usages, f.usageMatch)) return false;
    if (!matchesFlags(it.value, f.values, f.valueMatch)) return false;
    if (!matchesFlags(it.tags, f.tags, f.tagMatch)) return false;
    if (!f.showZeroNominal && it.nominal === 0) return false;
    if (f.showStackables === "only") {
      if (it.quantmin < 0 && it.quantmax < 0) return false;
    } else if (f.showStackables === "exclude") {
      if (it.quantmin >= 0 || it.quantmax >= 0) return false;
    }
    return true;
  });
}
