import { Link } from "react-router-dom";
import { ArrowRight, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CapabilityTier,
  CapabilityTierStatus,
} from "@/types/ipc";

import { ROUTE_REQUIREMENTS, useCapabilities } from "./index";

/** Per-page capability gate.
 *
 *  Wrap an editor route in `<CapabilityGate tiers={["workspace"]}>` and
 *  it renders one of three states based on `capabilities_status`:
 *
 *    Active — all required tiers ready/stale → children render normally
 *    Stale  — children render, prefixed by a yellow soft-warning banner
 *    Locked — children NOT rendered; instead the page shows the
 *             prerequisite checklist with a "Set up" CTA pointing at
 *             the Setup hub. No empty grids, no broken queries.
 *
 *  The component intentionally doesn't show progress spinners while
 *  capabilities load — the query has a 30s staleTime, so on most page
 *  navigations it resolves synchronously from cache. The brief
 *  uncached case shows a small loading state instead of flickering
 *  through "Locked → Active". */
export function CapabilityGate({
  tiers,
  children,
  /** Optional override for the "what is this page" sentence shown on
   *  the Locked panel. Falls back to a generic phrasing. */
  pageLabel,
}: {
  tiers: CapabilityTier[];
  children: React.ReactNode;
  pageLabel?: string;
}) {
  const caps = useCapabilities();

  // No requirements declared → render directly. Lets routes adopt the
  // gate harmlessly even when they don't need anything.
  if (tiers.length === 0) return <>{children}</>;

  if (caps.isLoading && !caps.data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Checking capabilities…
      </div>
    );
  }

  if (caps.isError) {
    // Errors here are unusual (filesystem walk fails). Surface
    // something rather than indefinite loading; let the editor render
    // anyway since the gate isn't data-critical.
    return <>{children}</>;
  }

  const required = tiers
    .map((t) => caps.data?.tiers.find((s) => s.tier === t))
    .filter((t): t is CapabilityTierStatus => !!t);

  const unmet = required.filter(
    (t) => t.state !== "ready" && t.state !== "stale",
  );

  if (unmet.length > 0) {
    return <LockedPanel unmet={unmet} pageLabel={pageLabel} />;
  }

  const stale = required.filter((t) => t.state === "stale");
  return (
    <div className="flex h-full min-h-0 flex-col">
      {stale.length > 0 ? <StaleBanner stale={stale} /> : null}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/** Convenience wrapper that pulls the required tiers straight from
 *  the route registry. Cuts duplication when wiring routes in
 *  `App.tsx` — one place declares the prerequisites (the registry),
 *  the routes just say "gate me by my own path".
 *
 *  Routes not in `ROUTE_REQUIREMENTS` render their children directly
 *  (no requirements declared = always allowed). */
export function GatedByRoute({
  route,
  pageLabel,
  children,
}: {
  /** Full route path including `/app` prefix, e.g. `/app/items`. */
  route: string;
  pageLabel?: string;
  children: React.ReactNode;
}) {
  const tiers = ROUTE_REQUIREMENTS[route] ?? [];
  return (
    <CapabilityGate tiers={tiers} pageLabel={pageLabel}>
      {children}
    </CapabilityGate>
  );
}

// ---------- Locked panel ----------

function LockedPanel({
  unmet,
  pageLabel,
}: {
  unmet: CapabilityTierStatus[];
  pageLabel?: string;
}) {
  const headline =
    unmet.length === 1
      ? `${unmet[0].title} required`
      : `${unmet.length} prerequisites required`;
  return (
    <div className="flex h-full items-start justify-center p-8">
      <div className="w-full max-w-2xl rounded-md border border-border/60 bg-card/40 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{headline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {pageLabel ?? "This page"} can't run yet — finish the
              prep below first. Each step lives in the Setup hub so
              you can track everything in one place.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {unmet.map((t) => (
            <UnmetTier key={t.tier} tier={t} />
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button asChild>
            <Link to="/app/setup" className="inline-flex items-center gap-1">
              Open Setup
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function UnmetTier({ tier }: { tier: CapabilityTierStatus }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{tier.title}</h3>
        <span
          className={cn(
            "rounded border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em]",
            tier.state === "warn"
              ? "border-severity-warning/40 text-severity-warning"
              : tier.state === "blocked"
                ? "border-border/60 text-muted-foreground"
                : "border-primary/40 text-primary",
          )}
        >
          {tier.state}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{tier.description}</p>
      {tier.steps.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs">
          {tier.steps.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex items-baseline gap-2",
                s.state === "ready" || s.state === "stale"
                  ? "text-muted-foreground/70"
                  : "text-foreground",
              )}
            >
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.state === "ready" || s.state === "stale" ? "✓" : "·"}
              </span>
              <span className="flex-1">
                <span className="font-medium">{s.label}</span>
                {s.detail ? (
                  <span className="ml-1 text-muted-foreground">— {s.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------- Stale banner ----------

function StaleBanner({ stale }: { stale: CapabilityTierStatus[] }) {
  const labels = stale.map((t) => t.title.toLowerCase()).join(", ");
  return (
    <div className="flex items-center gap-3 border-b border-severity-warning/30 bg-severity-warning/5 px-4 py-2 text-xs text-severity-warning">
      <span className="font-mono text-[10px] uppercase tracking-wider">
        stale data
      </span>
      <span className="flex-1 text-foreground/80">
        {stale.length === 1 ? "" : "Some data is "}
        {labels} {stale.length === 1 ? "is" : "are"} older than usual —
        consider re-running before relying on this view.
      </span>
      <Link
        to="/app/setup"
        className="font-medium underline-offset-2 hover:underline"
      >
        Refresh in Setup
      </Link>
    </div>
  );
}
