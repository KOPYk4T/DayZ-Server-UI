import type { SettingsSchema } from "./types";

export const coreSchema: SettingsSchema = {
  name: "Core",
  title: "Core settings",
  description:
    "Base Expansion framework knobs. Rarely touched after initial tuning.",
  expectedVersion: 9,
  fields: [
    {
      key: "ServerUpdateRateLimit",
      label: "Server update rate limit",
      group: "Performance",
      description:
        "Cap on Expansion's per-tick network updates. 0 = unlimited (default). Raise if you run lots of players + custom AI / vehicles and see desync; lower only for targeted bandwidth tuning.",
      type: { kind: "int", min: 0, unit: "ticks/s" },
    },
    {
      key: "ForceExactCEItemLifetime",
      label: "Force exact CE item lifetime",
      group: "Economy",
      description:
        "When on, items despawn at exactly the lifetime value in types.xml with no jitter. Off = vanilla randomised despawn.",
      type: { kind: "bool01" },
    },
    {
      key: "EnableInventoryCargoTidy",
      label: "Enable inventory cargo tidy",
      group: "Inventory",
      description:
        "When on, container cargo is auto-arranged when an item is added. Cosmetic; some servers disable it for performance.",
      type: { kind: "bool01" },
    },
  ],
};
