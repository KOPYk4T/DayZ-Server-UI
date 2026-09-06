import type { SettingsSchema } from "./types";

export const chatSchema: SettingsSchema = {
  name: "Chat",
  title: "Chat settings",
  description:
    "Per-channel chat toggles and a word blacklist. The ChatColors object stays on the Raw JSON tab (hex RGBA per channel).",
  expectedVersion: 4,
  fields: [
    {
      key: "EnableGlobalChat",
      label: "Enable global chat",
      type: { kind: "bool01" },
    },
    {
      key: "EnablePartyChat",
      label: "Enable party chat",
      type: { kind: "bool01" },
    },
    {
      key: "EnableTransportChat",
      label: "Enable transport chat",
      description:
        "Channel shared between players inside the same vehicle / boat.",
      type: { kind: "bool01" },
    },
    {
      key: "EnableExpansionChat",
      label: "Enable Expansion chat",
      description:
        "Expansion's in-house chat channel (used for mod messages and system events).",
      type: { kind: "bool01" },
    },
    {
      key: "BlacklistedWords",
      label: "Blacklisted words",
      description:
        "Words that get filtered out of chat messages. Case-insensitive substring match.",
      type: { kind: "stringArray" },
    },
  ],
};
