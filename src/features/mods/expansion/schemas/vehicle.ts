import type { SettingsSchema } from "./types";

export const vehicleSchema: SettingsSchema = {
  name: "Vehicle",
  title: "Vehicle settings",
  description:
    "Vehicle locking, lock-pick rules, damage multipliers, helicopter physics tweaks.",
  expectedVersion: 23,
  fields: [
    // ---- Core ----
    {
      key: "VehicleSync",
      label: "Vehicle sync",
      group: "Core",
      description:
        "Replication mode for vehicle state. 0 = default. Non-zero changes are experimental.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "Towing",
      label: "Enable towing",
      group: "Core",
      type: { kind: "bool01" },
    },
    {
      key: "VehicleDropsRuinedDoors",
      label: "Drop ruined doors",
      group: "Core",
      type: { kind: "bool01" },
    },
    {
      key: "ExplodingVehicleDropsAttachments",
      label: "Exploding vehicle drops attachments",
      group: "Core",
      type: { kind: "bool01" },
    },
    {
      key: "PlacePlayerOnGroundOnReconnectInVehicle",
      label: "Reconnect-in-vehicle behaviour",
      group: "Core",
      description:
        "0 = keep in vehicle, 1 = place on ground, 2 = place on ground if vehicle is gone.",
      type: { kind: "int", min: 0, max: 2 },
    },

    // ---- Locking ----
    {
      key: "VehicleRequireKeyToStart",
      label: "Require key to start",
      group: "Locking",
      type: { kind: "bool01" },
    },
    {
      key: "VehicleRequireAllDoors",
      label: "Require all doors to lock",
      group: "Locking",
      type: { kind: "bool01" },
    },
    {
      key: "VehicleLockedAllowInventoryAccess",
      label: "Inventory access while locked",
      group: "Locking",
      type: { kind: "bool01" },
    },
    {
      key: "VehicleLockedAllowInventoryAccessWithoutDoors",
      label: "Inventory access when doors missing",
      group: "Locking",
      type: { kind: "bool01" },
    },
    {
      key: "MasterKeyPairingMode",
      label: "Master key pairing mode",
      group: "Locking",
      description:
        "How master keys get paired. 0 = manual, 1 = instant, 2 = requires pair count.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MasterKeyUses",
      label: "Master key uses",
      group: "Locking",
      description: "Max number of vehicles one master key can pair with.",
      type: { kind: "int", min: 0 },
    },

    // ---- Lock picking ----
    {
      key: "CanPickLock",
      label: "Can pick vehicle locks",
      group: "Lock picking",
      type: { kind: "bool01" },
    },
    {
      key: "PickLockTools",
      label: "Pick-lock tool classnames",
      group: "Lock picking",
      type: { kind: "stringArray" },
    },
    {
      key: "PickLockChancePercent",
      label: "Pick-lock success chance",
      group: "Lock picking",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },
    {
      key: "PickLockTimeSeconds",
      label: "Pick-lock time",
      group: "Lock picking",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "PickLockToolDamagePercent",
      label: "Tool damage per attempt",
      group: "Lock picking",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },
    {
      key: "CanChangeLock",
      label: "Can change vehicle lock",
      group: "Lock picking",
      type: { kind: "bool01" },
    },
    {
      key: "ChangeLockTools",
      label: "Change-lock tool classnames",
      group: "Lock picking",
      type: { kind: "stringArray" },
    },
    {
      key: "ChangeLockTimeSeconds",
      label: "Change-lock time",
      group: "Lock picking",
      type: { kind: "int", min: 0, unit: "s" },
    },
    {
      key: "ChangeLockToolDamagePercent",
      label: "Change-lock tool damage",
      group: "Lock picking",
      type: { kind: "float", min: 0, max: 100, unit: "%" },
    },

    // ---- Damage ----
    {
      key: "DisableVehicleDamage",
      label: "Disable vehicle damage entirely",
      group: "Damage",
      type: { kind: "bool01" },
    },
    {
      key: "VehicleCrewDamageMultiplier",
      label: "Crew damage multiplier",
      group: "Damage",
      type: { kind: "float", min: 0 },
    },
    {
      key: "VehicleSpeedDamageMultiplier",
      label: "Speed damage multiplier",
      group: "Damage",
      type: { kind: "float", min: 0 },
    },
    {
      key: "VehicleRoadKillDamageMultiplier",
      label: "Roadkill damage multiplier",
      group: "Damage",
      type: { kind: "float", min: 0 },
    },
    {
      key: "CollisionDamageIfEngineOff",
      label: "Collision damage when engine off",
      group: "Damage",
      type: { kind: "bool01" },
    },
    {
      key: "CollisionDamageMinSpeedKmh",
      label: "Collision damage min speed",
      group: "Damage",
      type: { kind: "float", min: 0, unit: "km/h" },
    },
    {
      key: "RevvingOverMaxRPMRuinsEngineInstantly",
      label: "Over-rev ruins engine",
      group: "Damage",
      type: { kind: "bool01" },
    },
    {
      key: "DesyncInvulnerabilityTimeoutSeconds",
      label: "Desync invulnerability window",
      group: "Damage",
      description:
        "Seconds a vehicle is protected from damage while its network state syncs back in.",
      type: { kind: "float", min: 0, unit: "s" },
    },

    // ---- Air vehicles ----
    {
      key: "EnableWindAerodynamics",
      label: "Wind aerodynamics",
      group: "Air vehicles",
      type: { kind: "bool01" },
    },
    {
      key: "EnableMainRotorDamage",
      label: "Main rotor damage",
      group: "Air vehicles",
      type: { kind: "bool01" },
    },
    {
      key: "EnableTailRotorDamage",
      label: "Tail rotor damage",
      group: "Air vehicles",
      type: { kind: "bool01" },
    },
    {
      key: "EnableHelicopterExplosions",
      label: "Helicopter explosions on destroy",
      group: "Air vehicles",
      type: { kind: "bool01" },
    },
    {
      key: "PilotlessAutoHoverEngineStopDelaySeconds",
      label: "Pilotless auto-hover engine stop delay",
      group: "Air vehicles",
      type: { kind: "float", min: 0, unit: "s" },
    },
    {
      key: "RoughLandingVerticalSpeedThreshold",
      label: "Rough landing vertical speed threshold",
      group: "Air vehicles",
      type: { kind: "float", min: 0, unit: "m/s" },
    },
  ],
};
