/**
 * Expansion trader gear-token shape.
 *
 * Each placement in a `.map` file carries an optional list of
 * comma-separated gear tokens. Three keyword forms plus freeform
 * item classnames (attachments joined with `+`):
 *
 *   name:Mark            — custom display name for this shopkeeper
 *   loadout:Guards       — stem of a Loadouts/*.json file
 *   faction:Raiders      — faction restriction
 *   AKM+Mag_AKM_30Rnd+KobraOptic  — base item plus attachment chain
 *
 * Parsed form keeps unknown `key:value` tokens in `other[]` so the
 * editor round-trips mod-added keywords (e.g. community scripts)
 * even though the UI doesn't surface them.
 *
 * Reference: `[Server-Hosting]-Trader-Placements.md` on the
 * DayZ-Expansion wiki.
 */

export interface GearTokens {
  /** `name:` keyword. Empty string = unset. */
  name: string;
  /** `loadout:` keyword — stem of a Loadouts/*.json file. */
  loadout: string;
  /** `faction:` keyword. */
  faction: string;
  /** Item classnames; each may contain `+` for attachment chains. */
  items: string[];
  /** Unknown `key:value` tokens we preserve verbatim for round-trip. */
  other: string[];
}

export function emptyGearTokens(): GearTokens {
  return { name: "", loadout: "", faction: "", items: [], other: [] };
}

export function parseGearTokens(raw: readonly string[]): GearTokens {
  const out = emptyGearTokens();
  for (const t of raw) {
    const token = t.trim();
    if (!token) continue;
    const colon = token.indexOf(":");
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const val = token.slice(colon + 1);
      // First occurrence wins for the keyword singletons — any
      // repeats fall into `other` so nothing gets silently dropped.
      if (key === "name" && !out.name) {
        out.name = val;
        continue;
      }
      if (key === "loadout" && !out.loadout) {
        out.loadout = val;
        continue;
      }
      if (key === "faction" && !out.faction) {
        out.faction = val;
        continue;
      }
      out.other.push(token);
      continue;
    }
    out.items.push(token);
  }
  return out;
}

export function serializeGearTokens(g: GearTokens): string[] {
  const out: string[] = [];
  if (g.name.trim()) out.push(`name:${g.name.trim()}`);
  if (g.loadout.trim()) out.push(`loadout:${g.loadout.trim()}`);
  if (g.faction.trim()) out.push(`faction:${g.faction.trim()}`);
  for (const it of g.items) {
    const t = it.trim();
    if (t) out.push(t);
  }
  out.push(...g.other);
  return out;
}
