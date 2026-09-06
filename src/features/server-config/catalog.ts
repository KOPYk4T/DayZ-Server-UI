/**
 * Documentation catalogue for common `serverDZ.cfg` keys.
 * Same shape as the globals catalogue — `group` buckets them in the
 * UI, `summary` is the tooltip headline, `detail` the longer body.
 */

export interface ServerCfgKeyInfo {
  group: CfgGroup;
  summary: string;
  detail?: string;
  unit?: string;
  /** What shape of segment to create when the user adds this key
   *  from scratch. `"array"` means `key[] = { … };`; anything else
   *  is a scalar with the corresponding typed input. Defaults to
   *  `"string"`. */
  shape?: "string" | "integer" | "float" | "array";
}

export type CfgGroup =
  | "identity"
  | "access"
  | "players"
  | "battleye"
  | "messages"
  | "time"
  | "logging"
  | "networking"
  | "flags"
  | "misc";

export const CFG_GROUPS: { id: CfgGroup; label: string }[] = [
  { id: "identity", label: "Server identity" },
  { id: "access", label: "Access & passwords" },
  { id: "players", label: "Players & queue" },
  { id: "battleye", label: "BattlEye / verification" },
  { id: "messages", label: "Motd & messages" },
  { id: "time", label: "Time / day-night" },
  { id: "logging", label: "Logging" },
  { id: "networking", label: "Networking" },
  { id: "flags", label: "Gameplay flags" },
  { id: "misc", label: "Other" },
];

export const CFG_KEY_CATALOG: Record<string, ServerCfgKeyInfo> = {
  hostname: {
    group: "identity",
    shape: "string",
    summary: "Server name shown in the community browser.",
  },
  password: {
    group: "access",
    shape: "string",
    summary: "Join password. Empty = public. Stored in plaintext in the file.",
    detail:
      "Set a password here to gate server access. Consider using a private password file / per-player whitelist for anything more than casual gating.",
  },
  passwordAdmin: {
    group: "access",
    shape: "string",
    summary: "RCON / admin password. Keep this secret.",
    detail:
      "Used for in-game #admin login and for external RCON tools. Rotate if the cfg file is ever checked into a shared repo.",
  },
  maxPlayers: {
    group: "players",
    shape: "integer",
    summary: "Hard cap on concurrent players.",
    detail:
      "Vanilla DayZ Server caps around 60 for stability, but modded rigs can go higher. Tune alongside memory / CPU headroom.",
  },
  verifySignatures: {
    group: "battleye",
    shape: "integer",
    summary: "Require signed addons (BattlEye): 0=off, 1=v1, 2=v2.",
    detail:
      "2 is the modern recommended value. Players without matching signed PBOs get kicked on join.",
  },
  forceSameBuild: {
    group: "battleye",
    shape: "integer",
    summary: "1 = require client build to match server build.",
  },
  motd: {
    group: "messages",
    shape: "array",
    summary: "Lines shown to joining players (edit the array below).",
  },
  motdInterval: {
    group: "messages",
    shape: "integer",
    summary: "Seconds between motd re-broadcasts to connected players.",
    unit: "s",
  },
  timeStampFormat: {
    group: "logging",
    shape: "string",
    summary: "Log timestamp format: \"None\" | \"Short\" | \"Full\".",
  },
  logAverageFps: {
    group: "logging",
    shape: "integer",
    summary: "Interval (s) between server FPS log lines.",
    unit: "s",
  },
  logMemory: {
    group: "logging",
    shape: "integer",
    summary: "Interval (s) between memory usage log lines.",
    unit: "s",
  },
  logPlayers: {
    group: "logging",
    shape: "integer",
    summary: "Interval (s) between online-player count log lines.",
    unit: "s",
  },
  logFile: {
    group: "logging",
    shape: "string",
    summary: "Log file name (relative to the server root).",
  },
  steamQueryPort: {
    group: "networking",
    shape: "integer",
    summary: "UDP port for the Steam server browser query.",
    detail:
      "Defaults to 27016. Must be reachable from the internet for your server to appear in the community list.",
  },
  disableVoN: {
    group: "flags",
    shape: "integer",
    summary: "1 = disable voice-over-net.",
  },
  vonCodecQuality: {
    group: "flags",
    shape: "integer",
    summary: "0..30 — VoN audio quality (higher = better, more bandwidth).",
  },
  disable3rdPerson: {
    group: "flags",
    shape: "integer",
    summary: "1 = force first-person only.",
  },
  disableCrosshair: {
    group: "flags",
    shape: "integer",
    summary: "1 = hide the crosshair HUD element.",
  },
  respawnTime: {
    group: "players",
    shape: "integer",
    summary: "Seconds before a dead player can respawn.",
    unit: "s",
  },
  lightingConfig: {
    group: "flags",
    shape: "integer",
    summary: "0 = bright night, 1 = full dark night (vanilla).",
  },
  timeAcceleration: {
    group: "time",
    shape: "float",
    summary:
      "Day-cycle speed multiplier (1 = real-time, 12 ≈ 2h day).",
    detail:
      "Applied server-side. Combine with `timeNightAcceleration` to make nights shorter without shortening days.",
  },
  timeNightAcceleration: {
    group: "time",
    shape: "float",
    summary: "Extra multiplier applied at night.",
    detail:
      "Stacks with `timeAcceleration`. A value of 4 with timeAcceleration=12 makes nights pass 48× faster.",
  },
  disablePersonalLight: {
    group: "flags",
    shape: "integer",
    summary: "1 = disable the personal torchlight helpers.",
  },
  adminLogPlayerHitsOnly: {
    group: "logging",
    shape: "integer",
    summary: "1 = only log hits involving players (filters infected).",
  },
  adminLogPlacement: {
    group: "logging",
    shape: "integer",
    summary: "1 = log base-building placements.",
  },
  adminLogBuildActions: {
    group: "logging",
    shape: "integer",
    summary: "1 = log base-building construction actions.",
  },
  adminLogPlayerList: {
    group: "logging",
    shape: "integer",
    summary: "1 = log player list every adminLogPlayerList interval.",
  },
  enableDebugMonitor: {
    group: "flags",
    shape: "integer",
    summary: "1 = expose F1 debug overlay with health / stamina / temp.",
  },
  serverTimeAcceleration: {
    group: "time",
    shape: "float",
    summary: "Alias for timeAcceleration (older configs).",
  },
  instanceId: {
    group: "identity",
    shape: "integer",
    summary: "Numeric instance ID of the server (logs / RCON).",
  },
  serverFpsLimit: {
    group: "networking",
    shape: "integer",
    summary: "Hard cap on server tick rate (FPS). Typical 40–120.",
  },
};

export function infoFor(key: string): ServerCfgKeyInfo | undefined {
  return CFG_KEY_CATALOG[key];
}

export function groupFor(key: string): CfgGroup {
  return CFG_KEY_CATALOG[key]?.group ?? "misc";
}
