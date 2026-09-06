import {
  AlertTriangle,
  Archive,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useBackups } from "@/hooks/useProfiles";
import * as tauri from "@/lib/tauri";
import { errorMessage, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { BackupEntry } from "@/types/ipc";

/**
 * Dedicated page for browsing pre-push backups. Lives under Deploy
 * in the new IA. Lifted verbatim out of SyncPage where it used to
 * hang alongside the diff card; Sync now links here instead.
 *
 * Local-mode only: SFTP pushes skip the pre-push backup because
 * downloading the about-to-be-overwritten files first would blow up
 * round-trip time on big missions.
 */
export function BackupsPage() {
  const profile = useProfileStore((s) => s.active);
  const id = profile?.id ?? null;
  const backups = useBackups(id);

  if (!profile) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No profile loaded.
      </div>
    );
  }

  const entries = backups.data ?? [];
  const isLocal = profile.mode === "local";

  const reveal = (backup: BackupEntry) =>
    void tauri
      .syncBackupOpen(profile.id, backup.id)
      .catch((err: unknown) => toast.error(errorMessage(err)));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Archive}
        title="Backups"
        description="Every local-mode push first archives the files it's about to overwrite or delete. Last ten are kept per profile; older snapshots auto-prune on the next push."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void backups.refetch()}
            disabled={backups.isFetching}
          >
            {backups.isFetching ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        }
      />
      <div className="space-y-6 overflow-y-auto p-6">

      {!isLocal ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This profile is in <strong>SFTP</strong> mode. Pre-push
            backups are only captured for local-folder profiles —
            downloading every about-to-change file over SFTP first would
            blow up push round-trip time. Your rollback surface for SFTP
            is the workspace git history (Sync → Open folder → git log).
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Snapshots</CardTitle>
          <CardDescription>
            Each entry holds the server's previous copy of every file
            the matching push changed, plus a <code>manifest.json</code>{" "}
            with the full change set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {backups.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              No backups yet — they are created automatically on the
              next successful local push.
            </div>
          ) : (
            <ul className="divide-y divide-border/60 text-sm">
              {entries.map((e) => (
                <BackupRow key={e.id} entry={e} onReveal={() => reveal(e)} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function BackupRow({
  entry,
  onReveal,
}: {
  entry: BackupEntry;
  onReveal: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-2 pr-2">
      <Archive className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-mono text-xs">{entry.id}</div>
        <div className="text-xs text-muted-foreground">
          {entry.timestamp ? formatRelativeTime(entry.timestamp) : "—"}
          {" · "}
          {entry.fileCount} file(s)
          {" · "}
          {formatBytes(entry.bytes)}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onReveal}
        title={entry.path}
      >
        <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
      </Button>
    </li>
  );
}

// Kept in lock-step with the formatter in SyncPage. Small enough
// that duplicating it is cheaper than a shared helper.
function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b < 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KiB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
}
