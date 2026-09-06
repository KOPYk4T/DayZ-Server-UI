import type { SettingsSchema } from "./types";

export const monitoringSchema: SettingsSchema = {
  name: "Monitoring",
  title: "Monitoring settings",
  description: "Server-side performance monitoring. Tiny file; toggle only.",
  expectedVersion: 1,
  fields: [
    {
      key: "Enabled",
      label: "Enable monitoring",
      type: { kind: "bool01" },
    },
  ],
};
