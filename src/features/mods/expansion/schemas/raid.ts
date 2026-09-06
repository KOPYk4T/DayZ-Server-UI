import type { SettingsSchema } from "./types";

export const raidSchema: SettingsSchema = {
  name: "Raid",
  title: "Raid settings",
  description:
    "How base-building, safes, and locks can be raided: explosive damage, tool allowlists, raid-tool cycles.",
  expectedVersion: 5,
  fields: [
    // ---- General ----
    {
      key: "BaseBuildingRaidMode",
      label: "Base-building raid mode",
      group: "General",
      description:
        "0 = vanilla (any damage), 1 = explosives only, 2 = raid-tool list only.",
      type: { kind: "int", min: 0, max: 2 },
    },
    {
      key: "ExplosionTime",
      label: "Explosion arming time",
      group: "General",
      description: "Seconds between arming an explosive and detonation.",
      type: { kind: "float", min: 0, unit: "s" },
    },

    // ---- Explosives ----
    {
      key: "EnableExplosiveWhitelist",
      label: "Enable explosive whitelist",
      group: "Explosives",
      description:
        "When on, only classnames in ExplosiveDamageWhitelist do raid damage.",
      type: { kind: "bool01" },
    },
    {
      key: "ExplosiveDamageWhitelist",
      label: "Explosive damage whitelist",
      group: "Explosives",
      description:
        "Classnames of explosives allowed to deal raid damage when the whitelist is on.",
      type: {
        kind: "stringArray",
        placeholder: "Expansion_C4_Explosion",
      },
    },
    {
      key: "ExplosionDamageMultiplier",
      label: "Explosion damage multiplier",
      group: "Explosives",
      description: "Multiplier on explosive raid damage vs walls / fences.",
      type: { kind: "float", min: 0 },
    },
    {
      key: "ProjectileDamageMultiplier",
      label: "Projectile damage multiplier",
      group: "Explosives",
      description:
        "Multiplier on bullet / projectile damage vs walls / fences (0 = no damage).",
      type: { kind: "float", min: 0 },
    },

    // ---- Safes ----
    {
      key: "CanRaidSafes",
      label: "Can raid safes",
      group: "Safes",
      type: { kind: "bool01" },
    },
    {
      key: "SafeRaidUseSchedule",
      label: "Apply raid schedule to safes",
      group: "Safes",
      description:
        "When on, safes are only raidable during the window(s) defined in the Schedule array (edit via Raw JSON tab).",
      type: { kind: "bool01" },
    },
    {
      key: "SafeExplosionDamageMultiplier",
      label: "Safe explosion damage multiplier",
      group: "Safes",
      type: { kind: "float", min: 0 },
    },
    {
      key: "SafeProjectileDamageMultiplier",
      label: "Safe projectile damage multiplier",
      group: "Safes",
      type: { kind: "float", min: 0 },
    },
    {
      key: "SafeRaidTools",
      label: "Safe raid tools",
      group: "Safes",
      description:
        "Classnames usable to raid safes via tool cycles (not explosives).",
      type: {
        kind: "stringArray",
        placeholder: "ExpansionPropaneTorch",
      },
    },
    {
      key: "SafeRaidToolTimeSeconds",
      label: "Safe raid tool time per cycle",
      group: "Safes",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "SafeRaidToolCycles",
      label: "Safe raid tool cycles",
      group: "Safes",
      description: "How many tool cycles it takes to breach a safe.",
      type: { kind: "int", min: 1 },
    },
    {
      key: "SafeRaidToolDamagePercent",
      label: "Safe raid tool damage per cycle",
      group: "Safes",
      description: "Damage the tool takes per cycle, as a percentage.",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },

    // ---- Barbed wire ----
    {
      key: "CanRaidBarbedWire",
      label: "Can raid barbed wire",
      group: "Barbed wire",
      type: { kind: "bool01" },
    },
    {
      key: "BarbedWireRaidTools",
      label: "Barbed wire raid tools",
      group: "Barbed wire",
      type: {
        kind: "stringArray",
        placeholder: "ExpansionBoltCutters",
      },
    },
    {
      key: "BarbedWireRaidToolTimeSeconds",
      label: "Barbed wire tool time per cycle",
      group: "Barbed wire",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "BarbedWireRaidToolCycles",
      label: "Barbed wire tool cycles",
      group: "Barbed wire",
      type: { kind: "int", min: 1 },
    },
    {
      key: "BarbedWireRaidToolDamagePercent",
      label: "Barbed wire tool damage per cycle",
      group: "Barbed wire",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },

    // ---- Locks on base-building ----
    {
      key: "CanRaidLocksOnWalls",
      label: "Can raid locks on walls",
      group: "Locks (base)",
      type: { kind: "bool01" },
    },
    {
      key: "CanRaidLocksOnFences",
      label: "Can raid locks on fences",
      group: "Locks (base)",
      type: { kind: "bool01" },
    },
    {
      key: "CanRaidLocksOnTents",
      label: "Can raid locks on tents",
      group: "Locks (base)",
      type: { kind: "bool01" },
    },
    {
      key: "LockRaidTools",
      label: "Lock raid tools (base)",
      group: "Locks (base)",
      type: { kind: "stringArray" },
    },
    {
      key: "LockOnWallRaidToolTimeSeconds",
      label: "Lock on wall — time per cycle",
      group: "Locks (base)",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "LockOnFenceRaidToolTimeSeconds",
      label: "Lock on fence — time per cycle",
      group: "Locks (base)",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "LockOnTentRaidToolTimeSeconds",
      label: "Lock on tent — time per cycle",
      group: "Locks (base)",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "LockRaidToolCycles",
      label: "Lock raid tool cycles (base)",
      group: "Locks (base)",
      type: { kind: "int", min: 1 },
    },
    {
      key: "LockRaidToolDamagePercent",
      label: "Lock raid tool damage % (base)",
      group: "Locks (base)",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },

    // ---- Locks on containers ----
    {
      key: "CanRaidLocksOnContainers",
      label: "Can raid locks on containers",
      group: "Locks (containers)",
      type: { kind: "bool01" },
    },
    {
      key: "LockOnContainerRaidUseSchedule",
      label: "Apply schedule to container locks",
      group: "Locks (containers)",
      type: { kind: "bool01" },
    },
    {
      key: "LockOnContainerRaidTools",
      label: "Container lock raid tools",
      group: "Locks (containers)",
      type: {
        kind: "stringArray",
        placeholder: "ExpansionPropaneTorch",
      },
    },
    {
      key: "LockOnContainerRaidToolTimeSeconds",
      label: "Container lock — time per cycle",
      group: "Locks (containers)",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "LockOnContainerRaidToolCycles",
      label: "Container lock raid tool cycles",
      group: "Locks (containers)",
      type: { kind: "int", min: 1 },
    },
    {
      key: "LockOnContainerRaidToolDamagePercent",
      label: "Container lock tool damage %",
      group: "Locks (containers)",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },
  ],
};
