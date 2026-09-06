import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

/**
 * Status banner + one-click installer for Expansion's CE content.
 *
 * Fetches status on mount (cheap, local-only — file existence + cfg
 * parse). Install hits upstream
 * github.com/ExpansionModTeam/DayZ-Expansion-Missions via reqwest on
 * the Rust side, so operators always land on the current Expansion
 * Template tree for their map.
 *
 * States:
 *  - installed    → subtle green strip, "Reinstall / refresh" button.
 *  - partial      → amber, lists missing pieces + a single button.
 *  - uninstalled  → destructive-ish prompt, primary action big.
 */
export function ExpansionCeInstallBanner() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const status = useQuery({
    queryKey: profileId ? ["expansion-ce-status", profileId] : ["none"],
    queryFn: () => tauri.expansionCeStatus(profileId!),
    enabled: !!profileId,
    staleTime: 30_000,
  });

  const install = useMutation({
    mutationFn: () => tauri.expansionCeInstall(profileId!),
    onSuccess: (report) => {
      const parts: string[] = [];
      if (report.wroteTypes) parts.push("types");
      if (report.wroteSpawnableTypes) parts.push("spawnabletypes");
      if (report.wroteEvents) parts.push("events");
      if (report.registeredInCfg) parts.push("cfgeconomycore");
      if (report.eventspawnsAdded.length > 0) {
        parts.push(`${report.eventspawnsAdded.length} new event spawns`);
      }
      if (report.eventspawnsFileRepaired) {
        parts.push("cfgeventspawns trailing-whitespace repaired");
      }
      const summary = parts.length > 0
        ? `Updated: ${parts.join(", ")}.`
        : "Everything was already up to date.";
      toast.success(summary);
      if (profileId) {
        qc.invalidateQueries({ queryKey: ["expansion-ce-status", profileId] });
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!profileId) return null;
  if (status.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking Expansion CE install…
      </div>
    );
  }
  if (status.isError || !status.data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Couldn't read Expansion CE status:{" "}
          {errorMessage(status.error)}
        </AlertDescription>
      </Alert>
    );
  }

  const s = status.data;
  const missing: string[] = [];
  if (!s.typesFileExists) missing.push("expansion_types.xml");
  if (!s.spawnableTypesFileExists) missing.push("expansion_spawnabletypes.xml");
  if (!s.eventsFileExists) missing.push("expansion_events.xml");
  if (!s.registeredInCfg) missing.push("cfgeconomycore.xml registration");
  if (!s.eventspawnsSentinelPresent) missing.push("cfgeventspawns.xml event blocks");

  const state: "installed" | "partial" | "missing" = s.fullyInstalled
    ? "installed"
    : missing.length >= 4
      ? "missing"
      : "partial";

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2",
        state === "installed" &&
          "border-severity-success/40 bg-severity-success/5",
        state === "partial" &&
          "border-severity-warning/40 bg-severity-warning/5",
        state === "missing" &&
          "border-severity-error/40 bg-severity-error/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {state === "installed" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-severity-success" />
        ) : state === "partial" ? (
          <AlertTriangle className="h-4 w-4 shrink-0 text-severity-warning" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-severity-error" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {state === "installed"
              ? "Expansion CE content installed"
              : state === "partial"
                ? "Expansion CE content partially installed"
                : "Expansion CE content not installed"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {state === "installed"
              ? `Upstream template: ${s.upstreamTemplate}. Reinstall to pull the latest XML from the ExpansionModTeam repo.`
              : `Fetched fresh from ExpansionModTeam/DayZ-Expansion-Missions → Template/${s.upstreamTemplate}/. Registers the expansion_ce folder + event-spawn positions in one step.`}
          </p>
          {state !== "installed" && missing.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1">
              {missing.map((m) => (
                <li key={m}>
                  <Badge
                    variant="outline"
                    className="border-severity-warning/40 font-mono text-[9px] text-severity-warning"
                  >
                    missing · {m}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <InstallButton
          label={
            state === "installed" ? "Reinstall / refresh" : "Install Expansion CE"
          }
          variant={state === "installed" ? "outline" : "default"}
          pending={install.isPending}
          status={s}
          onConfirm={() => install.mutate()}
        />
      </div>
    </div>
  );
}

function InstallButton({
  label,
  variant,
  pending,
  status,
  onConfirm,
}: {
  label: string;
  variant: "default" | "outline";
  pending: boolean;
  status: import("@/types/ipc").ExpansionCeStatus;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size="sm"
          className="shrink-0"
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : variant === "outline" ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Install Expansion CE content from upstream
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Fetches{" "}
                <code>Template/{status.upstreamTemplate}/</code> from{" "}
                <a
                  href="https://github.com/ExpansionModTeam/DayZ-Expansion-Missions"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
                >
                  ExpansionModTeam/DayZ-Expansion-Missions
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                and applies the following to your mission folder:
              </p>
              <ul className="ml-4 list-disc space-y-0.5 text-xs text-muted-foreground">
                <li>
                  Writes <code>expansion_ce/expansion_types.xml</code>,{" "}
                  <code>expansion_spawnabletypes.xml</code>, and{" "}
                  <code>expansion_events.xml</code>.
                </li>
                <li>
                  Registers the <code>expansion_ce</code> folder in{" "}
                  <code>cfgeconomycore.xml</code>. The existing{" "}
                  <code>custom</code> block stays last.
                </li>
                <li>
                  Appends any Expansion event blocks to{" "}
                  <code>cfgeventspawns.xml</code> that aren't already
                  there (skips by event name — existing custom
                  positions are preserved).
                </li>
              </ul>
              <p className="text-xs text-muted-foreground">
                Idempotent — safe to re-run. A git commit is recorded
                after the changes land.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Install
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
