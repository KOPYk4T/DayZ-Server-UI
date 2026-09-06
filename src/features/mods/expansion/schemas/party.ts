import type { SettingsSchema } from "./types";

export const partySchema: SettingsSchema = {
  name: "Party",
  title: "Party settings",
  description:
    "Expansion party system (the group / squad feature). Controls visibility, HUD, and invite behaviour.",
  expectedVersion: 8,
  fields: [
    {
      key: "EnableParties",
      label: "Enable parties",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "MaxMembersInParty",
      label: "Max members per party",
      group: "General",
      type: { kind: "int", min: 1 },
    },
    {
      key: "UseWholeMapForInviteList",
      label: "Use whole map for invite list",
      group: "General",
      description:
        "When on, you can invite anyone on the server regardless of distance.",
      type: { kind: "bool01" },
    },
    {
      key: "InviteCooldown",
      label: "Invite cooldown",
      group: "General",
      description: "Seconds before a declined player can be re-invited.",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "ForcePartyToHaveTags",
      label: "Require tag for parties",
      group: "General",
      description:
        "When on, a party must have an identifying tag before it can be created.",
      type: { kind: "bool01" },
    },
    {
      key: "DisplayPartyTag",
      label: "Display party tag",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "ShowPartyMember3DMarkers",
      label: "Show 3D markers on party members",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "ShowDistanceUnderPartyMembersMarkers",
      label: "Show distance under 3D markers",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "ShowNameOnPartyMembersMarkers",
      label: "Show name on 3D markers",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "ShowPartyMemberMapMarkers",
      label: "Show party members on map",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "EnableQuickMarker",
      label: "Enable quick marker (ping)",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "ShowDistanceUnderQuickMarkers",
      label: "Show distance on quick marker",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "ShowNameOnQuickMarkers",
      label: "Show name on quick marker",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "CanCreatePartyMarkers",
      label: "Can create party markers",
      group: "Markers",
      type: { kind: "bool01" },
    },
    {
      key: "ShowPartyMemberHUD",
      label: "Show party HUD",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "ShowHUDMemberBlood",
      label: "Show member blood on HUD",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "ShowHUDMemberStates",
      label: "Show member states on HUD",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "ShowHUDMemberStance",
      label: "Show member stance on HUD",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "ShowHUDMemberDistance",
      label: "Show member distance on HUD",
      group: "HUD",
      type: { kind: "bool01" },
    },
  ],
};
