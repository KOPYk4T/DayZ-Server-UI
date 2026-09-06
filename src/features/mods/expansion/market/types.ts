/**
 * DayZ-Expansion market category shape — one JSON file per category
 * under `profiles/ExpansionMod/Market/`. Unknown fields are
 * preserved on round-trip so mods that extend Expansion (extra
 * fields on items, custom category-level metadata) don't lose data.
 *
 * Reference: https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/
 * (Market section). Fields match Expansion Bundle `m_Version: 12`.
 */

export interface MarketItem {
  ClassName: string;
  /** Upper price envelope. Displayed price scales between min/max
   *  based on current stock — less stock = closer to max price. */
  MaxPriceThreshold: number;
  MinPriceThreshold: number;
  /** % of buy price used when selling back. -1 = use global default. */
  SellPricePercent: number;
  MaxStockThreshold: number;
  MinStockThreshold: number;
  /** Cargo quantity %. -1 = use item default; 100 = full; 50 = half. */
  QuantityPercent: number;
  /** Classnames automatically attached on spawn (batteries, mags). */
  SpawnAttachments: string[];
  /** Visual / skin variants of this item. Each variant is normally
   *  just a classname string in Expansion's schema. */
  Variants: string[];
  /** Carry any extra keys (mods occasionally add custom metadata). */
  [extra: string]: unknown;
}

export interface MarketCategory {
  m_Version: number;
  /** String-table key; shown in trader UI. Leave as `#STR_...`
   *  references where possible. */
  DisplayName: string;
  /** Icon slug — see the Expansion wiki for valid names. */
  Icon: string;
  /** 8-char hex RGBA — UI render colour for this category. */
  Color: string;
  /** 1 = exchange-only (players swap currency), 0 = normal. */
  IsExchange: 0 | 1;
  /** 0-100. Initial stock on server start, as % of MaxStockThreshold. */
  InitStockPercent: number;
  Items: MarketItem[];
  [extra: string]: unknown;
}

export const DEFAULT_MARKET_ITEM: MarketItem = {
  ClassName: "",
  MaxPriceThreshold: 100,
  MinPriceThreshold: 50,
  SellPricePercent: -1,
  MaxStockThreshold: 100,
  MinStockThreshold: 1,
  QuantityPercent: -1,
  SpawnAttachments: [],
  Variants: [],
};

export const DEFAULT_MARKET_CATEGORY: MarketCategory = {
  m_Version: 12,
  DisplayName: "",
  Icon: "Deliver",
  Color: "FBFCFEFF",
  IsExchange: 0,
  InitStockPercent: 75,
  Items: [],
};
