import type { SettingsSchema } from "./types";

export const bookSchema: SettingsSchema = {
  name: "Book",
  title: "Book settings",
  description:
    "In-game Book (rules, server info, settings viewer). The RuleCategories and SettingCategories arrays are structured content — edit those on the Raw JSON tab.",
  expectedVersion: 5,
  fields: [
    {
      key: "EnableBookMenu",
      label: "Enable book menu",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "EnableStatusTab",
      label: "Enable Status tab",
      group: "Tabs",
      type: { kind: "bool01" },
    },
    {
      key: "EnablePartyTab",
      label: "Enable Party tab",
      group: "Tabs",
      type: { kind: "bool01" },
    },
    {
      key: "EnableServerInfoTab",
      label: "Enable Server Info tab",
      group: "Tabs",
      type: { kind: "bool01" },
    },
    {
      key: "EnableServerRulesTab",
      label: "Enable Server Rules tab",
      group: "Tabs",
      type: { kind: "bool01" },
    },
    {
      key: "EnableTerritoryTab",
      label: "Enable Territory tab",
      group: "Tabs",
      type: { kind: "bool01" },
    },
    {
      key: "CreateBookmarks",
      label: "Create bookmarks",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "ShowHaBStats",
      label: "Show Hit-and-Being-hit stats",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "ShowPlayerFaction",
      label: "Show player faction",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "DisplayServerSettingsInServerInfoTab",
      label: "Show server settings in Server Info",
      group: "General",
      type: { kind: "bool01" },
    },
  ],
};
