/**
 * DayZ Wiki (wiki.gg) inventory art — hotlinked, never vendored.
 * Bohemia has no icon CDN. Filenames usually match the classname
 * (`AKM.png`); a few CE names do not (`SardinesCan` → `Canned_Sardines`).
 *
 * wiki.gg rate-limits the MediaWiki API. We only hit image thumb
 * URLs for rows that are on screen, cache hits, and treat misses as
 * "no art" so scrolling does not 404-storm.
 */

const WIKI_THUMB = "https://dayz.wiki.gg/images/thumb";

/** CE classname → wiki file stem (no .png). */
const ALIASES: Record<string, string> = {
  SardinesCan: "Canned_Sardines",
  TunaCan: "Canned_Tuna",
  PeachesCan: "Canned_Peaches",
  SpaghettiCan: "Canned_Spaghetti",
  BaconCan: "Canned_Bacon",
  PorkCan: "Canned_Pork",
};

const HIT_KEY = "dzcm.wiki-images.hits.v1";

type HitMap = Record<string, string>;

let hits: HitMap = loadHits();
const misses = new Set<string>();
let sawSuccessfulLoad = false;

function loadHits(): HitMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HIT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as HitMap;
  } catch {
    /* ignore */
  }
  return {};
}

function persistHits() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HIT_KEY, JSON.stringify(hits));
  } catch {
    /* quota / private mode */
  }
}

export function wikiFileCandidates(classname: string): string[] {
  const stems = [classname];
  const alias = ALIASES[classname];
  if (alias) stems.unshift(alias);
  return [...new Set(stems)].map((s) => `${s}.png`);
}

export function wikiThumbUrl(file: string, width: number): string {
  return `${WIKI_THUMB}/${file}/${width}px-${file}`;
}

export function peekWikiHit(classname: string): string | null {
  if (misses.has(classname)) return null;
  return hits[classname] ?? null;
}

export function isWikiMiss(classname: string): boolean {
  return misses.has(classname);
}

export function rememberWikiHit(classname: string, file: string) {
  sawSuccessfulLoad = true;
  if (hits[classname] === file) return;
  hits = { ...hits, [classname]: file };
  persistHits();
}

/** Only persist a miss after some other image has loaded — a 429
 *  would otherwise blacklist every remaining classname. */
export function rememberWikiMiss(classname: string) {
  if (!sawSuccessfulLoad) return;
  misses.add(classname);
}

export function wikiPageUrl(classname: string): string {
  const file = hits[classname] ?? wikiFileCandidates(classname)[0];
  const stem = file.replace(/\.png$/i, "");
  return `https://dayz.wiki.gg/wiki/File:${encodeURIComponent(stem)}.png`;
}
