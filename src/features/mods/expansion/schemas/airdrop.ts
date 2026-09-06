import type { SettingsSchema } from "./types";

export const airdropSchema: SettingsSchema = {
  name: "Airdrop",
  title: "Airdrop settings",
  description:
    "Dynamic airdrop event: drop physics, markers, infected spawning. The Containers array (loot tables) stays raw JSON for now.",
  expectedVersion: 8,
  fields: [
    // ---- Markers ----
    {
      key: "ServerMarkerOnDropLocation",
      label: "Server map marker on drop",
      group: "Markers",
      description:
        "When on, a server-wide map marker is placed at the drop spot so every player can see it.",
      type: { kind: "bool01" },
    },
    {
      key: "Server3DMarkerOnDropLocation",
      label: "Server 3D marker on drop",
      group: "Markers",
      description:
        "When on, a world-space 3D marker is visible at the drop location.",
      type: { kind: "bool01" },
    },
    {
      key: "ShowAirdropTypeOnMarker",
      label: "Show airdrop type on marker",
      group: "Markers",
      description:
        "Include the container class name (e.g. Medical / Military) on the map marker.",
      type: { kind: "bool01" },
    },

    // ---- Physics ----
    {
      key: "HideCargoWhileParachuteIsDeployed",
      label: "Hide cargo while parachute deployed",
      group: "Physics",
      type: { kind: "bool01" },
    },
    {
      key: "HeightIsRelativeToGroundLevel",
      label: "Height is relative to ground level",
      group: "Physics",
      description:
        "When on, Height + DropZoneHeight are measured above terrain. Off = absolute world-Y.",
      type: { kind: "bool01" },
    },
    {
      key: "Height",
      label: "Height",
      group: "Physics",
      description: "Spawn height of the plane / drop package.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "DropZoneHeight",
      label: "Drop-zone height",
      group: "Physics",
      description: "Height at which the package is released from the plane.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "FollowTerrainFraction",
      label: "Follow terrain fraction",
      group: "Physics",
      description:
        "0..1. How much the plane's height tracks terrain elevation (0 = flat world-Y, 1 = strict AGL).",
      type: { kind: "float", min: 0, max: 1, step: 0.05 },
    },
    {
      key: "Speed",
      label: "Plane speed",
      group: "Physics",
      type: { kind: "float", min: 0, unit: "m/s" },
    },
    {
      key: "DropZoneSpeed",
      label: "Drop-zone speed",
      group: "Physics",
      description:
        "Plane speed specifically while over the drop zone (can be different from the cruise speed).",
      type: { kind: "float", min: 0, unit: "m/s" },
    },
    {
      key: "Radius",
      label: "Drop radius",
      group: "Physics",
      description: "Horizontal scatter radius around the target point.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "ExplodeAirVehiclesOnCollision",
      label: "Explode air vehicles on collision",
      group: "Physics",
      description:
        "When on, helis / planes that collide with the drop package explode.",
      type: { kind: "bool01" },
    },

    // ---- Infected spawning ----
    {
      key: "InfectedSpawnRadius",
      label: "Infected spawn radius",
      group: "Infected",
      description:
        "Radius around the drop to spawn zombies in. 0 disables the spawn wave.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "InfectedSpawnInterval",
      label: "Infected spawn interval",
      group: "Infected",
      description: "Milliseconds between infected spawn ticks.",
      type: { kind: "int", min: 0, unit: "ms" },
    },
    {
      key: "ItemCount",
      label: "Loot item count",
      group: "Loot",
      description:
        "Number of items rolled into the container from the Usage pool.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "DropZoneProximityDistance",
      label: "Drop-zone proximity distance",
      group: "Mission",
      description:
        "Distance (m) at which the plane considers itself 'over the drop zone'.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "AirdropPlaneClassName",
      label: "Airdrop plane classname",
      group: "Mission",
      description:
        "Override the plane vehicle class. Leave empty to use the default.",
      type: { kind: "string" },
    },
  ],
};
