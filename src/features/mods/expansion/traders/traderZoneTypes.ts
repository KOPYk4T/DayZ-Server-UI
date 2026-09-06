/**
 * DayZ-Expansion trader-zone JSON shape, from the wiki page
 * `[Server-Hosting]-Market-TraderZones-Settings.md`. One file per
 * zone under `mpmissions/<map>/expansion/traderzones/`. The sphere
 * centred on `Position` with radius `Radius` is what the mod checks
 * against when deciding whether a trader can serve — traders placed
 * outside every zone never function.
 *
 * Unknown fields round-trip untouched via `[extra: string]: unknown`
 * so mod-extended zones aren't clobbered on save.
 */

export interface TraderZone {
  /** Expansion schema version — kept verbatim. */
  m_Version: number;
  m_DisplayName: string;
  /** `[X, Y, Z]` world metres. Y matters — zones are spheres. */
  Position: [number, number, number];
  /** Sphere radius in metres. Typical: 100–300 for a town market. */
  Radius: number;
  /** Buy-price multiplier applied to every item sourced from this
   *  zone. `-1` ≡ inherit from global MarketSettings. */
  BuyPricePercent: number;
  /** Sell-price multiplier. `-1` ≡ inherit. */
  SellPricePercent: number;
  /** Initial / current stock per classname. Written back out by
   *  the server during normal play — edit offline only. */
  Stock: Record<string, number>;
  [extra: string]: unknown;
}

export const DEFAULT_TRADER_ZONE: TraderZone = {
  m_Version: 2,
  m_DisplayName: "New trader zone",
  Position: [0, 0, 0],
  Radius: 150,
  BuyPricePercent: -1,
  SellPricePercent: -1,
  Stock: {},
};

export function parseTraderZone(raw: string): TraderZone {
  const parsed = JSON.parse(raw) as Partial<TraderZone>;
  // Defensive defaults — the file could be hand-authored with missing
  // fields, and we never want a selection to throw inside the editor.
  return {
    m_Version: parsed.m_Version ?? DEFAULT_TRADER_ZONE.m_Version,
    m_DisplayName:
      parsed.m_DisplayName ?? DEFAULT_TRADER_ZONE.m_DisplayName,
    Position: toVec3(parsed.Position) ?? [...DEFAULT_TRADER_ZONE.Position],
    Radius: parsed.Radius ?? DEFAULT_TRADER_ZONE.Radius,
    BuyPricePercent:
      parsed.BuyPricePercent ?? DEFAULT_TRADER_ZONE.BuyPricePercent,
    SellPricePercent:
      parsed.SellPricePercent ?? DEFAULT_TRADER_ZONE.SellPricePercent,
    Stock: parsed.Stock ?? {},
    ...parsed,
  } as TraderZone;
}

export function serializeTraderZone(zone: TraderZone): string {
  return JSON.stringify(zone, null, 4);
}

function toVec3(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const a = Number(v[0]);
  const b = Number(v[1]);
  const c = Number(v[2]);
  if (![a, b, c].every(Number.isFinite)) return null;
  return [a, b, c];
}
