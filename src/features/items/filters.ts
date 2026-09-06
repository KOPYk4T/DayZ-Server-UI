import type { ItemType } from "@/types/ipc";

export interface ItemFilters {
  search: string;
  sources: { vanilla: boolean; mod: boolean; custom: boolean };
  category: string | null; // null == any
  usage: string | null;
  value: string | null;
  tag: string | null;
  showZeroNominal: boolean;
  showStackables: "any" | "only" | "exclude";
}

export const DEFAULT_FILTERS: ItemFilters = {
  search: "",
  sources: { vanilla: true, mod: true, custom: true },
  category: null,
  usage: null,
  value: null,
  tag: null,
  showZeroNominal: true,
  showStackables: "any",
};

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
    if (f.category && it.category !== f.category) return false;
    if (f.usage && !it.usage.includes(f.usage)) return false;
    if (f.value && !it.value.includes(f.value)) return false;
    if (f.tag && !it.tags.includes(f.tag)) return false;
    if (!f.showZeroNominal && it.nominal === 0) return false;
    if (f.showStackables === "only") {
      if (it.quantmin < 0 && it.quantmax < 0) return false;
    } else if (f.showStackables === "exclude") {
      if (it.quantmin >= 0 || it.quantmax >= 0) return false;
    }
    return true;
  });
}
