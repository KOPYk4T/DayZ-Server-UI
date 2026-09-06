/**
 * Addon (module) system — optional feature bundles (Mods, Reskin, …)
 * that can be toggled per-install from Settings → Modules.
 *
 * Each addon self-registers at import time with `registerAddon(...)`
 * and contributes:
 *
 * - **Routes** added under `/app/*`, rendered only when the addon is
 *   enabled. When disabled, navigating to an addon route falls
 *   through to the app-level 404 placeholder.
 * - **A sidebar section** — its own top-level group. Rendered below
 *   the base sections so the fixed base navigation stays predictable.
 *   Rendered as a React component so the addon can call its own hooks
 *   for dynamic entries (e.g. Mods' per-detected-mod sub-nav).
 *
 * Base-app features (Items, Events, Map, Sync, etc.) are *not* addons
 * and stay hardcoded. An addon is only for optional, self-contained
 * feature bundles.
 */

import type { ComponentType, ReactNode } from "react";

export interface AddonRoute {
  /** Relative to `/app/*` — same semantics as the hardcoded base
   *  routes in `App.tsx`. */
  path: string;
  element: ReactNode;
}

export interface Addon {
  /** Stable machine id — used as the key in `addonsStore`. Never
   *  rename (it keys persisted enablement state). */
  id: string;
  /** Display name shown in Settings → Modules. */
  name: string;
  /** One-paragraph description shown in the Modules settings panel. */
  description: string;
  /** Routes contributed to the app shell. Rendered only while the
   *  addon is enabled. */
  routes?: AddonRoute[];
  /** Rendered as a dedicated sidebar group after the base groups.
   *  The component may call hooks — Mods uses this to render its
   *  per-detected-mod sub-entries from `useModsScan`. */
  SidebarSection?: ComponentType;
}
