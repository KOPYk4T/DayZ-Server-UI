import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  FileDiff,
  FolderOpen,
  HardDrive,
  Loader2,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import { openPath } from "@tauri-apps/plugin-opener";

import { PageHeader } from "@/components/layout/PageHeader";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProfileFormDialog } from "@/features/profiles/ProfileFormDialog";
import {
  ChangesPanel,
  type ChangesTab,
} from "@/features/sync/ChangesPanel";
import {
  useLocalDiff,
  useWorkspaceLog,
  useWorkspaceStatus,
} from "@/hooks/useProfiles";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { FilePreview, ReviewItem, ReviewPlan, SyncSide } from "@/types/ipc";

type ReviewKind = "write" | "fetch";
type NextHop = "copy-local" | "merge-local" | "send-prod" | null;

export function SyncPage() {
  const profile = useProfileStore((s) => s.active);
  const id = profile?.id ?? null;
  const status = useWorkspaceStatus(id);
  const localDiff = useLocalDiff(id);
  const workspaceLog = useWorkspaceLog(id);
  const [changesTab, setChangesTab] = useState<ChangesTab>("local");

  const [review, setReview] = useState<{
    side: SyncSide;
    kind: ReviewKind;
    plan: ReviewPlan;
    resolutions: Record<string, "workspace" | "destination">;
  } | null>(null);
  const [resetAsk, setResetAsk] = useState<SyncSide | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    void tauri
      .syncBootstrap(id)
      .then((r) => {
        if (r) {
          toast.success("Workspace imported from Local server");
          void status.refetch();
        }
      })
      .catch((e: unknown) => {
        const msg = errorMessage(e);
        if (!msg.includes("set Local server")) toast.error(msg);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runProbe = async (side: SyncSide, kind: ReviewKind) => {
    if (!id) return;
    setBusy(true);
    try {
      const plan = await tauri.syncProbe(id, side);
      setReview({
        side,
        kind,
        plan,
        resolutions: Object.fromEntries(
          plan.conflicts.map((c) => [c.path, "workspace" as const]),
        ),
      });
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmReview = async () => {
    if (!id || !review) return;
    setBusy(true);
    try {
      const keepDest = review.plan.conflicts
        .filter((c) => review.resolutions[c.path] === "destination")
        .map((c) => c.path);
      const keepWork = review.plan.conflicts
        .filter((c) => review.resolutions[c.path] !== "destination")
        .map((c) => c.path);
      const adopt = [...review.plan.adopt.map((a) => a.path), ...keepDest];
      if (review.kind === "fetch") {
        const n = await tauri.syncFetch(id, review.side, adopt);
        toast.success(`Merged ${n} file(s) into the workspace`);
      } else {
        const write = [...review.plan.write.map((w) => w.path), ...keepWork];
        const result = await tauri.syncWrite(id, review.side, write, adopt);
        const dest =
          review.side === "local"
            ? "Local server"
            : (status.data?.remoteLabel ?? "Production");
        toast.success(`Sent ${result.uploadedCount} file(s) to ${dest}`);
      }
      setReview(null);
      void status.refetch();
      void localDiff.refetch();
      void workspaceLog.refetch();
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmReset = async () => {
    if (!id || !resetAsk) return;
    setBusy(true);
    try {
      await tauri.syncReset(id, resetAsk);
      toast.success(
        `Workspace replaced from ${resetAsk === "local" ? "Local server" : "Production"}`,
      );
      setResetAsk(null);
      void status.refetch();
      void localDiff.refetch();
      void workspaceLog.refetch();
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const st = status.data;
  const remoteReady = !!st?.hasSftp;
  const pendingLocal =
    (localDiff.data?.addedCount ?? 0) +
    (localDiff.data?.modifiedCount ?? 0) +
    (localDiff.data?.deletedCount ?? 0);

  const nextHop: NextHop = !st?.localServerPath
    ? null
    : !st.exists
      ? "merge-local"
      : pendingLocal > 0
        ? "copy-local"
        : remoteReady
          ? "send-prod"
          : null;

  const reviewTitle = review
    ? review.kind === "write"
      ? review.side === "local"
        ? "Copy to Local server"
        : "Send to production"
      : review.side === "local"
        ? "Merge from Local server"
        : "Merge from production"
    : "";

  const reviewBody = review
    ? review.kind === "write"
      ? review.side === "local"
        ? "Files that will be copied from the workspace to the dedicated folder on this PC. Review, then confirm."
        : "Files that will be uploaded from the workspace to production (SFTP). Same files you test on Local server."
      : "Files that will be merged into the workspace. Other workspace edits stay. Conflicts need a choice."
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={ArrowLeftRight}
        title="Sync"
        description="Edit in Workspace. Copy to Local to test. Send to production when the test looks right."
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-6">
        <div className="flex shrink-0 flex-col gap-2 lg:flex-row lg:items-stretch">
          <PlaceCard
            icon={FileDiff}
            title="Workspace"
            hint="You edit here. App data, not Steam."
            path={st?.workspacePath}
            meta={
              st?.exists
                ? st.dirty
                  ? "Uncommitted edits"
                  : pendingLocal > 0
                    ? `${pendingLocal} file${pendingLocal === 1 ? "" : "s"} not on Local`
                    : "In sync with Local"
                : st?.localServerPath
                  ? "Empty — merge from Local server"
                  : "Empty — set Local server first"
            }
            metaTone={
              st?.exists && (st.dirty || pendingLocal > 0)
                ? "warning"
                : "muted"
            }
            onMetaClick={
              st?.exists
                ? () =>
                    setChangesTab(st.dirty ? "history" : "local")
                : undefined
            }
            onOpen={
              st?.workspacePath
                ? () => void tauri.profilesOpenWorkspace(profile!.id)
                : undefined
            }
          />

          <HopRail>
            <HopButton
              forward
              label="Copy to Local"
              hint="Review the workspace diff, then copy it to the dedicated folder."
              disabled={busy || !st?.localServerPath}
              primary={nextHop === "copy-local"}
              onClick={() => void runProbe("local", "write")}
            />
            <HopButton
              forward={false}
              label="Merge from Local"
              hint="Bring Local server files into the workspace. Keeps your other edits."
              disabled={busy || !st?.localServerPath}
              primary={nextHop === "merge-local"}
              onClick={() => void runProbe("local", "fetch")}
            />
            <button
              type="button"
              disabled={busy || !st?.localServerPath}
              onClick={() => setResetAsk("local")}
              className="type-hint text-center underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
            >
              Replace workspace from Local
            </button>
          </HopRail>

          <PlaceCard
            icon={HardDrive}
            title="Local server"
            hint="Dedicated folder on this PC. Test here."
            path={st?.localServerPath ?? undefined}
            meta={
              !st?.localServerPath
                ? "Not set — edit the profile"
                : st.localServerExists
                  ? pendingLocal > 0
                    ? `${pendingLocal} file${pendingLocal === 1 ? "" : "s"} behind workspace`
                    : "On disk"
                  : "Path missing"
            }
            metaTone={
              st?.localServerExists && pendingLocal > 0 ? "warning" : "muted"
            }
            onMetaClick={
              st?.localServerPath
                ? () => setChangesTab("local")
                : undefined
            }
            onOpen={
              st?.localServerPath
                ? () =>
                    void openPath(st.localServerPath!).catch((e: unknown) =>
                      toast.error(errorMessage(e)),
                    )
                : () => setProfileOpen(true)
            }
            openLabel={st?.localServerPath ? "Open folder" : "Set in profile"}
          />

          <HopRail>
            <HopButton
              forward
              label="Send to production"
              hint="Upload the workspace to SFTP. Production receives the workspace, not a separate local-only copy."
              disabled={busy || !remoteReady}
              primary={nextHop === "send-prod"}
              onClick={() => void runProbe("remote", "write")}
            />
            <HopButton
              forward={false}
              label="Merge from production"
              hint="Bring production files into the workspace. Keeps your other edits."
              disabled={busy || !remoteReady}
              onClick={() => void runProbe("remote", "fetch")}
            />
            <button
              type="button"
              disabled={busy || !remoteReady}
              onClick={() => setResetAsk("remote")}
              className="type-hint text-center underline-offset-2 hover:text-foreground hover:underline disabled:opacity-40"
            >
              Replace workspace from Production
            </button>
          </HopRail>

          <PlaceCard
            icon={Server}
            title="Production"
            hint="Remote SFTP. Live server."
            path={remoteReady ? st?.remoteLabel : undefined}
            meta={
              remoteReady
                ? st && st.unpushedCount > 0
                  ? `${st.unpushedCount} workspace save${st.unpushedCount === 1 ? "" : "s"} not sent to production · last ${formatRelativeTime(st.lastPushAt)}`
                  : `Last sent ${formatRelativeTime(st?.lastPushAt)}`
                : "Not set"
            }
            metaTone={
              remoteReady && (st?.unpushedCount ?? 0) > 0 ? "warning" : "muted"
            }
            onMetaClick={
              remoteReady ? () => setChangesTab("history") : undefined
            }
            onOpen={() => setProfileOpen(true)}
            openLabel={remoteReady ? "Edit SFTP" : "Connect SFTP"}
          />
        </div>

        {!st?.localServerPath ? (
          <p className="type-hint">
            Copy to Local needs a dedicated folder.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setProfileOpen(true)}
            >
              Set Local server
            </button>
          </p>
        ) : !remoteReady ? (
          <p className="type-hint">
            Send to production needs SFTP.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setProfileOpen(true)}
            >
              Connect SFTP
            </button>
          </p>
        ) : pendingLocal > 0 && nextHop === "copy-local" ? (
          <p className="type-hint">
            Copy to Local first. Production uploads the workspace — test the
            dedicated folder before you send.
          </p>
        ) : null}

        {id ? (
          <ChangesPanel
            profileId={id}
            localDiff={localDiff.data}
            log={workspaceLog.data}
            tab={changesTab}
            onTabChange={setChangesTab}
          />
        ) : null}
      </div>

      <ProfileFormDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
      />

      <AlertDialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{reviewTitle}</AlertDialogTitle>
            <AlertDialogDescription>{reviewBody}</AlertDialogDescription>
          </AlertDialogHeader>
          {review ? (
            <ReviewBody
              plan={review.plan}
              resolutions={review.resolutions}
              onResolve={(path, choice) =>
                setReview({
                  ...review,
                  resolutions: { ...review.resolutions, [path]: choice },
                })
              }
              onPreview={(path) => {
                if (!id) return;
                void tauri
                  .syncFilePreview(id, review.side, path)
                  .then(setPreview)
                  .catch((e: unknown) => toast.error(errorMessage(e)));
              }}
            />
          ) : null}
          {preview ? (
            <UnifiedDiff preview={preview} onClose={() => setPreview(null)} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmReview();
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!resetAsk}
        onOpenChange={(o) => !o && setResetAsk(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Replace workspace from{" "}
              {resetAsk === "local" ? "Local server" : "Production"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This replaces mpmissions, profiles, and serverDZ.cfg in the
              workspace with a full copy from{" "}
              {resetAsk === "local" ? "Local server" : "Production"}. Unsynced
              workspace edits in those trees are lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmReset()}>
              Replace workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlaceCard({
  title,
  hint,
  path,
  meta,
  metaTone = "muted",
  icon: Icon,
  onMetaClick,
  onOpen,
  openLabel = "Open folder",
}: {
  title: string;
  hint: string;
  path?: string | null;
  meta: string;
  metaTone?: "muted" | "warning";
  icon: ComponentType<{ className?: string }>;
  onMetaClick?: () => void;
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <Card className="min-w-0 flex-1">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="type-block text-[1.25rem]">{title}</CardTitle>
            <p className="type-hint">{hint}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="type-mono truncate" title={path ?? ""}>
          {path || "—"}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2">
          {onMetaClick ? (
            <button
              type="button"
              onClick={onMetaClick}
              className={cn(
                "rounded-md border px-2 py-1 text-left transition-colors hover:bg-accent",
                metaTone === "warning"
                  ? "border-severity-warning/30 bg-severity-warning/10 text-severity-warning"
                  : "border-border type-hint hover:text-foreground",
              )}
            >
              {meta}
            </button>
          ) : (
            <p className="type-hint">{meta}</p>
          )}
          {onOpen ? (
            <Button size="sm" variant="outline" onClick={onOpen}>
              <FolderOpen />
              {openLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function HopRail({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-row items-center justify-center gap-6 px-1 py-2 lg:w-36 lg:flex-col lg:gap-4">
      {children}
    </div>
  );
}

function HopButton({
  forward,
  label,
  hint,
  onClick,
  disabled,
  primary,
}: {
  forward: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        title={hint}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "flex size-11 items-center justify-center rounded-md border transition-colors",
          primary
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-foreground/55 bg-transparent text-foreground hover:bg-foreground hover:text-background",
          disabled && "pointer-events-none opacity-40",
        )}
      >
        {forward ? (
          <>
            <ArrowRight className="hidden size-4 lg:block" />
            <ArrowDown className="size-4 lg:hidden" />
          </>
        ) : (
          <>
            <ArrowLeft className="hidden size-4 lg:block" />
            <ArrowUp className="size-4 lg:hidden" />
          </>
        )}
      </button>
      <span className="type-hint max-w-28 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function ReviewBody({
  plan,
  resolutions,
  onResolve,
  onPreview,
}: {
  plan: ReviewPlan;
  resolutions: Record<string, "workspace" | "destination">;
  onResolve: (path: string, choice: "workspace" | "destination") => void;
  onPreview: (path: string) => void;
}) {
  const sections: { title: string; items: ReviewItem[]; tone: string }[] = [
    { title: "Write", items: plan.write, tone: "text-severity-info" },
    { title: "Adopt", items: plan.adopt, tone: "text-severity-success" },
    { title: "Conflict", items: plan.conflicts, tone: "text-severity-error" },
  ];
  if (plan.write.length + plan.adopt.length + plan.conflicts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to do.</p>;
  }
  return (
    <ScrollArea className="max-h-72">
      <div className="space-y-4 text-sm">
        {sections.map((s) =>
          s.items.length === 0 ? null : (
            <div key={s.title}>
              <p className={cn("mb-1 font-medium", s.tone)}>
                {s.title} ({s.items.length})
              </p>
              <ul className="space-y-1">
                {s.items.map((item) => (
                  <li
                    key={item.path}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-mono text-xs underline-offset-2 hover:underline"
                      onClick={() => onPreview(item.path)}
                    >
                      {item.path}
                    </button>
                    {s.title === "Conflict" ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={
                            resolutions[item.path] === "workspace"
                              ? "default"
                              : "outline"
                          }
                          onClick={() => onResolve(item.path, "workspace")}
                        >
                          Keep workspace
                        </Button>
                        <Button
                          size="sm"
                          variant={
                            resolutions[item.path] === "destination"
                              ? "default"
                              : "outline"
                          }
                          onClick={() => onResolve(item.path, "destination")}
                        >
                          Keep destination
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </ScrollArea>
  );
}

function UnifiedDiff({
  preview,
  onClose,
}: {
  preview: FilePreview;
  onClose: () => void;
}) {
  const lines = useMemo(
    () => unified(preview.destText ?? "", preview.workspaceText ?? ""),
    [preview],
  );
  if (preview.binary) {
    return (
      <p className="text-xs text-muted-foreground">
        Binary file — it will be replaced as a whole.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
        <span>{preview.path} (destination vs workspace)</span>
        <button type="button" onClick={onClose}>
          Close diff
        </button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-5">
        {lines.map((l, i) => (
          <div
            key={i}
            className={cn(
              l.startsWith("+") &&
                !l.startsWith("+++") &&
                "text-severity-success",
              l.startsWith("-") &&
                !l.startsWith("---") &&
                "text-severity-error",
            )}
          >
            {l}
          </div>
        ))}
      </pre>
    </div>
  );
}

function unified(a: string, b: string): string[] {
  const al = a.split(/\r?\n/);
  const bl = b.split(/\r?\n/);
  const out: string[] = [];
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    const L = al[i];
    const R = bl[i];
    if (L === R) out.push(` ${L ?? ""}`);
    else {
      if (L !== undefined) out.push(`-${L}`);
      if (R !== undefined) out.push(`+${R}`);
    }
  }
  return out.slice(0, 400);
}
