import type { SettingsSchema } from "./types";

export const playerListSchema: SettingsSchema = {
  name: "PlayerList",
  title: "Player list settings",
  description: "Controls the in-game player list (visible to non-admins).",
  expectedVersion: 0,
  fields: [
    {
      key: "EnablePlayerList",
      label: "Enable player list",
      type: { kind: "bool01" },
    },
    {
      key: "EnableTooltip",
      label: "Show tooltip on hover",
      description: "Reveals extra info (ping, faction) when hovering a row.",
      type: { kind: "bool01" },
    },
  ],
};
