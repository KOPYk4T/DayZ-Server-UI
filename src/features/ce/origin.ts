/**
 * Origin tracking — shared helpers for the per-record source chips
 * and the mod / file filter rows on every CE editor (Items, Events,
 * Spawnables, Random Presets).
 *
 * Every CE record already carries `source` ("vanilla" / "mod" /
 * "custom"), an optional `modId` (the folder name from
 * `cfgeconomycore.xml` for `mod`-sourced records), and `file` (the
 * workspace-relative path of the XML the record was parsed from).
 * This module turns those raw fields into a stable identity each
 * record can be filtered + tinted by, plus the deterministic colour
 * helpers used end-to-end.
 *
 * The "origin" of a record is one of:
 *   - `vanilla`     — vanilla DayZ CE files (db/types.xml etc.)
 *   - `custom`      — operator's own CE folder (the `Custom` slot
 *                     in `cfgeconomycore.xml`)
 *   - `mod:<folder>`— a registered mod CE folder; the suffix is
 *                     the same string the engine reads from
 *                     `cfgeconomycore.xml` (e.g. `Expansion`)
 *
 * The filter UIs key off these strings; do not localise them.
 */

import type { ItemSource } from "@/types/ipc";

/** Stable id for a record's source. Used as the React key, the URL
 *  param value, and the colour-hash input. */
export type OriginId = string;

export interface RecordWithOrigin {
  source: ItemSource;
  modId?: string | null;
  /** Workspace-relative XML path the record was parsed from. */
  file: string;
}

export interface Origin {
  /** Stable id (`vanilla` / `custom` / `mod:Expansion`). */
  id: OriginId;
  /** Display label — what the chip renders. */
  label: string;
  /** Bucket the origin falls into. Drives chip colour and the
   *  Vanilla / Custom shortcuts in the filter row. */
  kind: ItemSource;
  /** Mod folder name when `kind === "mod"`, undefined otherwise. */
  modFolder?: string;
}

/** Compute the canonical origin id for a record. */
export function originId(rec: RecordWithOrigin): OriginId {
  if (rec.source === "vanilla") return "vanilla";
  if (rec.source === "custom") return "custom";
  // `mod` source — fall back to the folder if `modId` is unset
  // (older snapshots predate the cfgeconomycore wiring; defensive).
  const folder = (rec.modId ?? "").trim();
  return folder ? `mod:${folder}` : "mod:?";
}

/** Inverse of `originId` — turn an id back into a renderable
 *  Origin record. Used to reconstruct origins from URL params
 *  without having to re-walk every record. */
export function parseOriginId(id: OriginId): Origin {
  if (id === "vanilla") {
    return { id, label: "Vanilla", kind: "vanilla" };
  }
  if (id === "custom") {
    return { id, label: "Custom", kind: "custom" };
  }
  if (id.startsWith("mod:")) {
    const folder = id.slice("mod:".length);
    return {
      id,
      label: folder || "(unknown mod)",
      kind: "mod",
      modFolder: folder,
    };
  }
  return { id, label: id, kind: "mod" };
}

/** Walk the records once, return distinct origins with counts.
 *  Ordering: Vanilla → Custom → mods alphabetically. Mods first by
 *  count would feel arbitrary on small sets; alphabetical is
 *  predictable across refreshes. */
export function collectOrigins(
  records: ReadonlyArray<RecordWithOrigin>,
): Array<Origin & { count: number }> {
  const counts = new Map<OriginId, number>();
  for (const r of records) {
    const id = originId(r);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const out: Array<Origin & { count: number }> = [];
  for (const [id, count] of counts) {
    out.push({ ...parseOriginId(id), count });
  }
  out.sort((a, b) => {
    // Vanilla first, then Custom, then mods alphabetically.
    const order = (o: Origin) =>
      o.kind === "vanilla" ? 0 : o.kind === "custom" ? 1 : 2;
    const ao = order(a);
    const bo = order(b);
    if (ao !== bo) return ao - bo;
    return a.label.localeCompare(b.label);
  });
  return out;
}

/** Walk records belonging to ONE origin, return distinct files +
 *  counts. Used by the file drill-down sub-row that appears when a
 *  single mod is selected. Files are sorted by basename so
 *  `market_types.xml` slots in next to `types.xml` reliably. */
export function collectFilesForOrigin(
  records: ReadonlyArray<RecordWithOrigin>,
  id: OriginId,
): Array<{ file: string; basename: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (originId(r) !== id) continue;
    counts.set(r.file, (counts.get(r.file) ?? 0) + 1);
  }
  const rows = Array.from(counts.entries()).map(([file, count]) => ({
    file,
    basename: basenameOf(file),
    count,
  }));
  rows.sort((a, b) => a.basename.localeCompare(b.basename));
  return rows;
}

/** Filter a record list down to a selected set of origins (multi-
 *  select). Empty `selectedOrigins` = pass-through. When a specific
 *  file is also selected, narrow further. */
export function filterByOrigin<T extends RecordWithOrigin>(
  records: ReadonlyArray<T>,
  selectedOrigins: ReadonlySet<OriginId>,
  selectedFile: string | null,
): T[] {
  if (selectedOrigins.size === 0 && !selectedFile) {
    return records.slice();
  }
  return records.filter((r) => {
    if (selectedOrigins.size > 0 && !selectedOrigins.has(originId(r))) {
      return false;
    }
    if (selectedFile && r.file !== selectedFile) {
      return false;
    }
    return true;
  });
}

// ---------- Colour hashing ----------

/** Deterministic palette indexed by hash. Twelve hues spaced around
 *  the wheel, biased toward the muted side so chips don't shout
 *  next to row text. Each entry encodes one Tailwind-friendly tuple
 *  the chip + filter components apply directly. */
const PALETTE: ReadonlyArray<{
  /** Background tint (10% opacity). */
  bg: string;
  /** Foreground text colour. */
  fg: string;
  /** Border colour. */
  border: string;
}> = [
  { bg: "rgba(34,197,94,0.12)", fg: "#16a34a", border: "rgba(34,197,94,0.45)" },     // green
  { bg: "rgba(234,179,8,0.12)", fg: "#ca8a04", border: "rgba(234,179,8,0.45)" },     // yellow
  { bg: "rgba(249,115,22,0.12)", fg: "#ea580c", border: "rgba(249,115,22,0.45)" },   // orange
  { bg: "rgba(220,38,38,0.12)", fg: "#dc2626", border: "rgba(220,38,38,0.45)" },     // red
  { bg: "rgba(139,92,246,0.12)", fg: "#7c3aed", border: "rgba(139,92,246,0.45)" },   // violet
  { bg: "rgba(14,165,233,0.12)", fg: "#0284c7", border: "rgba(14,165,233,0.45)" },   // sky
  { bg: "rgba(20,184,166,0.12)", fg: "#0d9488", border: "rgba(20,184,166,0.45)" },   // teal
  { bg: "rgba(236,72,153,0.12)", fg: "#db2777", border: "rgba(236,72,153,0.45)" },   // pink
  { bg: "rgba(99,102,241,0.12)", fg: "#4f46e5", border: "rgba(99,102,241,0.45)" },   // indigo
  { bg: "rgba(132,204,22,0.12)", fg: "#65a30d", border: "rgba(132,204,22,0.45)" },   // lime
  { bg: "rgba(168,85,247,0.12)", fg: "#9333ea", border: "rgba(168,85,247,0.45)" },   // purple
  { bg: "rgba(245,158,11,0.12)", fg: "#d97706", border: "rgba(245,158,11,0.45)" },   // amber
];

/** Neutral grey palette for `vanilla` and `custom` — non-mod
 *  origins shouldn't compete with the mod hue spectrum visually. */
const VANILLA_TINT = {
  bg: "rgba(148,163,184,0.10)",
  fg: "#64748b",
  border: "rgba(148,163,184,0.40)",
};
const CUSTOM_TINT = {
  bg: "rgba(217,119,6,0.10)",
  fg: "#b45309",
  border: "rgba(217,119,6,0.40)",
};

/** Tiny FNV-1a hash for short strings — stable across sessions, no
 *  crypto needed. Good enough for picking a palette slot. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Return the colour tuple for an origin id. Vanilla and Custom
 *  get fixed neutral tints; mod folders hash into the palette. */
export function originTint(id: OriginId): {
  bg: string;
  fg: string;
  border: string;
} {
  if (id === "vanilla") return VANILLA_TINT;
  if (id === "custom") return CUSTOM_TINT;
  const folder = id.startsWith("mod:") ? id.slice(4) : id;
  const slot = hashStr(folder.toLowerCase()) % PALETTE.length;
  return PALETTE[slot];
}

// ---------- Path helpers ----------

/** Last segment of a path, with `\` and `/` both treated as
 *  separators. Used in tooltips + the file drill-down sub-row. */
export function basenameOf(p: string): string {
  const m = /[^\\/]+$/.exec(p);
  return m ? m[0] : p;
}
