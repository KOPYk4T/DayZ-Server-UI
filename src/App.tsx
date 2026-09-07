import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { useEnabledAddons } from "@/addons";
import { GatedByRoute } from "@/capabilities/CapabilityGate";
import { AppShell } from "@/components/layout/AppShell";
import { RequireProfile } from "@/components/RequireProfile";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BackupsPage } from "@/features/backups/BackupsPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { GettingStartedPage } from "@/features/landing/GettingStartedPage";
import { SetupPage } from "@/features/setup/SetupPage";
import { TutorialsPage } from "@/features/tutorials/TutorialsPage";
import { MissionLandingPage } from "@/features/landing/MissionLandingPage";
import { ServerLandingPage } from "@/features/landing/ServerLandingPage";
import { SpawnFlowPage } from "@/features/landing/SpawnFlowPage";
import { EventsPage } from "@/features/events/EventsPage";
import { ItemsPage } from "@/features/items/ItemsPage";
import { BuildingsPage } from "@/features/buildings/BuildingsPage";
import { GameplayPage } from "@/features/gameplay/GameplayPage";
import { GearSetsPage } from "@/features/gear-sets/GearSetsPage";
import { GlobalsPage } from "@/features/globals/GlobalsPage";
import { IgnoreListPage } from "@/features/ignorelist/IgnoreListPage";
import { HealthPage } from "@/features/health/HealthPage";
import { ServerConfigPage } from "@/features/server-config/ServerConfigPage";
import { LoadoutsPage } from "@/features/loadouts/LoadoutsPage";
import { MapPage } from "@/features/map/MapPage";
import { PlayerSpawnsPage } from "@/features/player-spawns/PlayerSpawnsPage";
import { ZonesTiersPage } from "@/features/zones-tiers/ZonesTiersPage";
import { Placeholder } from "@/features/_placeholder/Placeholder";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SyncPage } from "@/features/sync/SyncPage";
import { ProfilePickerPage } from "@/pages/ProfilePickerPage";
import { useUIStore } from "@/stores/uiStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  // Apply the persisted theme on first paint — Zustand's `persist`
  // rehydrates after render, so we force a sync here too.
  const theme = useUIStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  // Re-renders when any addon toggles — route list stays in sync
  // with the Settings → Addons panel.
  const enabledAddons = useEnabledAddons();

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/profiles" replace />} />
      <Route path="/profiles" element={<ProfilePickerPage />} />
      <Route
        path="/app"
        element={
          <RequireProfile>
            <AppShell />
          </RequireProfile>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="getting-started" element={<GettingStartedPage />} />
        <Route path="tutorials" element={<TutorialsPage />} />
        <Route path="spawn-flow" element={<SpawnFlowPage />} />
        <Route path="mission" element={<MissionLandingPage />} />
        <Route path="server" element={<ServerLandingPage />} />
        <Route path="deploy" element={<Navigate to="sync" replace />} />
        <Route path="sync" element={<SyncPage />} />
        <Route path="backups" element={<BackupsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Gated routes — `<GatedByRoute>` looks the route up in
            `ROUTE_REQUIREMENTS` and renders the Locked / Stale /
            Active state accordingly. The route's `path` attribute
            and the `route` prop intentionally duplicate (registry
            keys include the `/app` prefix; `path` is relative).
            Keeping the registry as the single source of truth for
            tier requirements. */}
        <Route
          path="items"
          element={
            <GatedByRoute route="/app/items" pageLabel="The Items editor">
              <ItemsPage />
            </GatedByRoute>
          }
        />
        <Route
          path="events"
          element={
            <GatedByRoute route="/app/events" pageLabel="The Events editor">
              <EventsPage />
            </GatedByRoute>
          }
        />
        <Route
          path="loadouts"
          element={
            <GatedByRoute
              route="/app/loadouts"
              pageLabel="The Spawnables editor"
            >
              <LoadoutsPage />
            </GatedByRoute>
          }
        />
        <Route
          path="zones-tiers"
          element={
            <GatedByRoute
              route="/app/zones-tiers"
              pageLabel="Zones & Tiers"
            >
              <ZonesTiersPage />
            </GatedByRoute>
          }
        />
        <Route
          path="player-spawns"
          element={
            <GatedByRoute
              route="/app/player-spawns"
              pageLabel="Player Spawns"
            >
              <PlayerSpawnsPage />
            </GatedByRoute>
          }
        />
        <Route
          path="map"
          element={
            <GatedByRoute route="/app/map" pageLabel="The Map editor">
              <MapPage />
            </GatedByRoute>
          }
        />
        <Route
          path="health"
          element={
            <GatedByRoute route="/app/health" pageLabel="Health & Lint">
              <HealthPage />
            </GatedByRoute>
          }
        />
        <Route
          path="gear-sets"
          element={
            <GatedByRoute
              route="/app/gear-sets"
              pageLabel="Gear sets"
            >
              <GearSetsPage />
            </GatedByRoute>
          }
        />
        <Route
          path="globals"
          element={
            <GatedByRoute
              route="/app/globals"
              pageLabel="Globals & Messages"
            >
              <GlobalsPage />
            </GatedByRoute>
          }
        />
        <Route
          path="gameplay"
          element={
            <GatedByRoute
              route="/app/gameplay"
              pageLabel="The Gameplay editor"
            >
              <GameplayPage />
            </GatedByRoute>
          }
        />
        <Route
          path="ignorelist"
          element={
            <GatedByRoute
              route="/app/ignorelist"
              pageLabel="The CE ignore list"
            >
              <IgnoreListPage />
            </GatedByRoute>
          }
        />
        <Route
          path="server-config"
          element={
            <GatedByRoute
              route="/app/server-config"
              pageLabel="Server configuration"
            >
              <ServerConfigPage />
            </GatedByRoute>
          }
        />
        <Route
          path="buildings"
          element={
            <GatedByRoute
              route="/app/buildings"
              pageLabel="The Buildings editor"
            >
              <BuildingsPage />
            </GatedByRoute>
          }
        />

        {/* Addon-registered routes get the same capability gate as
            the hardcoded ones above. The route registry keys by
            full path (`/app/...`); addon routes register relative
            paths so we prefix on lookup. Routes not in the
            registry render directly via the gate's no-requirement
            fallback. */}
        {enabledAddons.flatMap((addon) =>
          (addon.routes ?? []).map((r) => (
            <Route
              key={`${addon.id}:${r.path}`}
              path={r.path}
              element={
                <GatedByRoute route={`/app/${r.path}`}>
                  {r.element}
                </GatedByRoute>
              }
            />
          )),
        )}

        <Route
          path="*"
          element={
            <Placeholder
              title="Not available"
              phase={0}
              description="This feature lives in a module that isn't enabled on this install. Enable it from Settings → Modules."
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/profiles" replace />} />
    </Routes>
  );
}
