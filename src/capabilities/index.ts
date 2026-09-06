/** Capability tier model — frontend side.
 *
 *  Pairs with `commands::capabilities` on the backend. Two pieces:
 *
 *  1. `ROUTE_REQUIREMENTS` — declarative map from page route to the
 *     capability tiers that route gates on. The single source of
 *     truth used by both `<CapabilityGate>` (per-page Locked /
 *     Active rendering) and the Setup hub (which routes does this
 *     tier unlock?).
 *
 *  2. `useCapabilities()` hook + helpers — wraps the tauri query
 *     for `capabilitiesStatus` with React Query and exposes small
 *     helpers (`isTierReady`, `tier()`, `routeRequirements()`).
 *
 *  Keeping the route → tier mapping in TS rather than the backend
 *  because routes themselves are a frontend concept; reflecting them
 *  into Rust would just churn the boundary every time we add a page. */

import { useQuery } from "@tanstack/react-query";

import * as tauri from "@/lib/tauri";
import type {
  CapabilitiesStatus,
  CapabilityTier,
  CapabilityTierStatus,
} from "@/types/ipc";

/**
 * Route → required tiers. Routes not listed are unrestricted.
 *
 * Conventions:
 *   - Lowest tier first: a route declaring `["workspace"]` implicitly
 *     also requires `connection`, but we don't list it (a profile
 *     without a connection can't have produced a workspace anyway).
 *   - Setup itself is intentionally not gated — it's the page that
 *     resolves the gates.
 *   - Optional capabilities (e.g. mod sources for the reskin wizard)
 *     are listed here only if the dependent route truly fails to
 *     render without them.
 */
export const ROUTE_REQUIREMENTS: Record<string, CapabilityTier[]> = {
  // Mission editors — pull required.
  "/app/items": ["workspace"],
  "/app/events": ["workspace"],
  "/app/loadouts": ["workspace"],
  "/app/gear-sets": ["workspace"],
  "/app/server-config": ["workspace"],
  "/app/gameplay": ["workspace"],
  "/app/globals": ["workspace"],
  "/app/player-spawns": ["workspace"],
  "/app/buildings": ["workspace"],
  "/app/ignorelist": ["workspace"],

  // World — pull required; CE zones additionally needs P: drive
  // because the loot-tier overlay parses an unpacked vanilla file.
  "/app/map": ["workspace"],
  "/app/zones-tiers": ["workspace", "game_data"],
  "/app/health": ["workspace"],

  // Mods — workspace + at least one mod registered.
  "/app/mods": ["workspace", "mods"],

  // Reskin / Modpack.
  "/app/reskin": [], // setup/env page itself
  "/app/reskin/library": ["workspace", "game_data"],
  "/app/reskin/wizard": ["workspace", "game_data"],
  "/app/reskin/classes": ["game_data"],
  "/app/reskin/mod-sources": ["game_data"],
  "/app/reskin/pbos": [],
  "/app/reskin/config": ["game_data"],

  // Building modpack output additionally needs build tools.
  // The Library page surfaces the build button; gate that there.
};

/** Returns the tier list a given route needs. Empty array = no
 *  requirements. Falls back gracefully for routes not in the map. */
export function routeRequirements(route: string): CapabilityTier[] {
  return ROUTE_REQUIREMENTS[route] ?? [];
}

/** Single React Query subscription for the capabilities status.
 *  Cached for 30s — most consumers don't need a second-by-second
 *  refresh and the round-trip touches the filesystem. Setup hub
 *  invalidates this manually after running an inline action. */
export function useCapabilities() {
  return useQuery<CapabilitiesStatus>({
    queryKey: ["capabilities", "status"],
    queryFn: () => tauri.capabilitiesStatus(),
    staleTime: 30_000,
  });
}

export const CAPABILITIES_QUERY_KEY = ["capabilities", "status"] as const;

/** Pull a single tier out of the status payload. Returns `null`
 *  when the status hasn't loaded yet — caller decides how to
 *  render that. */
export function pickTier(
  status: CapabilitiesStatus | undefined,
  tier: CapabilityTier,
): CapabilityTierStatus | null {
  if (!status) return null;
  return status.tiers.find((t) => t.tier === tier) ?? null;
}

/** True when every tier in `tiers` is `ready` or `stale`. Stale
 *  data still unlocks the editor — we surface staleness as a
 *  soft warning, not a hard gate. Returns false when the status
 *  hasn't loaded yet. */
export function tiersReady(
  status: CapabilitiesStatus | undefined,
  tiers: CapabilityTier[],
): boolean {
  if (!status) return false;
  return tiers.every((t) => {
    const found = status.tiers.find((s) => s.tier === t);
    return (
      found &&
      (found.state === "ready" || found.state === "stale")
    );
  });
}

/** First tier in `required` that isn't ready — drives the Locked
 *  state's "needs: <tier>" headline. Returns `null` when all are
 *  ready or the status hasn't loaded. */
export function firstUnmet(
  status: CapabilitiesStatus | undefined,
  required: CapabilityTier[],
): CapabilityTierStatus | null {
  if (!status) return null;
  for (const tier of required) {
    const t = status.tiers.find((s) => s.tier === tier);
    if (!t) continue;
    if (t.state !== "ready" && t.state !== "stale") {
      return t;
    }
  }
  return null;
}
