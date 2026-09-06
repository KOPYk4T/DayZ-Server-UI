import type { SettingsSchema } from "./types";

export const missionSchema: SettingsSchema = {
  name: "Mission",
  title: "Mission settings",
  description:
    "Dynamic mission event pacing. Counts run against the per-server active mission pool.",
  expectedVersion: 2,
  fields: [
    {
      key: "Enabled",
      label: "Enable missions",
      type: { kind: "bool01" },
    },
    {
      key: "InitialMissionStartDelay",
      label: "Initial start delay",
      description:
        "Milliseconds after server boot before the first mission can spawn.",
      type: { kind: "int", min: 0, unit: "ms" },
    },
    {
      key: "TimeBetweenMissions",
      label: "Time between missions",
      description: "Milliseconds between consecutive mission spawns.",
      type: { kind: "int", min: 0, unit: "ms" },
    },
    {
      key: "MinMissions",
      label: "Min active missions",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxMissions",
      label: "Max active missions",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MinPlayersToStartMissions",
      label: "Min players to start",
      description:
        "Mission spawner stays dormant until this many players are connected.",
      type: { kind: "int", min: 0 },
    },
  ],
};
