import type { SettingsSchema } from "./types";

export const aiSchema: SettingsSchema = {
  name: "AI",
  title: "AI settings",
  description:
    "Expansion AI (eAI) tuning — accuracy, aggression, recruitment. The LightingConfigMinNightVisibilityMeters map and PlayerFactions list stay on the Raw JSON tab.",
  expectedVersion: 20,
  fields: [
    {
      key: "AccuracyMin",
      label: "Accuracy (min)",
      group: "Combat",
      description: "0..1 hit-chance baseline for AI firing.",
      type: { kind: "float", min: 0, max: 1, step: 0.05 },
    },
    {
      key: "AccuracyMax",
      label: "Accuracy (max)",
      group: "Combat",
      description: "0..1 upper accuracy bound.",
      type: { kind: "float", min: 0, max: 1, step: 0.05 },
    },
    {
      key: "DamageMultiplier",
      label: "Damage multiplier (dealt)",
      group: "Combat",
      type: { kind: "float", min: 0 },
    },
    {
      key: "DamageReceivedMultiplier",
      label: "Damage multiplier (received)",
      group: "Combat",
      type: { kind: "float", min: 0 },
    },
    {
      key: "ShoryukenChance",
      label: "Shoryuken chance",
      group: "Combat",
      description:
        "Chance per melee swing for a heavy uppercut. 0 disables the move.",
      type: { kind: "float", min: 0, max: 1, step: 0.01 },
    },
    {
      key: "ShoryukenDamageMultiplier",
      label: "Shoryuken damage multiplier",
      group: "Combat",
      type: { kind: "float", min: 0 },
    },
    {
      key: "ThreatDistanceLimit",
      label: "Threat distance limit",
      group: "Awareness",
      description: "Metres at which the AI starts tracking a threat.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "NoiseInvestigationDistanceLimit",
      label: "Noise investigation distance",
      group: "Awareness",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "MaxFlankingDistance",
      label: "Max flanking distance",
      group: "Awareness",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "EnableFlankingOutsideCombat",
      label: "Flank outside combat",
      group: "Awareness",
      type: { kind: "bool01" },
    },
    {
      key: "AggressionTimeout",
      label: "Aggression timeout",
      group: "Awareness",
      description: "Seconds before an AI disengages from a lost target.",
      type: { kind: "float", min: 0, unit: "s" },
    },
    {
      key: "GuardAggressionTimeout",
      label: "Guard aggression timeout",
      group: "Awareness",
      type: { kind: "float", min: 0, unit: "s" },
    },
    {
      key: "SniperProneDistanceThreshold",
      label: "Sniper prone distance threshold",
      group: "Awareness",
      description:
        "Metres above which an AI with a sniper rifle drops prone. 0 = never.",
      type: { kind: "float", min: 0, unit: "m" },
    },
    {
      key: "Vaulting",
      label: "Enable vaulting",
      group: "Movement",
      type: { kind: "bool01" },
    },
    {
      key: "FormationScale",
      label: "Formation scale",
      group: "Movement",
      description: "Multiplier on squad formation spacing.",
      type: { kind: "float", min: 0 },
    },
    {
      key: "PreventClimb",
      label: "Prevent climb classes",
      group: "Movement",
      description:
        "Object classnames the AI refuses to climb on (prevents stuck-on-fence edge cases).",
      type: { kind: "stringArray" },
    },
    {
      key: "CanRecruitFriendly",
      label: "Can recruit friendly AI",
      group: "Recruitment",
      type: { kind: "bool01" },
    },
    {
      key: "CanRecruitGuards",
      label: "Can recruit guards",
      group: "Recruitment",
      type: { kind: "bool01" },
    },
    {
      key: "MaxRecruitableAI",
      label: "Max recruitable AI per player",
      group: "Recruitment",
      type: { kind: "int", min: 0 },
    },
    {
      key: "Admins",
      label: "AI admins (SteamID64)",
      group: "Admin",
      description:
        "Players granted admin control over AI (spawn / despawn / command).",
      type: { kind: "stringArray" },
    },
    {
      key: "Manners",
      label: "Manners",
      group: "Flavour",
      description:
        "Controls AI chat / voice politeness. 0 = silent, higher = more talkative.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MemeLevel",
      label: "Meme level",
      group: "Flavour",
      description:
        "0..n. Controls how often the AI drops meme lines into voice chat.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "EnableZombieVehicleAttackHandler",
      label: "Zombie vehicle attack handler",
      group: "Integration",
      type: { kind: "bool01" },
    },
    {
      key: "EnableZombieVehicleAttackPhysics",
      label: "Zombie vehicle attack physics",
      group: "Integration",
      type: { kind: "bool01" },
    },
    {
      key: "OverrideClientWeaponFiring",
      label: "Override client weapon firing",
      group: "Integration",
      type: { kind: "bool01" },
    },
    {
      key: "RecreateWeaponNetworkRepresentation",
      label: "Recreate weapon network representation",
      group: "Integration",
      type: { kind: "bool01" },
    },
    {
      key: "LogAIHitBy",
      label: "Log AI hit-by events",
      group: "Logging",
      type: { kind: "bool01" },
    },
    {
      key: "LogAIKilled",
      label: "Log AI killed events",
      group: "Logging",
      type: { kind: "bool01" },
    },
  ],
};
