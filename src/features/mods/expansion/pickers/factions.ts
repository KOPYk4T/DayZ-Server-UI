/**
 * Built-in Expansion faction enum. Source: eAI wiki + mod source.
 * Includes the `Invincible*` god-mode variants used for static
 * market guards, plus `RANDOM` — an Expansion sentinel that picks
 * a faction at spawn. Operators with custom factions (added via
 * a script mod) can still type any string; this list just powers
 * autocomplete and spelling confidence in the picker.
 */
export const EXPANSION_FACTIONS: readonly string[] = [
  "West",
  "East",
  "Raiders",
  "Mercenaries",
  "Civilian",
  "Passive",
  "Guards",
  "InvincibleGuards",
  "Shamans",
  "Observers",
  "InvincibleObservers",
  "YeetBrigade",
  "InvincibleYeetBrigade",
  "Brawlers",
  "RANDOM",
];
