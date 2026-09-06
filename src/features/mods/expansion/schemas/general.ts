import type { SettingsSchema } from "./types";

export const generalSchema: SettingsSchema = {
  name: "General",
  title: "General settings",
  description:
    "Grab-bag of Expansion toggles: gravecross rules, HUD, main-menu customisation, enabled lighting / generators. The Mapping list (custom buildings added to the map) and HUDColors object stay on the Raw JSON tab.",
  expectedVersion: 16,
  fields: [
    // ---- Gravecross ----
    {
      key: "EnableGravecross",
      label: "Enable gravecross (player death)",
      group: "Gravecross",
      description:
        "Plants a marker at the spot of a player's death with their gear for a limited time.",
      type: { kind: "bool01" },
    },
    {
      key: "EnableAIGravecross",
      label: "Enable gravecross (AI death)",
      group: "Gravecross",
      type: { kind: "bool01" },
    },
    {
      key: "GravecrossDeleteBody",
      label: "Delete body on gravecross spawn",
      group: "Gravecross",
      type: { kind: "bool01" },
    },
    {
      key: "GravecrossTimeThreshold",
      label: "Gravecross lifetime",
      group: "Gravecross",
      type: { kind: "float", min: 0, unit: "s" },
    },
    {
      key: "GravecrossSpawnTimeDelay",
      label: "Gravecross spawn delay",
      group: "Gravecross",
      type: { kind: "float", min: 0, unit: "s" },
    },
    {
      key: "DisableShootToUnlock",
      label: "Disable shoot-to-unlock",
      group: "Gravecross",
      description:
        "When on, you cannot shoot off a code lock even at point-blank.",
      type: { kind: "bool01" },
    },

    // ---- World / lighting ----
    {
      key: "EnableLamps",
      label: "Enable world lamps",
      group: "World",
      description:
        "0 = off, 1 = night only, 2 = always, 3 = default Expansion schedule.",
      type: { kind: "int", min: 0, max: 3 },
    },
    {
      key: "LampAmount_OneInX",
      label: "Lamp density (1 in X)",
      group: "World",
      description: "Higher = fewer lamps lit. 3 means every third lamp.",
      type: { kind: "int", min: 1 },
    },
    {
      key: "LampSelectionMode",
      label: "Lamp selection mode",
      group: "World",
      description:
        "Expansion enum as a string — common values: FARTHEST_RANDOM, CLOSEST_RANDOM, RANDOM.",
      type: { kind: "string" },
    },
    {
      key: "EnableGenerators",
      label: "Enable generators",
      group: "World",
      type: { kind: "bool01" },
    },
    {
      key: "EnableLighthouses",
      label: "Enable lighthouses",
      group: "World",
      type: { kind: "bool01" },
    },

    // ---- HUD ----
    {
      key: "EnableHUDNightvisionOverlay",
      label: "Enable HUD nightvision overlay",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "DisableMagicCrosshair",
      label: "Disable magic crosshair",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "EnableAutoRun",
      label: "Enable auto-run",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "UseDeathScreen",
      label: "Use Expansion death screen",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "UseDeathScreenStatistics",
      label: "Show death-screen statistics",
      group: "HUD",
      type: { kind: "bool01" },
    },
    {
      key: "UseHUDColors",
      label: "Use custom HUD colours",
      group: "HUD",
      description:
        "When on, the HUDColors map is applied. Edit that map via the Raw JSON tab.",
      type: { kind: "bool01" },
    },
    {
      key: "EnableEarPlugs",
      label: "Enable ear plugs",
      group: "HUD",
      type: { kind: "bool01" },
    },

    // ---- Main menu ----
    {
      key: "UseExpansionMainMenuLogo",
      label: "Use Expansion main-menu logo",
      group: "Main menu",
      type: { kind: "bool01" },
    },
    {
      key: "UseExpansionMainMenuIcons",
      label: "Use Expansion main-menu icons",
      group: "Main menu",
      type: { kind: "bool01" },
    },
    {
      key: "UseExpansionMainMenuIntroScene",
      label: "Use Expansion intro scene",
      group: "Main menu",
      type: { kind: "bool01" },
    },
    {
      key: "UseNewsFeedInGameMenu",
      label: "Show news feed in menu",
      group: "Main menu",
      description:
        "Ties into the Social Media settings — news tiles come from there.",
      type: { kind: "bool01" },
    },
    {
      key: "InGameMenuLogoPath",
      label: "In-game menu logo path",
      group: "Main menu",
      description:
        "Icon set / image identifier (e.g. `set:expansion_iconset image:logo_expansion_white`).",
      type: { kind: "string" },
    },
  ],
};
