import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  ExternalLink,
  FileSearch,
  FolderOpen,
  Loader2,
  RefreshCw,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

import { CAPABILITIES_QUERY_KEY, useCapabilities } from "@/capabilities";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  CapabilityStep,
  CapabilityTier,
  CapabilityTierStatus,
  ImportPlan,
  InstalledMod,
  InstalledModsScan,
  ScannedFile,
  TierState,
  ToolId,
} from "@/types/ipc";

/** Setup hub — flat list edition.
 *
 *  Every prerequisite the app cares about is rendered as a single
 *  row: status icon · label + one-line description · inline action
 *  button. Rows are grouped under a flat heading per capability
 *  tier (no collapsible cards, no chevrons) so the operator can
 *  see the whole pipeline at a glance and click straight through.
 *
 *  Inline actions call the same Tauri commands the dedicated pages
 *  use; success invalidates the capabilities query so every status
 *  icon repaints together. */
/** Tiers that gate the basic editing flow — every operator needs
 *  these before the app does anything useful. Mirrors the Rust
 *  `allRequiredReady` flag (T1 + T2). Anything else is per-feature
 *  optional and is rendered under a separate "Optional features"
 *  heading so the operator can see at a glance what they MUST do
 *  vs. what unlocks specific optional modules. */
const REQUIRED_TIERS: ReadonlySet<CapabilityTier> = new Set([
  "connection",
  "workspace",
]);

export function SetupPage() {
  const caps = useCapabilities();
  const tiers = caps.data?.tiers ?? [];

  const requiredTiers = tiers.filter((t) => REQUIRED_TIERS.has(t.tier));
  const optionalTiers = tiers.filter((t) => !REQUIRED_TIERS.has(t.tier));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Settings}
        title="Setup"
        description="Everything the app needs before it can do real work — connection, workspace, game data, mods, and build tools."

        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => caps.refetch()}
            disabled={caps.isFetching}
            title="Re-check all tiers"
          >
            {caps.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Re-check
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-6">
          {caps.isLoading && tiers.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Probing
              prerequisites…
            </div>
          ) : null}

          {requiredTiers.length > 0 ? (
            <SetupSection
              kind="required"
              title="Required"
              subtitle="The app won't work without these."
              tiers={requiredTiers}
            />
          ) : null}

          {optionalTiers.length > 0 ? (
            <SetupSection
              kind="optional"
              title="Optional features"
              subtitle="Extra functionality you can enable here."
              tiers={optionalTiers}
            />
          ) : null}


        </div>
      </div>
    </div>
  );
}

// ---------- Required vs optional grouping ----------

/** Top-level page section — Required (T1+T2) and Optional (T3..T5)
 *  each render as one of these. Ramps up the visual weight so the
 *  Required band reads as the operator's todo list and Optional
 *  reads as a menu of "what else you can unlock". The two share a
 *  rendering shell so the column rhythm stays identical. */
function SetupSection({
  kind,
  title,
  subtitle,
  tiers,
  footer,
}: {
  kind: "required" | "optional";
  title: string;
  subtitle: string;
  tiers: CapabilityTierStatus[];
  footer?: React.ReactNode;
}) {
  const required = kind === "required";
  return (
    <section
      className={cn(
        "rounded-lg border p-4",
        required
          ? "border-primary/40 bg-primary/[0.04]"
          : "border-border/60 bg-card/30",
      )}
    >
      <div className="mb-3 flex items-baseline gap-2">
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 px-1.5 py-0 text-[10px] uppercase tracking-wider",
            required
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground",
          )}
        >
          {required ? "Required" : "Optional"}
        </Badge>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="ml-1 truncate text-xs text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <div className="space-y-5">
        {tiers.map((tier) => (
          <TierGroup key={tier.tier} tier={tier} />
        ))}
        {footer}
      </div>
    </section>
  );
}

function TierGroup({ tier }: { tier: CapabilityTierStatus }) {
  // The Mods tier renders bespoke rows for `discover_mods` and
  // `import_mod_xml` so those flows happen inline (folder pick →
  // scan → register; file pick → detect → confirm → register). The
  // legacy `scan_autoimport` row is now redundant — the bulk
  // "register all" lives inside the discover row's expanded panel.
  const visibleSteps =
    tier.tier === "mods"
      ? tier.steps.filter((s) => s.id !== "scan_autoimport")
      : tier.steps;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2 border-b border-border/40 pb-1">
        <h3 className="text-sm font-semibold">{tier.title}</h3>
        <TierPill state={tier.state} />
        <p className="ml-2 truncate text-[11px] text-muted-foreground">
          {tier.description}
        </p>
      </div>
      <div className="divide-y divide-border/30">
        {visibleSteps.map((step) => {
          if (tier.tier === "mods" && step.id === "discover_mods") {
            return <DiscoverModsRow key={step.id} step={step} />;
          }
          if (tier.tier === "mods" && step.id === "import_mod_xml") {
            return <ManualXmlImportRow key={step.id} step={step} />;
          }
          return <StepRow key={step.id} tier={tier.tier} step={step} />;
        })}
      </div>
    </div>
  );
}

function TierPill({ state }: { state: TierState }) {
  const map: Record<
    TierState,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    ready: {
      label: "ready",
      className: "border-severity-success/40 text-severity-success",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    stale: {
      label: "stale",
      className: "border-severity-warning/40 text-severity-warning",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    todo: {
      label: "to do",
      className: "border-primary/40 text-primary",
      icon: <Circle className="h-3 w-3" />,
    },
    warn: {
      label: "attention",
      className: "border-severity-warning/40 text-severity-warning",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    blocked: {
      label: "blocked",
      className: "border-border/60 text-muted-foreground",
      icon: <Circle className="h-3 w-3" />,
    },
  };
  const m = map[state];
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 gap-1 px-1.5 py-0 text-[10px]",
        m.className,
      )}
    >
      {m.icon}
      {m.label}
    </Badge>
  );
}

// ---------- Step row + inline actions ----------

function StepRow({
  tier,
  step,
}: {
  tier: CapabilityTier;
  step: CapabilityStep;
}) {
  const done = step.state === "ready" || step.state === "stale";
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="shrink-0">
        {done ? (
          <CheckCircle2 className="h-4 w-4 text-severity-success" />
        ) : step.state === "blocked" ? (
          <Circle className="h-4 w-4 text-muted-foreground/40" />
        ) : step.state === "warn" ? (
          <AlertTriangle className="h-4 w-4 text-severity-warning" />
        ) : (
          <Circle className="h-4 w-4 text-primary/70" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{step.label}</p>
        {step.detail ? (
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {step.detail}
          </p>
        ) : null}
      </div>
      <div className="shrink-0">
        <StepAction tier={tier} step={step} />
      </div>
    </div>
  );
}

/** Step ids → tool ids for the tool-override pickers. Every
 *  on-disk exe the operator can relocate is listed here; the
 *  Locate button shows up wherever the same step id is rendered,
 *  including the rows that are intentionally double-listed across
 *  tiers (DeRap appears under both "Serverpack & Reskin creation"
 *  and "Vanilla data readers" with shared state). */
const STEP_TO_TOOL: Record<string, ToolId> = {
  derap: "derap",
  make_pbo: "make_pbo",
  ds_sign: "ds_sign",
  image_to_paa: "image_to_paa",
};

/** Picks an inline / link action per (tier, step). Inline actions
 *  invalidate the capabilities query on success so other rows
 *  update without a full page refetch. */
function StepAction({
  tier,
  step,
}: {
  tier: CapabilityTier;
  step: CapabilityStep;
}) {
  if (step.state === "blocked") {
    return null;
  }

  // Connection tier — all rows deep-link to the profile editor.
  if (tier === "connection") {
    return (
      <DeepLinkAction to="/profiles" label="Manage profile" />
    );
  }

  if (tier === "workspace" && step.id === "pull") {
    return <DeepLinkAction to="/app/sync" label="Open Sync" />;
  }

  if (tier === "game_data") {
    if (step.id === "work_dir") {
      return <DeepLinkAction to="/profiles" label="Set folder" />;
    }
    if (step.id === "vanilla_index") {
      return <RebuildVanillaIndexAction />;
    }
    if (step.id === "p_drive") {
      return <PDriveGuideAction step={step} />;
    }
    // DeRap + every build-tool exe (MakePbo, DSSignFile,
    // ImageToPAA) all use the shared Locate picker keyed off
    // step.id.
    const tool = STEP_TO_TOOL[step.id];
    if (tool) {
      return <ToolPicker toolId={tool} />;
    }
    return <DeepLinkAction to="/app/reskin" label="Open guide" />;
  }

  if (tier === "mods") {
    // `discover_mods` and `import_mod_xml` are rendered as bespoke
    // rows by `TierGroup` and never reach this dispatcher. Any
    // future mod-tier step lands here as a soft deep-link.
    return <DeepLinkAction to="/app/mods" label="Open mods" />;
  }

  if (tier === "build_tools") {
    const tool = STEP_TO_TOOL[step.id];
    if (tool) {
      return <ToolPicker toolId={tool} />;
    }
    return <DeepLinkAction to="/app/reskin" label="Open guide" />;
  }

  return null;
}

function DeepLinkAction({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild size="sm" variant="secondary">
      <Link to={to} className="inline-flex items-center gap-1">
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );
}

function RebuildVanillaIndexAction() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => tauri.reskinVanillaIndexBuild(),
    onSuccess: (summary) => {
      toast.success(
        `Indexed ${summary.classCount} classes from ${summary.addonCount} addons`,
      );
      qc.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
      qc.invalidateQueries({
        queryKey: ["reskin", "vanilla-index"],
      });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Button
      size="sm"
      onClick={() => m.mutate()}
      disabled={m.isPending}
    >
      {m.isPending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
      )}
      Re-index
    </Button>
  );
}

/** P: drive step's "Open guide" — pops a modal explaining how to
 *  mount + populate P:\\DZ\\, with an inline "Check P: drive"
 *  button that re-probes capabilities so the operator sees the row
 *  flip green without leaving the dialog. The check IS the
 *  detection — `capabilities_status` already does an
 *  `is_dir(P:\\DZ\\)` probe; we just refetch and surface the
 *  result inside the modal. */
function PDriveGuideAction({ step }: { step: CapabilityStep }) {
  const [open, setOpen] = useState(false);
  const caps = useCapabilities();
  const qc = useQueryClient();
  const ready = step.state === "ready" || step.state === "stale";
  const recheck = () => {
    qc.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
  };
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        Open guide
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Set up the P: drive</DialogTitle>
            <DialogDescription>
              The P: drive is a virtual drive containing DayZ's
              unpacked source addons. The reskin browser, the loot-
              tier overlay, and the reskin class indexer all read
              from <code>P:\DZ\</code>. Once it's set up you don't
              touch it again unless DayZ updates.
            </DialogDescription>
          </DialogHeader>

          <ol className="ml-4 list-decimal space-y-2 text-sm">
            <li>
              <span className="font-medium">Install DayZ Tools.</span>{" "}
              Free Steam tool — search "DayZ Tools" in your library or
              install from{" "}
              <a
                href="steam://install/830640"
                className="text-primary underline-offset-2 hover:underline"
              >
                steam://install/830640
              </a>
              . Sits next to DayZ in your library.
            </li>
            <li>
              <span className="font-medium">Mount the P: drive.</span>{" "}
              In DayZ Tools, open the "Project Drive" tab and click{" "}
              <span className="font-mono">Setup P drive</span>. Pick
              an empty folder for the P: contents (~30 GB). The tool
              creates a virtual <code>P:\</code> mapped to that
              folder so the rest of the steps can write to it.
            </li>
            <li>
              <span className="font-medium">Extract DayZ.</span> Same
              tab → <span className="font-mono">Extract Game Data</span>
              . Takes ~10 minutes; populates{" "}
              <code>P:\DZ\</code> with every addon's source files,
              which is what this app reads.
            </li>
            <li>
              <span className="font-medium">Re-run after DayZ updates.</span>{" "}
              When BIS pushes a new DayZ version, repeat step 3 to
              keep the source synced. The class index will go stale
              after 30 days as a reminder.
            </li>
          </ol>

          <div className="rounded-md border border-border/60 bg-card/40 p-3">
            <div className="flex items-center gap-2">
              {ready ? (
                <CheckCircle2 className="h-4 w-4 text-severity-success" />
              ) : (
                <Circle className="h-4 w-4 text-primary/70" />
              )}
              <span className="text-sm font-medium">
                {ready ? "P: drive detected" : "P: drive not yet detected"}
              </span>
            </div>
            <p className="mt-1 break-words text-xs text-muted-foreground">
              {step.detail}
            </p>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={recheck}
              disabled={caps.isFetching}
            >
              {caps.isFetching ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Check P: drive
            </Button>
            <Button type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "Locate exe" picker for a single tool. Lets operators with the
 *  tool installed elsewhere on disk point the app at it instead of
 *  forcing the bundled location under `tools/`. Persists via
 *  `tool_override_set`; the row repaints on the next capabilities
 *  refetch (which we trigger inline). */
function ToolPicker({ toolId }: { toolId: ToolId }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const picked = await openDialog({
        directory: false,
        multiple: false,
        filters: [{ name: "Executable", extensions: ["exe"] }],
      });
      if (typeof picked !== "string") return null;
      return tauri.toolOverrideSet(toolId, picked);
    },
    onSuccess: (result) => {
      if (!result) return;
      toast.success("Tool path saved");
      qc.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => m.mutate()}
      disabled={m.isPending}
      title="Pick the exe on disk if it's not in tools/"
    >
      {m.isPending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <FileSearch className="mr-2 h-3.5 w-3.5" />
      )}
      Locate
    </Button>
  );
}

// ---------- Mods tier — bespoke rows ----------

/** "Discover mods" row — folder picker → `installedModsScan` →
 *  inline list of every `@*` folder it found, with a per-mod
 *  "Register CE files" button (and a bulk "Register all" button)
 *  that wires the mod's `types.xml` / `events.xml` / etc. into
 *  `cfgeconomycore.xml` via the existing `ce_import_*` commands.
 *  Replaces the previous "Discover" deep-link + standalone bottom
 *  block — operators now scan + register without leaving the
 *  Setup page. */
function DiscoverModsRow({ step }: { step: CapabilityStep }) {
  const qc = useQueryClient();
  const activeProfile = useProfileStore((s) => s.active);
  const [scan, setScan] = useState<InstalledModsScan | null>(null);
  const scanMut = useMutation({
    // The fn below picks between the two scan commands, but the
    // mutation result type is uniform so callers only see one toast.
    mutationFn: async (vars: { kind: "auto" } | { kind: "folder"; root: string }) => {
      if (vars.kind === "auto") {
        if (!activeProfile) {
          throw new Error("No active profile");
        }
        return tauri.installedModsScanForProfile(activeProfile.id);
      }
      return tauri.installedModsScan(vars.root);
    },
    onSuccess: (r) => {
      setScan(r);
      if (r.mods.length === 0) {
        toast.warning("No `@*` folders found in that directory.");
      } else {
        toast.success(
          `Found ${r.mods.length} mod${r.mods.length === 1 ? "" : "s"}`,
        );
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const runAutoScan = () => {
    scanMut.mutate({ kind: "auto" });
  };
  const pickAndScan = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked !== "string") return;
    scanMut.mutate({ kind: "folder", root: picked });
  };

  // Hint text per mode — clarifies WHERE we're scanning so SFTP
  // operators don't get confused by a "pick a local folder" call to
  // action when the server lives over the wire. The flow's purpose
  // is finding mod-shipped types.xml / events.xml / spawnabletypes
  // XMLs and rolling them into the mission's main type list via
  // cfgeconomycore.xml — not the reskin pipeline (separate flow).
  const isSftp = activeProfile?.mode === "sftp";
  const isLocal = activeProfile?.mode === "local";
  const detailHint = isSftp
    ? "SFTP profile: scans the local mod-CE cache populated when you last imported the workspace, then registers any types/events/spawnable XMLs into cfgeconomycore.xml. Import the workspace first if the cache is empty."
    : isLocal
      ? "Local profile: scans your server install for `@*` folders, then registers any types/events/spawnable XMLs they ship into cfgeconomycore.xml."
      : "Walk a folder for `@*` mod directories and register the types/events/spawnable XMLs they ship.";

  // "Register all" — runs the same per-mod register flow against
  // every CE-file-bearing mod in the scan. Sequential rather than
  // parallel so each `cfgeconomycore.xml` write sees the previous
  // one's effect; ce_import_apply commits to git per mod, which
  // produces one commit per registration (intentional — each mod
  // is a logically separate change).
  const registerAllMut = useMutation({
    mutationFn: async () => {
      if (!scan || !activeProfile) return { ok: 0, fail: 0 };
      let ok = 0;
      let fail = 0;
      for (const mod of scan.mods) {
        if (!mod.hasCeFiles) continue;
        try {
          await registerModCeFiles(activeProfile.id, mod.sourcePath);
          ok += 1;
        } catch (err) {
          fail += 1;
          toast.error(`${mod.displayName}: ${errorMessage(err)}`);
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      if (ok > 0) {
        toast.success(
          `Registered ${ok} mod${ok === 1 ? "" : "s"}${fail > 0 ? ` · ${fail} failed` : ""}`,
        );
      }
      qc.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["ce-imports", activeProfile?.id] });
    },
  });

  const registerableCount = scan
    ? scan.mods.filter((m) => m.hasCeFiles).length
    : 0;

  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <div className="shrink-0">
          <StepStatusIcon state={step.state} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{step.label}</p>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            {detailHint}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {/* Mode-aware primary action — auto-scans the right
              location for the active profile (server install for
              local, mod-CE cache for SFTP). */}
          <Button
            size="sm"
            onClick={runAutoScan}
            disabled={scanMut.isPending || !activeProfile}
            title={
              isSftp
                ? "Scan the SFTP-pulled mod cache"
                : isLocal
                  ? "Scan the profile's server install"
                  : "Pick an active profile first"
            }
          >
            {scanMut.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            {isSftp ? "Scan from server pull" : "Scan profile"}
          </Button>
          {/* Manual override — pick any folder regardless of mode.
              Useful for SFTP profiles when the operator keeps a
              local copy of the mods next to their workspace. */}
          <Button
            size="sm"
            variant="ghost"
            onClick={pickAndScan}
            disabled={scanMut.isPending}
            title="Scan a different folder of @* mods"
          >
            <FolderOpen className="mr-2 h-3.5 w-3.5" />
            Pick folder
          </Button>
        </div>
      </div>

      {scan ? (
        <div className="ml-7 mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">{scan.root}</span>
            <Badge variant="secondary" className="text-[10px]">
              {scan.mods.length} mod{scan.mods.length === 1 ? "" : "s"}
            </Badge>
            {registerableCount > 0 ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-[10px] text-primary"
              >
                {registerableCount} with CE files
              </Badge>
            ) : null}
            {registerableCount > 0 && activeProfile ? (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto h-6 px-2 text-[11px]"
                onClick={() => registerAllMut.mutate()}
                disabled={registerAllMut.isPending}
              >
                {registerAllMut.isPending ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : null}
                Register all XMLs
              </Button>
            ) : null}
            {scan.warnings.map((w, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] border-severity-warning/40 text-severity-warning"
              >
                {w}
              </Badge>
            ))}
          </div>
          <div className="space-y-1.5">
            {scan.mods.map((mod) => (
              <ScannedModRow key={mod.sourcePath} mod={mod} />
            ))}
          </div>
          {!activeProfile ? (
            <p className="text-[11px] text-severity-warning">
              No active profile — registration disabled. Pick one in
              Connection.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One row inside the Discover-mods scan results. The discovery
 *  flow exists to find mod folders that ship `types.xml` /
 *  `events.xml` / etc. and roll them into the mission's main type
 *  list (via `cfgeconomycore.xml`) — this row shows what was found
 *  and offers a single "Register" button per mod whose XMLs are
 *  importable. Reskin-pipeline scanning is intentionally NOT
 *  surfaced here; it lives on the dedicated Reskin pages where
 *  it's the focus of the workflow. */
function ScannedModRow({ mod }: { mod: InstalledMod }) {
  const qc = useQueryClient();
  const activeProfile = useProfileStore((s) => s.active);
  const [registered, setRegistered] = useState(false);

  const registerMut = useMutation({
    mutationFn: async () => {
      if (!activeProfile) {
        throw new Error("No active profile");
      }
      return registerModCeFiles(activeProfile.id, mod.sourcePath);
    },
    onSuccess: (r) => {
      setRegistered(true);
      toast.success(
        `${mod.displayName}: registered ${r.importedCount} file${r.importedCount === 1 ? "" : "s"} into ${r.destFolder}`,
      );
      qc.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["ce-imports", activeProfile?.id] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="rounded border border-border/40 bg-background/30 p-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{mod.displayName}</span>
            {mod.hasCeFiles ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-[9px] text-primary"
              >
                CE files
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-border/60 text-[9px] text-muted-foreground"
              >
                no CE files
              </Badge>
            )}
            {mod.hasBikey ? (
              <Badge
                variant="outline"
                className="border-border/60 text-[9px] text-muted-foreground"
              >
                .bikey
              </Badge>
            ) : null}
            {registered ? (
              <Badge
                variant="outline"
                className="border-severity-success/40 text-[9px] text-severity-success"
              >
                registered
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            {mod.pboCount} PBO{mod.pboCount === 1 ? "" : "s"} ·{" "}
            {(mod.pboBytes / 1024 / 1024).toFixed(1)} MB ·{" "}
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => {
                openPath(mod.sourcePath).catch((err) =>
                  toast.error(`Couldn't open: ${errorMessage(err)}`),
                );
              }}
            >
              {mod.sourcePath}
              <ExternalLink className="ml-0.5 inline h-2.5 w-2.5" />
            </button>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {mod.hasCeFiles && !registered ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => registerMut.mutate()}
              disabled={registerMut.isPending || !activeProfile}
              title={
                activeProfile
                  ? "Register this mod's types/events/spawnable XMLs into cfgeconomycore.xml"
                  : "Pick an active profile to register CE files"
              }
            >
              {registerMut.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Register XMLs"
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Helper: scan a single mod's folder for CE files and register
 *  every importable XML it contains in one round-trip. Shared by
 *  per-mod and "register all" callers so behaviour is identical. */
async function registerModCeFiles(profileId: string, modPath: string) {
  const plan = await tauri.ceImportScan(profileId, modPath);
  const importable = plan.files.filter((f) => f.importable);
  if (importable.length === 0) {
    throw new Error("Mod ships no importable CE files");
  }
  return tauri.ceImportApply(profileId, {
    sourceRoot: plan.sourceRoot,
    destFolder: plan.suggestedDestFolder,
    relativePaths: importable.map((f) => f.relativePath),
    overwrite: false,
  });
}

/** "Manually import a XML" row — file picker → backend
 *  classification → confirmation dialog showing the detected kind +
 *  record count → register into `cfgeconomycore.xml`. Lets operators
 *  point at a loose `types.xml` (e.g. one a mod author handed over
 *  without packaging it as a `@*` folder) without going through the
 *  full Mods page UI. */
function ManualXmlImportRow({ step }: { step: CapabilityStep }) {
  const qc = useQueryClient();
  const activeProfile = useProfileStore((s) => s.active);
  const [pending, setPending] = useState<{
    plan: ImportPlan;
    file: ScannedFile;
  } | null>(null);
  const [scanning, setScanning] = useState(false);

  const pickAndDetect = async () => {
    if (!activeProfile) {
      toast.error("Pick an active profile first");
      return;
    }
    const picked = await openDialog({
      directory: false,
      multiple: false,
      filters: [{ name: "XML", extensions: ["xml"] }],
    });
    if (typeof picked !== "string") return;

    // Derive parent dir cross-platform — both `\\` and `/` show up.
    const sep = picked.includes("\\") ? "\\" : "/";
    const lastSep = picked.lastIndexOf(sep);
    if (lastSep < 0) {
      toast.error("Couldn't determine parent folder");
      return;
    }
    const parent = picked.slice(0, lastSep);
    setScanning(true);
    try {
      const plan = await tauri.ceImportScan(activeProfile.id, parent);
      // The backend's relativePath uses '/' separators; match by
      // file basename for reliability across platforms.
      const baseName = picked.slice(lastSep + 1);
      const file = plan.files.find(
        (f) => f.relativePath.split("/").pop() === baseName,
      );
      if (!file) {
        toast.error("Backend scan didn't return the picked file");
        return;
      }
      setPending({ plan, file });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setScanning(false);
    }
  };

  const confirmMut = useMutation({
    mutationFn: async () => {
      if (!pending || !activeProfile) return null;
      return tauri.ceImportApply(activeProfile.id, {
        sourceRoot: pending.plan.sourceRoot,
        destFolder: pending.plan.suggestedDestFolder,
        relativePaths: [pending.file.relativePath],
        overwrite: false,
      });
    },
    onSuccess: (r) => {
      if (!r) return;
      toast.success(
        `Registered ${pending?.file.kindLabel ?? "file"} into ${r.destFolder}`,
      );
      qc.invalidateQueries({ queryKey: CAPABILITIES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["ce-imports", activeProfile?.id] });
      setPending(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <div className="flex items-center gap-3 py-2">
        <div className="shrink-0">
          <StepStatusIcon state={step.state} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{step.label}</p>
          <p className="mt-0.5 break-words text-xs text-muted-foreground">
            Pick any <code>types.xml</code> /{" "}
            <code>events.xml</code> / spawnabletypes XML on disk —
            we detect what it is and confirm before registering.
          </p>
        </div>
        <div className="shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={pickAndDetect}
            disabled={scanning || !activeProfile}
            title={
              activeProfile
                ? undefined
                : "Pick an active profile to import XML"
            }
          >
            {scanning ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileSearch className="mr-2 h-3.5 w-3.5" />
            )}
            Pick XML
          </Button>
        </div>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => {
          if (!o) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm XML import</DialogTitle>
            <DialogDescription>
              Review what we detected before registering this file
              in <code>cfgeconomycore.xml</code>.
            </DialogDescription>
          </DialogHeader>

          {pending ? (
            <div className="space-y-2 text-sm">
              <div className="rounded border border-border/60 bg-background/40 p-2 font-mono text-[11px]">
                {pending.file.sourcePath}
              </div>
              <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Detected:</span>
                <span>
                  {pending.file.kindLabel}
                  {pending.file.importable ? null : (
                    <span className="ml-2 text-severity-warning">
                      (kind not importable — pick a different file)
                    </span>
                  )}
                </span>
                {pending.file.recordCount > 0 ? (
                  <>
                    <span className="text-muted-foreground">Records:</span>
                    <span className="tabular-nums">
                      {pending.file.recordCount}
                    </span>
                  </>
                ) : null}
                <span className="text-muted-foreground">Will copy to:</span>
                <span className="font-mono text-[11px]">
                  {pending.plan.suggestedDestFolder}/
                  {pending.file.relativePath}
                </span>
              </div>
            </div>
          ) : null}

          <DialogFooter className="sm:justify-end">
            <Button
              variant="ghost"
              onClick={() => setPending(null)}
              disabled={confirmMut.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => confirmMut.mutate()}
              disabled={
                confirmMut.isPending ||
                !pending ||
                !pending.file.importable
              }
            >
              {confirmMut.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Same status glyph the regular `StepRow` uses, factored out so
 *  the bespoke mod rows render identically. */
function StepStatusIcon({ state }: { state: TierState }) {
  if (state === "ready" || state === "stale") {
    return <CheckCircle2 className="h-4 w-4 text-severity-success" />;
  }
  if (state === "blocked") {
    return <Circle className="h-4 w-4 text-muted-foreground/40" />;
  }
  if (state === "warn") {
    return <AlertTriangle className="h-4 w-4 text-severity-warning" />;
  }
  return <Circle className="h-4 w-4 text-primary/70" />;
}
