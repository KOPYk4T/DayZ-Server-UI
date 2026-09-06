import type { SettingsSchema, FieldSpec } from "./types";

const toggle = (key: string, label: string, group: string): FieldSpec => ({
  key,
  label,
  group,
  type: { kind: "bool01" },
});

const messageType = (key: string, label: string, group: string): FieldSpec => ({
  key,
  label,
  group,
  description:
    "0 = off, 1 = toast, 2 = popup, 3 = chat line. Values depend on Expansion version.",
  type: { kind: "int", min: 0, max: 3 },
});

export const notificationSchema: SettingsSchema = {
  name: "Notification",
  title: "Notification settings",
  description:
    "Controls notifications for player join/leave, airdrops, territory, and the kill-feed. Per-kill-feed-category toggles decide whether each death cause broadcasts.",
  expectedVersion: 5,
  fields: [
    toggle("EnableNotification", "Enable notifications", "General"),

    toggle("ShowPlayerJoinServer", "Show player join", "Join / leave"),
    messageType("JoinMessageType", "Join message type", "Join / leave"),
    toggle("ShowPlayerLeftServer", "Show player leave", "Join / leave"),
    messageType("LeftMessageType", "Leave message type", "Join / leave"),

    toggle("ShowAirdropStarted", "Show airdrop started", "Airdrops"),
    toggle("ShowAirdropClosingOn", "Show airdrop closing in", "Airdrops"),
    toggle("ShowAirdropDropped", "Show airdrop dropped", "Airdrops"),
    toggle("ShowAirdropEnded", "Show airdrop ended", "Airdrops"),
    toggle(
      "ShowPlayerAirdropStarted",
      "Show player airdrop started",
      "Airdrops",
    ),
    toggle(
      "ShowPlayerAirdropClosingOn",
      "Show player airdrop closing in",
      "Airdrops",
    ),
    toggle(
      "ShowPlayerAirdropDropped",
      "Show player airdrop dropped",
      "Airdrops",
    ),

    toggle(
      "ShowTerritoryNotifications",
      "Show territory notifications",
      "Territory",
    ),

    toggle("EnableKillFeed", "Enable kill feed", "Kill feed"),
    messageType("KillFeedMessageType", "Kill feed message type", "Kill feed"),
    toggle("EnableKillFeedDiscordMsg", "Mirror to Discord", "Kill feed"),

    toggle("KillFeedFall", "Fall", "Kill feed causes"),
    toggle("KillFeedCarHitDriver", "Car hit (driver)", "Kill feed causes"),
    toggle("KillFeedCarHitNoDriver", "Car hit (no driver)", "Kill feed causes"),
    toggle("KillFeedCarCrash", "Car crash", "Kill feed causes"),
    toggle("KillFeedCarCrashCrew", "Car crash crew", "Kill feed causes"),
    toggle("KillFeedHeliHitDriver", "Heli hit (driver)", "Kill feed causes"),
    toggle(
      "KillFeedHeliHitNoDriver",
      "Heli hit (no driver)",
      "Kill feed causes",
    ),
    toggle("KillFeedHeliCrash", "Heli crash", "Kill feed causes"),
    toggle("KillFeedHeliCrashCrew", "Heli crash crew", "Kill feed causes"),
    toggle("KillFeedBoatHitDriver", "Boat hit (driver)", "Kill feed causes"),
    toggle(
      "KillFeedBoatHitNoDriver",
      "Boat hit (no driver)",
      "Kill feed causes",
    ),
    toggle("KillFeedBoatCrash", "Boat crash", "Kill feed causes"),
    toggle("KillFeedBoatCrashCrew", "Boat crash crew", "Kill feed causes"),
    toggle("KillFeedBarbedWire", "Barbed wire", "Kill feed causes"),
    toggle("KillFeedFire", "Fire", "Kill feed causes"),
    toggle(
      "KillFeedWeaponExplosion",
      "Weapon explosion",
      "Kill feed causes",
    ),
    toggle("KillFeedDehydration", "Dehydration", "Kill feed causes"),
    toggle("KillFeedStarvation", "Starvation", "Kill feed causes"),
    toggle("KillFeedBleeding", "Bleeding", "Kill feed causes"),
    toggle("KillFeedStatusEffects", "Status effects", "Kill feed causes"),
    toggle("KillFeedSuicide", "Suicide", "Kill feed causes"),
    toggle("KillFeedWeapon", "Weapon (firearm)", "Kill feed causes"),
    toggle("KillFeedMeleeWeapon", "Melee weapon", "Kill feed causes"),
    toggle("KillFeedBarehands", "Barehands", "Kill feed causes"),
    toggle("KillFeedInfected", "Infected", "Kill feed causes"),
    toggle("KillFeedAnimal", "Animal", "Kill feed causes"),
    toggle("KillFeedAI", "AI", "Kill feed causes"),
    toggle("KillFeedDrowned", "Drowning", "Kill feed causes"),
    toggle("KillFeedKilledUnknown", "Killed (unknown)", "Kill feed causes"),
    toggle("KillFeedDiedUnknown", "Died (unknown)", "Kill feed causes"),
  ],
};
