import type { SettingsSchema } from "./types";

export const garageSchema: SettingsSchema = {
  name: "Garage",
  title: "Garage settings",
  description:
    "Vehicle storage — how many, how far, cost to store, tier limits.",
  expectedVersion: 6,
  fields: [
    {
      key: "Enabled",
      label: "Enable garage",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "AllowStoringDEVehicles",
      label: "Allow storing DayZ-Expansion vehicles",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "GarageMode",
      label: "Garage mode",
      group: "General",
      description:
        "0 = free anywhere, 1 = parking-meter required, 2 = tier-based. See Expansion wiki.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "GarageStoreMode",
      label: "Store mode",
      group: "General",
      description: "0 = instant, 1 = animated store sequence.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "GarageRetrieveMode",
      label: "Retrieve mode",
      group: "General",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxStorableVehicles",
      label: "Max storable vehicles per player",
      group: "Limits",
      type: { kind: "int", min: 0 },
    },
    {
      key: "VehicleSearchRadius",
      label: "Vehicle search radius",
      group: "Limits",
      description: "Metres around the garage node where a vehicle is findable.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "MaxDistanceFromStoredPosition",
      label: "Max distance from stored position",
      group: "Limits",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "CanStoreWithCargo",
      label: "Allow storing with cargo",
      group: "Cargo",
      type: { kind: "bool01" },
    },
    {
      key: "UseVirtualStorageForCargo",
      label: "Use virtual storage for cargo",
      group: "Cargo",
      description:
        "Removes physical cargo objects while in garage to save server memory.",
      type: { kind: "bool01" },
    },
    {
      key: "NeedKeyToStore",
      label: "Need key to store",
      group: "Ownership",
      type: { kind: "bool01" },
    },
    {
      key: "EnableGroupFeatures",
      label: "Enable party / group features",
      group: "Ownership",
      type: { kind: "bool01" },
    },
    {
      key: "GroupStoreMode",
      label: "Group store mode",
      group: "Ownership",
      type: { kind: "int", min: 0 },
    },
    {
      key: "EnableMarketFeatures",
      label: "Enable market features",
      group: "Economy",
      type: { kind: "bool01" },
    },
    {
      key: "StorePricePercent",
      label: "Store price (% of vehicle market value)",
      group: "Economy",
      type: { kind: "float", min: 0, unit: "%" },
    },
    {
      key: "StaticStorePrice",
      label: "Static store price",
      group: "Economy",
      description:
        "Flat fee applied on top of (or instead of) the percentage when set.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxStorableTier1",
      label: "Max storable — Tier 1",
      group: "Tiers",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxStorableTier2",
      label: "Max storable — Tier 2",
      group: "Tiers",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxStorableTier3",
      label: "Max storable — Tier 3",
      group: "Tiers",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxRangeTier1",
      label: "Max range — Tier 1",
      group: "Tiers",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "MaxRangeTier2",
      label: "Max range — Tier 2",
      group: "Tiers",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "MaxRangeTier3",
      label: "Max range — Tier 3",
      group: "Tiers",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "EntityWhitelist",
      label: "Extra storable classnames",
      group: "Whitelists",
      description: "Additional entity classes the garage accepts.",
      type: { kind: "stringArray" },
    },
    {
      key: "ParkingMeterEnableFlavor",
      label: "Enable parking meter flavour text",
      group: "Misc",
      type: { kind: "bool01" },
    },
  ],
};
