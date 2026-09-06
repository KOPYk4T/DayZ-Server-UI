import type { SettingsSchema } from "./types";

export const personalStorageSchema: SettingsSchema = {
  name: "PersonalStorageNew",
  title: "Personal storage settings",
  description:
    "Per-player storage accessible from anywhere. The nested StorageLevels map (per-tier rules) stays on the Raw JSON tab for now.",
  expectedVersion: 4,
  fields: [
    {
      key: "UseCategoryMenu",
      label: "Use category menu",
      description:
        "Group stored items by category in the UI. Off = flat list.",
      type: { kind: "bool01" },
    },
    {
      key: "ExcludedItems",
      label: "Excluded items",
      description:
        "Classnames that can never be placed into personal storage.",
      type: { kind: "stringArray" },
    },
  ],
};
