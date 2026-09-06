import { Link } from "react-router-dom";
import { Info } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  activeOverridingMods,
  useOverridingMods,
} from "./crossAwareness";
import type { VanillaSystem } from "./modules";

interface Props {
  system: VanillaSystem;
  /** Short description of what the vanilla file does, used in the
   *  banner body after the mod list. E.g. for player-spawns:
   *  "Vanilla `cfgplayerspawnpoints.xml` below still edits
   *  correctly." The exact phrasing is caller-controlled because
   *  each vanilla system needs its own "does the mod fully replace
   *  or coexist" nuance. */
  children: React.ReactNode;
}

/**
 * Banner rendered at the top of any vanilla editor whose system is
 * superseded by at least one detected + active mod. Hides itself
 * silently when nothing overrides — safe to mount unconditionally.
 *
 * Pattern:
 *   <VanillaOverriddenBanner system="player-spawns">
 *     Vanilla <code>cfgplayerspawnpoints.xml</code> below still
 *     works, but Expansion ignores it unless
 *     <code>UseVanillaSpawnSystem</code> is set.
 *   </VanillaOverriddenBanner>
 */
export function VanillaOverriddenBanner({ system, children }: Props) {
  const all = useOverridingMods(system);
  const active = activeOverridingMods(all);
  if (active.length === 0) return null;

  return (
    <Alert className="border-primary/40 bg-primary/5">
      <Info className="h-4 w-4 text-primary" />
      <AlertDescription className="text-xs">
        <p className="mb-1 text-foreground">
          <strong>
            {active
              .map((o) => o.module.label)
              .join(" · ")}{" "}
          </strong>
          also configure{active.length === 1 ? "s" : ""} this system.{" "}
          {children}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {active.map((o) => (
            <Link
              key={o.module.slug}
              to={`/app/mods/${o.module.slug}`}
              className="inline-flex items-center gap-1 rounded border border-primary/40 px-2 py-0.5 font-medium text-primary hover:bg-primary/10"
            >
              Open {o.module.label} →
            </Link>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
