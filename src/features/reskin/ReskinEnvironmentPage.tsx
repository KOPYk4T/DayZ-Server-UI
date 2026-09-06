import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Database,
  ExternalLink,
  HardDrive,
  Key,
  Loader2,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import type {
  ReskinEnvironment,
  ReskinToolStatus,
  VanillaIndexStatus,
} from "@/types/ipc";

export function ReskinEnvironmentPage() {
  const env = useQuery<ReskinEnvironment>({
    queryKey: ["reskin", "env"],
    queryFn: () => tauri.reskinEnvCheck(),
    staleTime: 10_000,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={HardDrive}
        title="Reskin · Setup"
        description="Texture-only reskins need three things in place before the wizard can build a valid mod PBO."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void env.refetch()}
            disabled={env.isFetching}
          >
            {env.isFetching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Re-check
          </Button>
        }
      />
      <div className="space-y-6 overflow-y-auto p-6">

      {env.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Probing tools and
          P: drive…
        </div>
      ) : env.error ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage(env.error)}</AlertDescription>
        </Alert>
      ) : env.data ? (
        <>
          <ReadyBanner env={env.data} />
          <ToolsCard env={env.data} />
          <PDriveCard env={env.data} />
          <SigningCard env={env.data} />
          <VanillaIndexCard envReady={env.data.ready} />
        </>
      ) : null}
      </div>
    </div>
  );
}

function VanillaIndexCard({ envReady }: { envReady: boolean }) {
  const qc = useQueryClient();
  const status = useQuery<VanillaIndexStatus>({
    queryKey: ["reskin", "vanilla-index", "status"],
    queryFn: () => tauri.reskinVanillaIndexStatus(),
    staleTime: 10_000,
  });

  const build = useMutation({
    mutationFn: () => tauri.reskinVanillaIndexBuild(),
    onSuccess: (summary) => {
      toast.success(
        `Indexed ${summary.classCount} classes from ${summary.addonCount} addons`,
        {
          description:
            summary.skipped > 0
              ? `${summary.skipped} addon(s) skipped — see card for details`
              : `in ${summary.durationMs} ms`,
        },
      );
      qc.invalidateQueries({ queryKey: ["reskin", "vanilla-index"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const cached = status.data?.cached ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="h-4 w-4" /> Vanilla class index
        </CardTitle>
        <CardDescription>
          Scans every addon under{" "}
          <code className="font-mono">P:\DZ\</code>, parses the
          <code className="mx-1 font-mono">config.cpp</code>
          (or DeRap's a{" "}
          <code className="font-mono">config.bin</code> into a temp
          dir), and records every class that exposes a
          <code className="mx-1 font-mono">hiddenSelections[]</code>
          array. Rerun after any DayZ update that re-extracts game
          data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
            status…
          </div>
        ) : cached ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              variant="outline"
              className="border-severity-success/40 text-severity-success"
            >
              cached
            </Badge>
            <span className="font-mono text-xs">
              {status.data?.classCount} classes
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-xs">
              {status.data?.addonCount} addons
            </span>
            {status.data?.skipped.length ? (
              <>
                <span className="text-muted-foreground">·</span>
                <span
                  className="cursor-help font-mono text-xs text-severity-warning"
                  title={status.data.skipped
                    .map((s) => `${s.addon}: ${s.reason}`)
                    .join("\n")}
                >
                  {status.data.skipped.length} skipped
                </span>
              </>
            ) : null}
            <span className="text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(status.data?.builtAt ?? undefined)}
            </span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Not built yet. Run the scan to generate the index.
          </div>
        )}

        {!envReady ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Finish the setup cards above first — the scanner needs P:
              mounted and the tools present.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => build.mutate()}
            disabled={!envReady || build.isPending}
          >
            {build.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Boxes className="mr-2 h-3.5 w-3.5" />
            )}
            {cached ? "Rebuild index" : "Build index"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            First run shells to DeRap for every addon — expect a few
            seconds on a typical install.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ReadyBanner({ env }: { env: ReskinEnvironment }) {
  if (env.ready) {
    return (
      <Alert className="border-severity-success/40 bg-severity-success/10">
        <CheckCircle2 className="h-4 w-4 text-severity-success" />
        <AlertDescription>
          <strong>Reskin environment ready.</strong> Tools, P: drive,
          and a signing key are all in place.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert className="border-severity-warning/40 bg-severity-warning/10">
      <AlertTriangle className="h-4 w-4 text-severity-warning" />
      <AlertDescription>
        The reskin wizard stays locked until the cards below all show
        green. The most common step missed is mounting the P: drive
        with unpacked DayZ data.
      </AlertDescription>
    </Alert>
  );
}

function ToolsCard({ env }: { env: ReskinEnvironment }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wrench className="h-4 w-4" /> Bundled tools
        </CardTitle>
        <CardDescription>
          These ship inside the app at <code className="font-mono">{env.toolsDir}</code>.
          If any are missing, drop the full tool folder (DLLs and all)
          back at the expected location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!env.toolsDirExists ? (
          <Alert className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              The tools directory doesn't exist at the expected path.
              Set <code className="font-mono">DZMGR_TOOLS_DIR</code> to
              override, or restore the <code className="font-mono">tools/</code> folder next to the app.
            </AlertDescription>
          </Alert>
        ) : null}
        <ul className="divide-y divide-border/60 text-sm">
          {env.tools.map((t) => (
            <ToolRow key={t.id} tool={t} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ToolRow({ tool }: { tool: ReskinToolStatus }) {
  return (
    <li className="flex items-center gap-3 py-2 pr-2">
      <StatusDot ok={tool.present} />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{tool.displayName}</div>
        <div className="font-mono text-[11px] text-muted-foreground">
          {tool.resolvedPath ?? tool.expectedRelative}
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 text-[10px]",
          tool.present
            ? "border-severity-success/40 text-severity-success"
            : "border-severity-error/40 text-severity-error",
        )}
      >
        {tool.present ? "found" : "missing"}
      </Badge>
    </li>
  );
}

function PDriveCard({ env }: { env: ReskinEnvironment }) {
  const p = env.pDrive;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4" /> P: drive
        </CardTitle>
        <CardDescription>
          The reskin wizard reads vanilla DayZ class definitions from{" "}
          <code className="font-mono">P:\scripts\</code> and{" "}
          <code className="font-mono">P:\DZ\</code>. Mount it via
          Bohemia's DayZ Tools → Workdrive, then run <em>Extract Game
          Data</em> (one-time, ~30 GB).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60 text-sm">
          <StatusRow
            ok={p.mounted}
            label="P:\\ mounted"
            detail="Any readable entry at the drive root counts as mounted."
          />
          <StatusRow
            ok={p.hasScripts}
            label="P:\\scripts\\ present"
            detail="Enfusion script tree. Needed to resolve script-side inheritance."
          />
          <StatusRow
            ok={p.hasDz}
            label="P:\\DZ\\ present"
            detail="Vanilla addon configs, p3d, textures — this is what the wizard reads hiddenSelections from."
          />
        </ul>

        {!p.mounted || !p.hasScripts || !p.hasDz ? (
          <div className="mt-4 rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
            <div className="mb-1 font-semibold">How to set this up</div>
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>
                Install <strong>DayZ Tools</strong> from Steam (free,
                shows up in the Tools library).
              </li>
              <li>
                Launch it and choose <em>Mount Drive</em>. The wizard
                subst's P: to your project folder.
              </li>
              <li>
                Run <em>Extract Game Data</em> to unpack the vanilla
                DayZ PBOs into <code className="font-mono">P:\</code>.
              </li>
              <li>
                Re-check this page. There's a one-shot alternative in{" "}
                <code className="font-mono">tools/DePboTools/bin/dayz2p.cmd</code>{" "}
                (Mikero) that does step 3 on the command line.
              </li>
            </ol>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SigningCard({ env }: { env: ReskinEnvironment }) {
  const ok = env.pDrive.privateKeyPresent;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="h-4 w-4" /> Signing keypair
        </CardTitle>
        <CardDescription>
          Public servers with <code className="font-mono">verifySignatures=2</code> reject
          unsigned mods. The addon signs every built PBO with a
          <code className="mx-1 font-mono">.biprivatekey</code> from
          <code className="mx-1 font-mono">tools/DsUtils/</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60 text-sm">
          <StatusRow
            ok={ok}
            label="At least one .biprivatekey detected"
            detail="Drop an existing keypair into tools/DsUtils/, or let the wizard create one with DSCreateKey on first build."
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function StatusRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <li className="flex items-start gap-3 py-2 pr-2">
      <StatusDot ok={ok} />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {detail ? (
          <div className="text-[11px] text-muted-foreground">{detail}</div>
        ) : null}
      </div>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 text-[10px]",
          ok
            ? "border-severity-success/40 text-severity-success"
            : "border-severity-warning/40 text-severity-warning",
        )}
      >
        {ok ? "ok" : "missing"}
      </Badge>
    </li>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-severity-success" />
  ) : (
    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-severity-error" />
  );
}

/** Kept exported for later use by the wizard entry page, so the
 *  "Open DayZ Tools docs" link is consistent across entry points. */
export function DayZToolsDocsLink() {
  return (
    <a
      className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
      href="https://community.bistudio.com/wiki/DayZ:Modding"
      target="_blank"
      rel="noreferrer"
    >
      DayZ modding docs <ExternalLink className="h-3 w-3" />
    </a>
  );
}
