/**
 * Addon registry — collects addons registered by side-effect imports
 * from `src/addons/index.ts` and exposes read helpers for the app
 * shell (App.tsx routes, Sidebar.tsx sections, Settings panel).
 *
 * Registration happens at import time before any component mounts,
 * so the order of `import` statements in `src/addons/index.ts` is the
 * order addons appear in Settings and the sidebar.
 */

import { useAddonsStore } from "@/stores/addonsStore";

import type { Addon } from "./types";

const addons = new Map<string, Addon>();

/** Register an addon. Subsequent calls with the same id log a warning
 *  and no-op — addon definitions are expected to live in exactly one
 *  file each. */
export function registerAddon(addon: Addon): void {
  if (addons.has(addon.id)) {
    // eslint-disable-next-line no-console
    console.warn(`[addons] duplicate registration: ${addon.id}`);
    return;
  }
  addons.set(addon.id, addon);
}

/** Every addon that has been registered, enabled or not. Settings
 *  iterates this to render the Addons panel. */
export function getAllAddons(): Addon[] {
  return Array.from(addons.values());
}

/** Reactive read of the enabled set. Re-renders callers when the
 *  toggle state flips, so App.tsx's route list stays in sync with
 *  the Settings panel. */
export function useEnabledAddons(): Addon[] {
  const enabled = useAddonsStore((s) => s.enabled);
  return getAllAddons().filter((a) => enabled[a.id] === true);
}
