import type { SettingsSchema } from "./types";

export const nameTagsSchema: SettingsSchema = {
  name: "NameTags",
  title: "Name tags settings",
  description:
    "Floating player / NPC name tags. Controls visibility, range, and secondary info.",
  expectedVersion: 4,
  fields: [
    {
      key: "EnablePlayerTags",
      label: "Enable player tags",
      group: "Visibility",
      type: { kind: "bool01" },
    },
    {
      key: "PlayerTagViewRange",
      label: "Player tag view range",
      group: "Visibility",
      description: "Metres at which player tags become visible.",
      type: { kind: "int", min: 0, unit: "m" },
    },
    {
      key: "OnlyInSafeZones",
      label: "Only show in safe zones",
      group: "Visibility",
      type: { kind: "bool01" },
    },
    {
      key: "OnlyInTerritories",
      label: "Only show in territories",
      group: "Visibility",
      type: { kind: "bool01" },
    },
    {
      key: "ShowNPCTags",
      label: "Show NPC tags",
      group: "Visibility",
      type: { kind: "bool01" },
    },
    {
      key: "PlayerTagsIcon",
      label: "Tag icon set / name",
      group: "Appearance",
      description: "Icon identifier used for the name-tag bullet.",
      type: { kind: "string" },
    },
    {
      key: "PlayerTagsColor",
      label: "Tag foreground colour",
      group: "Appearance",
      description: "RGBA integer. -1 = use the Expansion default.",
      type: { kind: "int" },
    },
    {
      key: "PlayerNameColor",
      label: "Player name colour",
      group: "Appearance",
      description: "RGBA integer. -1 = use the Expansion default.",
      type: { kind: "int" },
    },
    {
      key: "ShowPlayerItemInHands",
      label: "Show item in hands",
      group: "Extra info",
      type: { kind: "bool01" },
    },
    {
      key: "UseRarityColorForItemInHands",
      label: "Use rarity colour for held item",
      group: "Extra info",
      type: { kind: "bool01" },
    },
    {
      key: "ShowPlayerFaction",
      label: "Show player faction",
      group: "Extra info",
      type: { kind: "bool01" },
    },
  ],
};
