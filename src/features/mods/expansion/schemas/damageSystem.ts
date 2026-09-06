import type { SettingsSchema } from "./types";

export const damageSystemSchema: SettingsSchema = {
  name: "DamageSystem",
  title: "Damage system settings",
  description:
    "Explosion damage targeting rules. The ExplosiveProjectiles map (projectile class → explosion class) stays on Raw JSON.",
  expectedVersion: 1,
  fields: [
    {
      key: "Enabled",
      label: "Enable Expansion damage system",
      type: { kind: "bool01" },
    },
    {
      key: "CheckForBlockingObjects",
      label: "Check for blocking objects",
      description:
        "When on, explosions only damage targets in line-of-sight (line-of-damage). Off = vanilla through-walls behaviour.",
      type: { kind: "bool01" },
    },
    {
      key: "ExplosionTargets",
      label: "Explosion target classes",
      description:
        "Base classnames explosions are allowed to damage. Defaults cover Expansion base-building + safes.",
      type: { kind: "stringArray" },
    },
  ],
};
