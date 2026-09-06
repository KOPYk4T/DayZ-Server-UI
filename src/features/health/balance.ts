/**
 * Balance lints — computed purely on the frontend from the Items
 * snapshot. Complement the Rust-side schema / cross-ref validators
 * with signals that are about *economy balance* rather than file
 * structure. All emit `domain: "balance"` so Health can render them
 * alongside the other validators without backend plumbing.
 */

import type { Issue, ItemType } from "@/types/ipc";

export const BALANCE_CODES = {
  nominalWithoutUsage: "balance.nominal-without-usage",
  nominalWithoutCountFlags: "balance.nominal-without-count-flags",
  tierWithoutUsage: "balance.tier-without-usage",
} as const;

/** Checks:
 *
 *  1. nominal-without-usage — item has `nominal > 0` but no usage
 *     zones assigned. CE picks spawn locations by usage zone; with
 *     none set the item won't appear via the normal economy loop
 *     (it may still spawn via events / loadouts — hence warning,
 *     not error).
 *
 *  2. nominal-without-count-flags — item has `nominal > 0` but none
 *     of the `count_in_*` flags are on. CE cannot count current
 *     population, so nominal has no effect.
 *
 *  3. tier-without-usage — item has one or more `value` (Tier*)
 *     flags but no usage zone. Tier flags filter by zone, so with
 *     no zone the tier is inert.
 */
export function computeBalanceIssues(items: ItemType[]): Issue[] {
  const out: Issue[] = [];
  items.forEach((it) => {
    const hasUsage = it.usage.length > 0;
    const hasTier = it.value.length > 0;
    const anyCountFlag =
      it.flags.count_in_cargo +
        it.flags.count_in_hoarder +
        it.flags.count_in_map +
        it.flags.count_in_player >
      0;

    if (it.nominal > 0 && !hasUsage) {
      out.push({
        severity: "warning",
        code: BALANCE_CODES.nominalWithoutUsage,
        message: `nominal=${it.nominal} but no usage zone set — CE won't place it on the map.`,
        file: it.file,
        entity: it.name,
      });
    }
    if (it.nominal > 0 && !anyCountFlag) {
      out.push({
        severity: "warning",
        code: BALANCE_CODES.nominalWithoutCountFlags,
        message: `nominal=${it.nominal} but all count_in_* flags are 0 — CE cannot track population.`,
        file: it.file,
        entity: it.name,
      });
    }
    if (hasTier && !hasUsage) {
      out.push({
        severity: "info",
        code: BALANCE_CODES.tierWithoutUsage,
        message: `tier ${it.value.join("/")} is set without a usage zone — the tier filter has nothing to apply to.`,
        file: it.file,
        entity: it.name,
      });
    }
  });
  return out;
}

// ---------- Balance summary stats (Dashboard) ----------

export interface BalanceStats {
  /** Nominal total summed into each usage zone (items in multiple
   *  zones contribute fully to each — intentional: the numbers
   *  represent "nominal targeted at zone X", not a partition). */
  byUsage: { name: string; total: number }[];
  /** Same for value (tier) flags. */
  byTier: { name: string; total: number }[];
  /** Item whose nominal will never materialise as a CE spawn — no
   *  usage zone set. May still spawn via events/loadouts. */
  neverSpawnCount: number;
}

export function computeBalanceStats(items: ItemType[]): BalanceStats {
  const usage = new Map<string, number>();
  const tier = new Map<string, number>();
  let neverSpawnCount = 0;

  items.forEach((it) => {
    if (it.nominal <= 0) return;
    if (it.usage.length === 0) {
      neverSpawnCount++;
    } else {
      it.usage.forEach((u) => {
        usage.set(u, (usage.get(u) ?? 0) + it.nominal);
      });
    }
    it.value.forEach((v) => {
      tier.set(v, (tier.get(v) ?? 0) + it.nominal);
    });
  });

  const sort = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, total]) => ({ name, total }))
      .sort(
        (a, b) => b.total - a.total || a.name.localeCompare(b.name),
      );

  return {
    byUsage: sort(usage),
    byTier: sort(tier),
    neverSpawnCount,
  };
}
