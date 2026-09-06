import type { SettingsSchema } from "./types";

export const notificationSchedulerSchema: SettingsSchema = {
  name: "NotificationScheduler",
  title: "Notification scheduler",
  description:
    "Scheduled server-wide announcements. The Notifications array (time+text per entry) stays on the Raw JSON tab.",
  expectedVersion: 2,
  fields: [
    {
      key: "Enabled",
      label: "Enable scheduler",
      type: { kind: "bool01" },
    },
    {
      key: "UTC",
      label: "Use UTC time",
      description:
        "When on, scheduled Hour/Minute values are interpreted in UTC instead of the server's local timezone.",
      type: { kind: "bool01" },
    },
    {
      key: "UseMissionTime",
      label: "Use mission time",
      description:
        "When on, use the in-game mission clock instead of real time.",
      type: { kind: "bool01" },
    },
  ],
};
