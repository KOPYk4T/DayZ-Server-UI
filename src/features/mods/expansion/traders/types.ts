/**
 * DayZ-Expansion trader shape — one JSON file per NPC trader under
 * `profiles/ExpansionMod/Traders/`. Each entry in `Categories`
 * references a Market category by filename stem (the part before
 * `.json`), optionally with a `:N` tier suffix that Expansion
 * interprets as a per-category reputation/class filter — see the
 * [Market wiki page](https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/).
 *
 * `Items` is a classname → integer map for extras the trader
 * stocks that aren't part of a market category (usually 0 = hidden
 * on price board, 1 = shown).
 */

export interface Trader {
  m_Version: number;
  DisplayName: string;
  MinRequiredReputation: number;
  MaxRequiredReputation: number;
  /** Faction gate. Empty string = any faction. */
  RequiredFaction: string;
  /** Quest ID that must be completed before the trader is
   *  accessible. -1 = no gate. Cross-references
   *  `profiles/ExpansionMod/Quests/Quests/Quest_<ID>.json`. */
  RequiredCompletedQuestID: number;
  TraderIcon: string;
  Currencies: string[];
  DisplayCurrencyValue: 0 | 1;
  DisplayCurrencyName: string;
  UseCategoryOrder: 0 | 1;
  /** Category filename stems (no `.json`), optionally with a `:N`
   *  tier suffix. E.g. `"Helicopters"`, `"Vehicle_Parts:3"`. */
  Categories: string[];
  /** Per-classname extra priority. 0 hides from the price board,
   *  1 shows it. */
  Items: Record<string, number>;
  [extra: string]: unknown;
}

/** Split a Categories entry into name + optional tier suffix. */
export function splitCategoryRef(raw: string): {
  name: string;
  tier: number | null;
} {
  const idx = raw.indexOf(":");
  if (idx < 0) return { name: raw, tier: null };
  const name = raw.slice(0, idx);
  const tier = Number(raw.slice(idx + 1));
  return { name, tier: Number.isFinite(tier) ? tier : null };
}

export function joinCategoryRef(name: string, tier: number | null): string {
  return tier == null ? name : `${name}:${tier}`;
}

export const DEFAULT_TRADER: Trader = {
  m_Version: 13,
  DisplayName: "",
  MinRequiredReputation: 0,
  MaxRequiredReputation: 2147483647,
  RequiredFaction: "",
  RequiredCompletedQuestID: -1,
  TraderIcon: "Trader",
  Currencies: ["expansionbanknotehryvnia"],
  DisplayCurrencyValue: 1,
  DisplayCurrencyName: "",
  UseCategoryOrder: 0,
  Categories: [],
  Items: {},
};
