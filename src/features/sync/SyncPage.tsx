import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileFormDialog } from "@/features/profiles/ProfileFormDialog";
import { useWorkspaceStatus } from "@/hooks/useProfiles";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  FilePreview,
  ReviewItem,
  ReviewPlan,
  SyncSide,
} from "@/types/ipc";

const ONBOARD_KEY = "dzmgr.syncOnboarded";

export function SyncPage() {
  const profile = useProfileStore((s) => s.active);
  const id = profile?.id ?? null;
  const status = useWorkspaceStatus(id);

  const [fetchSide, setFetchSide] = useState<SyncSide>("local");
  const [resetSide, setResetSide] = useState<SyncSide>("local");
  const [review, setReview] = useState<{
    side: SyncSide;
    kind: "write" | "fetch";
    plan: ReviewPlan;
    resolutions: Record<string, "workspace" | "destination">;
  } | null>(null);
  const [resetAsk, setResetAsk] = useState<SyncSide | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [showOnboard, setShowOnboard] = useState(
    () => localStorage.getItem(ONBOARD_KEY) !== "1",
  );
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    void tauri.syncBootstrap(id).then((r) => {
      if (r) {
        toast.success("Workspace imported from Local server");
        void status.refetch();
      }
    }).catch((e: unknown) => {
      const msg = errorMessage(e);
      if (!msg.includes("set Local server")) toast.error(msg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runProbe = async (side: SyncSide, kind: "write" | "fetch") => {
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
        toast.success(`Fetched ${n} file(s) into the workspace`);
      } else {
        const write = [...review.plan.write.map((w) => w.path), ...keepWork];
        const result = await tauri.syncWrite(id, review.side, write, adopt);
        const dest =
          review.side === "local"
            ? "Local server"
            : (status.data?.remoteLabel ?? "Remote");
        toast.success(
          `Wrote ${result.uploadedCount} file(s) to ${dest}`,
        );
      }
      setReview(null);
      void status.refetch();
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
        `Workspace replaced from ${resetAsk === "local" ? "Local server" : "Remote"}`,
      );
      setResetAsk(null);
      void status.refetch();
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const dismissOnboard = () => {
    localStorage.setItem(ONBOARD_KEY, "1");
    setShowOnboard(false);
  };

  const st = status.data;

  const remoteReady = !!st?.hasSftp;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={ArrowDownToLine}
        title="Sync"
        description="Edit in the workspace. Sync to local to test. Push to Remote when it is ready."
      />

      <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto px-6 py-8">
      {showOnboard ? (
        <aside className="max-w-3xl rounded-md border border-border bg-card px-5 py-6">
          <h2 className="type-section">How Sync works</h2>
          <ol className="mt-5 grid gap-6 sm:grid-cols-3">
            <li className="min-w-0">
              <p className="type-section">Workspace</p>
              <p className="type-hint mt-1.5">
                You edit here. App data cache, not the Steam folder.
              </p>
            </li>
            <li className="min-w-0">
              <p className="type-section">Sync to local</p>
              <p className="type-hint mt-1.5">
                Copy the reviewed diff to your dedicated server and test.
              </p>
            </li>
            <li className="min-w-0">
              <p className="type-section">Push to Remote</p>
              <p className="type-hint mt-1.5">
                Upload that same reviewed diff to SFTP.
              </p>
            </li>
          </ol>
          <div className="mt-6 flex gap-2">
            <Button size="sm" onClick={dismissOnboard}>
              Got it
            </Button>
            <Button size="sm" variant="ghost" onClick={dismissOnboard}>
              Skip
            </Button>
          </div>
        </aside>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            disabled={busy || !st?.localServerPath}
            onClick={() => void runProbe("local", "write")}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sync to local
          </Button>
          <Button
            size="lg"
            variant="secondary"
            disabled={busy || !remoteReady}
            onClick={() => void runProbe("remote", "write")}
          >
            <ArrowUpFromLine className="mr-2 h-4 w-4" />
            Push to Remote
          </Button>
        </div>
        {!remoteReady ? (
          <p className="type-hint">
            Push needs SFTP.{" "}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => setProfileOpen(true)}
            >
              Connect SFTP
            </button>
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="type-section">Places</h2>
          <p className="type-hint">The same files, in three spots.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
        <PlaceCard
          title="Workspace"
          hint="You edit here"
          path={st?.workspacePath}
          meta={
            st?.exists
              ? st.dirty
                ? "uncommitted edits"
                : "ready"
              : st?.localServerPath
                ? "empty — import from Local server"
                : "empty — set Local server or Reset from Remote"
          }
          icon={FileDiff}
          onOpen={
            st?.workspacePath
              ? () => void tauri.profilesOpenWorkspace(profile!.id)
              : undefined
          }
        />
        <PlaceCard
          title="Local server"
          hint="Dedicated folder on this PC"
          path={st?.localServerPath ?? undefined}
          meta={
            !st?.localServerPath
              ? "not set — edit the profile"
              : st.localServerExists
                ? "on disk"
                : "path missing"
          }
          icon={HardDrive}
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
        <PlaceCard
          title="Remote"
          hint="Push destination"
          path={remoteReady ? st?.remoteLabel : undefined}
          meta={remoteReady ? "SFTP" : "not set"}
          icon={Server}
          onOpen={() => setProfileOpen(true)}
          openLabel={remoteReady ? "Edit SFTP" : "Connect SFTP"}
        />
        </div>
      </section>

      <section>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Update workspace</CardTitle>
          <CardDescription>
            Fetch reconciles into the workspace and keeps your other edits.
            Reset replaces the workspace with a full copy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <p className="type-hint">Fetch</p>
            <div className="flex gap-2">
              <Select
                value={fetchSide}
                onValueChange={(v) => setFetchSide(v as SyncSide)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="remote" disabled={!st?.hasSftp}>
                    Remote
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={busy || (fetchSide === "local" && !st?.localServerPath)}
                onClick={() => void runProbe(fetchSide, "fetch")}
              >
                Fetch
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="type-hint">Reset</p>
            <div className="flex gap-2">
              <Select
                value={resetSide}
                onValueChange={(v) => setResetSide(v as SyncSide)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="remote" disabled={!st?.hasSftp}>
                    Remote
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={busy || (resetSide === "local" && !st?.localServerPath)}
                onClick={() => setResetAsk(resetSide)}
              >
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </section>
      </div>

      <ProfileFormDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
      />

      <AlertDialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {review?.kind === "fetch" ? "Fetch into workspace" : "Review write"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {review?.kind === "write"
                ? `Files that will be written to ${review.side === "local" ? "Local server" : "Remote"}. Adopted files come from the destination. Conflicts need a choice.`
                : "Reconcile into the workspace. Conflicts need a choice. Other workspace edits stay."}
            </AlertDialogDescription>
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
              disabled={busy || (review?.plan.conflicts.length ?? 0) > 0 && false}
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

      <AlertDialog open={!!resetAsk} onOpenChange={(o) => !o && setResetAsk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset workspace</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces mpmissions, profiles, and serverDZ.cfg in the
              workspace with a full copy from{" "}
              {resetAsk === "local" ? "Local server" : "Remote"}. Unsynced
              workspace edits in those trees are lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmReset()}>
              Reset workspace
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
  icon: Icon,
  onOpen,
  openLabel = "Open folder",
}: {
  title: string;
  hint: string;
  path?: string | null;
  meta: string;
  icon: React.ComponentType<{ className?: string }>;
  onOpen?: () => void;
  openLabel?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-4 py-4">
      <div className="type-section flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        {title}
      </div>
      <p className="type-hint mt-1">{hint}</p>
      <p className="type-mono mt-3 truncate" title={path ?? ""}>
        {path || "—"}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="type-hint">{meta}</p>
        {onOpen ? (
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onOpen}>
            <FolderOpen className="mr-1 h-3 w-3" />
            {openLabel}
          </Button>
        ) : null}
      </div>
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
                  <li key={item.path} className="flex flex-wrap items-center gap-2">
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
              l.startsWith("+") && !l.startsWith("+++") && "text-severity-success",
              l.startsWith("-") && !l.startsWith("---") && "text-severity-error",
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
