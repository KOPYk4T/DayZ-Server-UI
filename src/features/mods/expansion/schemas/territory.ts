import type { SettingsSchema } from "./types";

export const territorySchema: SettingsSchema = {
  name: "Territory",
  title: "Territory settings",
  description:
    "Base-claim rules: territory size, membership limits, code-lock authentication.",
  expectedVersion: 6,
  fields: [
    {
      key: "EnableTerritories",
      label: "Enable territories",
      group: "General",
      description: "Master switch for the territory system.",
      type: { kind: "bool01" },
    },
    {
      key: "TerritorySize",
      label: "Territory size",
      group: "Sizing",
      description:
        "Radius around the flag pole that counts as territory, in metres.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "TerritoryPerimeterSize",
      label: "Territory perimeter size",
      group: "Sizing",
      description:
        "Extra metres outside TerritorySize that still count for certain interactions (damage, AI agro).",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "MaxMembersInTerritory",
      label: "Max members in a territory",
      group: "Membership",
      description: "Hard cap on how many players a single territory can list.",
      type: { kind: "int", min: 1 },
    },
    {
      key: "MaxTerritoryPerPlayer",
      label: "Max territories per player",
      group: "Membership",
      description:
        "How many separate territories one player can own at the same time.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "TerritoryInviteAcceptRadius",
      label: "Invite accept radius",
      group: "Membership",
      description:
        "How close (metres) an invited player must be to the flag to accept.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "UseWholeMapForInviteList",
      label: "Use whole map for invite list",
      group: "Membership",
      description:
        "When on, the territory owner can invite any connected player regardless of distance. Off = only nearby players show up.",
      type: { kind: "bool01" },
    },
    {
      key: "InviteCooldown",
      label: "Invite cooldown",
      group: "Membership",
      description:
        "Seconds before a player can be re-invited after declining.",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "OnlyInviteGroupMember",
      label: "Only invite group members",
      group: "Membership",
      description:
        "When on, only players already in your Expansion group can be invited to a territory.",
      type: { kind: "bool01" },
    },
    {
      key: "AuthenticateCodeLockIfTerritoryMember",
      label: "Auto-authenticate code locks for members",
      group: "Code locks",
      description:
        "Skip the code-lock PIN prompt for players who are in the territory's member list.",
      type: { kind: "bool01" },
    },
    {
      key: "MaxCodeLocksOnBBPerTerritory",
      label: "Max code locks on base-building",
      group: "Code locks",
      description:
        "Cap on how many code locks can be placed on walls / fences per territory. -1 = no limit.",
      type: { kind: "int", min: -1 },
    },
    {
      key: "MaxCodeLocksOnItemsPerTerritory",
      label: "Max code locks on items / containers",
      group: "Code locks",
      description:
        "Cap on code locks on non-BB items (chests, tents, safes) per territory. -1 = no limit.",
      type: { kind: "int", min: -1 },
    },
  ],
};
