import type { SettingsSchema, FieldSpec } from "./types";

// Logs are straightforward 0/1 toggles — one per subsystem. We list
// them all in one group because any attempt to further split looks
// arbitrary.
const toggle = (key: string, label: string): FieldSpec => ({
  key,
  label,
  group: "Log subsystems",
  type: { kind: "bool01" },
});

export const logsSchema: SettingsSchema = {
  name: "Logs",
  title: "Logs settings",
  description:
    "Enable per-subsystem logging. All toggles write into the Expansion log file alongside standard DayZ RPT output.",
  expectedVersion: 8,
  fields: [
    toggle("Safezone", "Safezone"),
    toggle("AdminTools", "Admin tools"),
    toggle("ExplosionDamageSystem", "Explosion damage system"),
    toggle("VehicleCarKey", "Vehicle car key"),
    toggle("VehicleTowing", "Vehicle towing"),
    toggle("VehicleLockPicking", "Vehicle lock picking"),
    toggle("VehicleDestroyed", "Vehicle destroyed"),
    toggle("VehicleAttachments", "Vehicle attachments"),
    toggle("VehicleEnter", "Vehicle enter"),
    toggle("VehicleLeave", "Vehicle leave"),
    toggle("VehicleDeleted", "Vehicle deleted"),
    toggle("VehicleEngine", "Vehicle engine"),
    toggle("BaseBuildingRaiding", "Base-building raiding"),
    toggle("CodeLockRaiding", "Code lock raiding"),
    toggle("Territory", "Territory"),
    toggle("Killfeed", "Killfeed"),
    toggle("SpawnSelection", "Spawn selection"),
    toggle("Party", "Party"),
    toggle("MissionAirdrop", "Mission / airdrop"),
    toggle("Chat", "Chat"),
    toggle("Market", "Market"),
    toggle("ATM", "ATM"),
    toggle("AIGeneral", "AI general"),
    toggle("AIPatrol", "AI patrol"),
    toggle("AIObjectPatrol", "AI object patrol"),
    toggle("LogToScripts", "Log to scripts"),
    toggle("LogToADM", "Log to .ADM"),
    toggle("Hardline", "Hardline"),
    toggle("Garage", "Garage"),
    toggle("VehicleCover", "Vehicle cover"),
    toggle("EntityStorage", "Entity storage"),
    toggle("Quests", "Quests"),
  ],
};
