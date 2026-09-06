/**
 * Per-install enablement state for optional modules (addons).
 *
 * A local toggle persisted to localStorage. Every registered module is
 * enabled by default on first run (see `applyDefaultAddons`); users can
 * turn individual modules off from Settings → Modules and the choice
 * persists.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AddonsState {
  enabled: Record<string, boolean>;
  setEnabled: (id: string, enabled: boolean) => void;
}

export const useAddonsStore = create<AddonsState>()(
  persist(
    (set) => ({
      enabled: {},
      setEnabled: (id, enabled) =>
        set((s) => ({ enabled: { ...s.enabled, [id]: enabled } })),
    }),
    { name: "dzmgr.addons" },
  ),
);

/** Hook form — re-renders when the addon's toggle flips. */
export function useIsAddonEnabled(id: string): boolean {
  return useAddonsStore((s) => s.enabled[id] ?? false);
}

/** Non-reactive read. Only use outside React, or when you genuinely
 *  don't want to re-render on toggle changes. */
export function isAddonEnabled(id: string): boolean {
  return useAddonsStore.getState().enabled[id] ?? false;
}

/** Enable every registered module on first run. Modules the user has
 *  not made an explicit choice about (no entry in the persisted map)
 *  default to on; a deliberate toggle-off in Settings is preserved. */
export function applyDefaultAddons(addonIds: string[]): void {
  const state = useAddonsStore.getState();
  let changed = false;
  const next = { ...state.enabled };
  for (const id of addonIds) {
    if (next[id] === undefined) {
      next[id] = true;
      changed = true;
    }
  }
  if (changed) {
    useAddonsStore.setState({ enabled: next });
  }
}
