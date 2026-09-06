import { useModsScan } from "@/hooks/useMods";
import { useItemsSnapshot } from "@/hooks/useItems";
import type { ModInfo } from "@/types/ipc";

import { useModsActivation } from "./useModsActivation";

export interface MutedClassnameState {
  muted: boolean;
  /** Short tooltip text for the classname row when muted. */
  reason?: string;
  /** Mod display name for UI copy. */
  modLabel?: string;
}

/**
 * Returns a callback `(classname) => MutedClassnameState` that
 * classname pickers can use to dim entries contributed by a mod that
 * the operator has toggled **off** in the Mods page.
 *
 * The bridge has three hops:
 *   1. The items registry tags each `ItemType` with `modId` =
 *      the CE folder name (e.g. `"expansion_ce"`) because that's
 *      where the Rust parser found the classname.
 *   2. The mods scan maps CE folders back to a `ModInfo` row, which
 *      carries the stable `known` slug + display name.
 *   3. The activation store keys off the stable slug. If the slug
 *      resolves to `"off"`, the classname is muted.
 *
 * Vanilla / custom classnames (no `modId`) are never muted — same
 * policy as the autocomplete dropdown, which always shows them.
 */
export function useMutedClassnameReason(): (
  name: string,
) => MutedClassnameState {
  const items = useItemsSnapshot();
  const scan = useModsScan();
  const activation = useModsActivation();

  // The React Compiler handles memoisation for us — computing the
  // maps on each render is cheap (few hundred classnames at most).
  // Callers get a fresh closure; if they need stability (e.g. to
  // pass into a memoised child), they can wrap it themselves.
  const classnameToCeFolder = new Map<string, string>();
  for (const it of items.data?.items ?? []) {
    if (it.source === "mod" && it.modId) {
      classnameToCeFolder.set(it.name, it.modId);
    }
  }

  // Reverse index: CE folder → { activationKey, displayLabel }. Any
  // one ModInfo can claim multiple CE folders, so map each folder
  // individually.
  const ceFolderToMod = new Map<
    string,
    { activationKey: string; label: string }
  >();
  for (const m of scan.data?.mods ?? []) {
    const key = modIdFor(m);
    for (const folder of m.ceFolders) {
      ceFolderToMod.set(folder, { activationKey: key, label: m.name });
    }
  }

  return (name: string): MutedClassnameState => {
    const ceFolder = classnameToCeFolder.get(name);
    if (!ceFolder) return { muted: false };
    const mod = ceFolderToMod.get(ceFolder);
    if (!mod) return { muted: false };
    const state = activation.data?.activation[mod.activationKey];
    if (state !== "off") return { muted: false };
    return {
      muted: true,
      reason: `${mod.label} is toggled off on the Mods page.`,
      modLabel: mod.label,
    };
  };
}

/** Must match `modIdFor` in `features/mods/ModsPage.tsx`. Keeping
 *  one implementation at each call-site beats a cross-module
 *  dependency; change both in lockstep if the slugging rules
 *  change. */
function modIdFor(m: ModInfo): string {
  if (m.known !== "other") return m.known.toLowerCase();
  const src = (m.folderName || m.name).toLowerCase();
  return src.replace(/[^a-z0-9_-]/g, "_");
}
