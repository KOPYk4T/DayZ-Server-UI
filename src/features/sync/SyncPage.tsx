import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  FileDiff,
  FilePlus2,
  FileX2,
  FolderOpen,
  GitBranch,
  Loader2,
  Plug,
  RefreshCw,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  useBackups,
  useLocalDiff,
  usePull,
  usePush,
  useRemoteDiff,
  useTestConnection,
  useWorkspaceStatus,
} from "@/hooks/useProfiles";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { DiffSummary, SftpLayoutReport } from "@/types/ipc";

export function SyncPage() {
  const profile = useProfileStore((s) => s.active);
  const navigate = useNavigate();
  const id = profile?.id ?? null;

  const status = useWorkspaceStatus(id);
  const localDiff = useLocalDiff(id);
  const remoteDiff = useRemoteDiff();
  const pull = usePull(id);
  const push = usePush(id);
  const test = useTestConnection();
  const backups = useBackups(id);

  const [pushConfirm, setPushConfirm] = useState<DiffSummary | null>(null);
  // Keep the most recent pull's SFTP layout around so the user can
  // consult it after the toast disappears — "where did it look for
  // serverDZ.cfg" is a question the report answers concretely.
  const [lastLayout, setLastLayout] =
    useState<SftpLayoutReport | null>(null);

  useEffect(() => {
    remoteDiff.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!profile) {
    return <div className="p-6 text-sm text-muted-foreground">No profile loaded.</div>;
  }

  const handlePull = () =>
    pull.mutate(undefined, {
      onSuccess: (r) => {
        setLastLayout(r.sftpLayout ?? null);
        const missingRoots =
          r.sftpLayout?.rootFiles.filter((f) => f.status !== "pulled") ?? [];
        const pulledRoots =
          r.sftpLayout?.rootFiles
            .filter((f) => f.status === "pulled")
            .map((f) => f.name) ?? [];

        if (missingRoots.length > 0) {
          const lockedByServer = missingRoots.some((f) =>
            (f.reason ?? "").toLowerCase().includes("i/o error"),
          );
          toast.warning(
            `pulled ${profile.name} — ${missingRoots.length} root file(s) not found`,
            {
              description: lockedByServer
                ? `Missing: ${missingRoots.map((f) => f.name).join(", ")}. Your hosting panel is blocking reads while the DayZ server is running. Stop the server, re-pull, then start it again.`
                : `Missing: ${missingRoots.map((f) => f.name).join(", ")}. See the "Server layout" card below for the directories we checked.`,
            },
          );
        } else if (r.skipped.length > 0) {
          const preview = r.skipped
            .slice(0, 3)
            .map((s) => s.path.split("/").pop())
            .join(", ");
          const more =
            r.skipped.length > 3 ? ` (+${r.skipped.length - 3} more)` : "";
          toast.warning(
            `pulled ${profile.name} — skipped ${r.skipped.length} file(s)`,
            {
              description: `${preview}${more}. These files are held open by the running server and can't be read over SFTP.`,
            },
          );
        } else {
          const rootSummary =
            pulledRoots.length > 0
              ? ` (including ${pulledRoots.join(", ")})`
              : "";
          toast.success(`pulled ${profile.name}${rootSummary}`);
        }

        // If the edits ledger reapplied anything after the pull,
        // surface that as a separate toast so the operator knows
        // their customisations survived. Silent otherwise.
        const reconciled = r.reconciled;
        if (
          reconciled &&
          (reconciled.added.length > 0 || reconciled.removed.length > 0)
        ) {
          const parts: string[] = [];
          if (reconciled.added.length > 0) {
            parts.push(`${reconciled.added.length} position${reconciled.added.length === 1 ? "" : "s"} re-added`);
          }
          if (reconciled.removed.length > 0) {
            parts.push(`${reconciled.removed.length} re-removed`);
          }
          toast.info(
            `Reapplied edits to cfgeventspawns.xml: ${parts.join(", ")}`,
            {
              description:
                "Your previously-saved positions were restored after the pull.",
            },
          );
        }
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });

  const handlePushReview = () => {
    remoteDiff.mutate(profile.id, {
      onSuccess: (diff) => setPushConfirm(diff),
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const handlePushConfirmed = () => {
    setPushConfirm(null);
    push.mutate(undefined, {
      onSuccess: (res) => {
        const descParts = [`${res.deletedCount} deleted`];
        if (res.backup) {
          descParts.push(
            `backup: ${res.backup.fileCount} file(s) → ${res.backup.id}`,
          );
        }
        toast.success(`pushed ${res.uploadedCount} file(s)`, {
          description: descParts.join(" · "),
        });
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const handleTest = () =>
    test.mutate(profile.id, {
      onSuccess: (res) =>
        res.ok ? toast.success(res.message) : toast.error(res.message),
      onError: (err) =>
        toast.error(errorMessage(err)),
    });

  const handleOpenFolder = () =>
    void tauri
      .profilesOpenWorkspace(profile.id)
      .catch((err: unknown) =>
        toast.error(errorMessage(err)),
      );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={GitBranch}
        title="Sync"
        description="Pull the server's current config, edit locally, review a diff, then push."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTest}
              disabled={test.isPending}
            >
              <Plug className="mr-1.5 h-3.5 w-3.5" />
              {test.isPending ? "Testing…" : "Test connection"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenFolder}>
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              Open folder
            </Button>
          </>
        }
      />

      <div className="space-y-6 overflow-y-auto p-6">

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last pull</CardDescription>
            <CardTitle className="text-lg">
              {formatRelativeTime(status.data?.lastPullAt ?? profile.lastPullAt)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div className="truncate font-mono">
              {status.data?.workspacePath ?? "—"}
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={handlePull}
              disabled={pull.isPending}
            >
              {pull.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Pulling…
                </>
              ) : (
                <>
                  <ArrowDownToLine className="mr-2 h-4 w-4" /> Pull now
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Local changes</CardDescription>
            <CardTitle className="text-lg">
              <DiffCountInline diff={localDiff.data} loading={localDiff.isFetching} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div>
              Git HEAD:{" "}
              <span className="font-mono text-foreground">
                {status.data?.headCommit?.slice(0, 9) ?? "—"}
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => void localDiff.refetch()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-scan
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unpushed</CardDescription>
            <CardTitle className="text-lg">
              {status.data?.unpushedCount ?? 0} commit(s)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div>
              Last push:{" "}
              <span className="text-foreground">
                {formatRelativeTime(status.data?.lastPushAt ?? profile.lastPushAt)}
              </span>
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={handlePushReview}
              disabled={remoteDiff.isPending || push.isPending}
            >
              {remoteDiff.isPending || push.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing…
                </>
              ) : (
                <>
                  <ArrowUpFromLine className="mr-2 h-4 w-4" /> Review & push
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {lastLayout ? <ServerLayoutCard report={lastLayout} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Local diff (workspace vs last pull)</CardTitle>
          <CardDescription>
            Every save auto-commits; these are the files that differ from the
            last-pulled snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DiffList
            diff={localDiff.data}
            loading={localDiff.isFetching}
            error={localDiff.error}
          />
        </CardContent>
      </Card>

      {backups.data && backups.data.length > 0 ? (
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          <Archive className="mr-1.5 inline h-3.5 w-3.5" />
          <strong>{backups.data.length}</strong> pre-push backup
          {backups.data.length === 1 ? "" : "s"} on file.{" "}
          <a
            href="/app/backups"
            onClick={(e) => {
              e.preventDefault();
              navigate("/app/backups");
            }}
            className="text-primary underline-offset-2 hover:underline"
          >
            Manage backups →
          </a>
        </div>
      ) : null}

      <AlertDialog
        open={!!pushConfirm}
        onOpenChange={(v) => !v && setPushConfirm(null)}
      >
        <AlertDialogContent className="w-full !max-w-[min(64rem,92vw)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Review push</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {pushConfirm
                ? `${pushConfirm.addedCount} added, ${pushConfirm.modifiedCount} modified, ${pushConfirm.deletedCount} deleted — ${formatBytes(pushConfirm.totalBytes)}`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Separator />
          <ScrollArea className="max-h-72">
            <DiffList diff={pushConfirm ?? undefined} loading={false} />
          </ScrollArea>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePushConfirmed}>
              Push to server
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

function DiffCountInline({
  diff,
  loading,
}: {
  diff?: DiffSummary;
  loading: boolean;
}) {
  if (loading) return <span className="text-muted-foreground">scanning…</span>;
  if (!diff) return <span>—</span>;
  const total = diff.addedCount + diff.modifiedCount + diff.deletedCount;
  if (total === 0) return <span>clean</span>;
  return (
    <span>
      {total} file{total === 1 ? "" : "s"}
    </span>
  );
}

function DiffList({
  diff,
  loading,
  error,
}: {
  diff?: DiffSummary;
  loading: boolean;
  error?: unknown;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Computing diff…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-severity-error">
        <AlertTriangle className="h-4 w-4" />
        {errorMessage(error)}
      </div>
    );
  }
  if (!diff || diff.changes.length === 0) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        No changes since last pull.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/60 text-sm">
      {diff.changes.map((c) => {
        const Icon =
          c.kind === "added" ? FilePlus2 : c.kind === "deleted" ? FileX2 : FileDiff;
        const color =
          c.kind === "added"
            ? "text-severity-success"
            : c.kind === "deleted"
              ? "text-severity-error"
              : "text-severity-info";
        return (
          <li
            key={`${c.kind}:${c.path}`}
            className="flex min-w-0 items-center gap-2 py-1.5 pr-2"
          >
            <Icon className={cn("h-4 w-4 shrink-0", color)} />
            <span
              className="min-w-0 flex-1 truncate font-mono text-xs"
              title={c.path}
            >
              {c.path}
            </span>
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] uppercase"
            >
              {c.kind}
            </Badge>
            <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
              {c.newSize !== undefined ? formatBytes(c.newSize) : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ServerLayoutCard({ report }: { report: SftpLayoutReport }) {
  const missing = report.rootFiles.filter((f) => f.status !== "pulled");
  const usefulCandidates = report.candidates;
  const ok = missing.length === 0;
  return (
    <Card
      className={
        ok
          ? "border-severity-success/30"
          : "border-severity-warning/40 bg-severity-warning/5"
      }
    >
      <CardHeader>
        <CardTitle className="text-base">Server layout (last pull)</CardTitle>
        <CardDescription>
          {ok
            ? "The pull scanned these directories for your server's root files and found everything expected."
            : "Some root files weren't found on the server. The list below shows each directory we scanned and what was in it — use it to spot the real location."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div>
          <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
            Root files
          </p>
          <ul className="space-y-1">
            {report.rootFiles.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={f.status === "pulled" ? "secondary" : "outline"}
                  className={
                    f.status === "pulled"
                      ? "border-severity-success/40 text-severity-success"
                      : "border-severity-warning/60 text-severity-warning"
                  }
                >
                  {f.status}
                </Badge>
                <code className="font-mono">{f.name}</code>
                {f.remotePath ? (
                  <code className="text-[11px] text-muted-foreground">
                    @ {f.remotePath}
                  </code>
                ) : null}
                {f.reason ? (
                  <span className="text-[11px] text-muted-foreground">
                    — {f.reason}
                  </span>
                ) : null}
              </li>
            ))}
            {report.rootFiles.length === 0 ? (
              <li className="text-muted-foreground">
                No root files were in scope for this pull.
              </li>
            ) : null}
          </ul>
        </div>

        <Separator />

        <div>
          <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
            Directories scanned
          </p>
          <ul className="space-y-2">
            {usefulCandidates.map((c) => (
              <li key={c.dir} className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      c.listed
                        ? "border-severity-success/40 text-severity-success"
                        : "border-severity-error/40 text-severity-error"
                    }
                  >
                    {c.listed ? "ok" : "unreadable"}
                  </Badge>
                  <code className="font-mono">{c.dir || "."}</code>
                  <span className="text-muted-foreground">
                    {c.entryCount} entr{c.entryCount === 1 ? "y" : "ies"}
                  </span>
                </div>
                {c.sampleEntries.length > 0 ? (
                  <p className="pl-2 font-mono text-[11px] text-muted-foreground">
                    {c.sampleEntries.join(" · ")}
                    {c.entryCount > c.sampleEntries.length
                      ? ` · (+${c.entryCount - c.sampleEntries.length} more)`
                      : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {!ok ? (
          <div className="rounded-md border border-severity-warning/40 bg-severity-warning/10 p-2 text-[11px]">
            <p className="font-semibold">Next steps</p>
            {missing.some((f) =>
              (f.reason ?? "").toLowerCase().includes("i/o error"),
            ) ? (
              <p className="mb-2">
                <strong>Is your DayZ server currently running?</strong> Many
                hosting panels (AMP, Pterodactyl, …) lock config files
                while the server holds them open — SFTP reads come back
                as "I/O error" and shell fallbacks often fail too. Stop
                the server from your panel's dashboard, hit Pull again,
                then start it back up. This is the reliable fix.
              </p>
            ) : null}
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>
                Scan the "Directories scanned" list above — does any of them
                contain the missing file? If yes, edit the profile and set
                that directory as the <strong>Server root path</strong>.
              </li>
              <li>
                If none do, use the <strong>Browse</strong> button on the
                profile form to navigate the remote filesystem and find
                the actual location, then set the server root and Pull
                again.
              </li>
              <li>
                If the file is genuinely missing on the server, that's
                fine — the app can still operate without it.
              </li>
            </ol>
          </div>
        ) : null}

        <p className="text-[10px] text-muted-foreground">
          Dismisses on profile switch or next successful Pull with no
          findings to report.
        </p>
      </CardContent>
    </Card>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}

