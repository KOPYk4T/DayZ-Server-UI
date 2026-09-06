import { useMemo } from "react";

import { useModsScan } from "@/hooks/useMods";

import { MOD_MODULES, type ModModule, type VanillaSystem } from "./modules";
import { useModsActivation } from "./useModsActivation";

export interface OverridingMod {
  module: ModModule;
  /** Whether this mod was actually detected in the current workspace
   *  (vs. declared in the registry but not installed). Only detected
   *  + active mods surface in banners. */
  detected: boolean;
  /** Whether the operator has marked it active — default `true` for
   *  detected mods that were never toggled. */
  active: boolean;
}

/**
 * Vanilla editors call `useOverridingMods("player-spawns")` to get
 * the list of mods currently claiming to configure that same
 * system. The `VanillaOverriddenBanner` component filters this to
 * detected + active mods; we return the full list so callers can
 * surface richer state if they want to (e.g. "this mod is installed
 * but off — you can switch to it here").
 */
export function useOverridingMods(system: VanillaSystem): OverridingMod[] {
  const scan = useModsScan();
  const activation = useModsActivation();
  return useMemo(() => {
    return MOD_MODULES.filter((m) => m.overrides.includes(system)).map(
      (module) => {
        const detected = scan.data ? module.isDetected(scan.data) : false;
        const active = activation.data?.activation[module.known] !== "off";
        return { module, detected, active };
      },
    );
  }, [system, scan.data, activation.data]);
}

/** Filter helper used by the banner — callers that only want the
 *  UX-relevant subset (installed + currently on) can skip the
 *  detection/activation logic. */
export function activeOverridingMods(
  list: OverridingMod[],
): OverridingMod[] {
  return list.filter((o) => o.detected && o.active);
}
