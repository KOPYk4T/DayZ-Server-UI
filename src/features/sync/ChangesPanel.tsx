import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileDiff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import type {
  ChangeKind,
  DiffSummary,
  FilePreview,
  WorkspaceCommit,
} from "@/types/ipc";

export type ChangesTab = "local" | "history";

export function ChangesPanel({
  profileId,
  localDiff,
  log,
  tab,
  onTabChange,
}: {
  profileId: string;
  localDiff?: DiffSummary;
  log?: WorkspaceCommit[];
  tab: ChangesTab;
  onTabChange: (tab: ChangesTab) => void;
}) {
  const changes = (localDiff?.changes ?? []).filter(
    (c) => !isRuntimeNoise(c.path),
  );
  const history = (log ?? []).filter(
    (c) =>
      c.message !== "ignore runtime logs" &&
      (c.files.length === 0 || c.files.some((p) => !isRuntimeNoise(p))),
  );
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [commitSha, setCommitSha] = useState<string | null>(null);
  const [commitPath, setCommitPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedCommit =
    history.find((c) => c.sha === commitSha) ?? history[0];
  const selectedFiles = (selectedCommit?.files ?? []).filter(
    (p) => !isRuntimeNoise(p),
  );

  useEffect(() => {
    if (tab !== "local") return;
    if (!localPath && changes[0]) setLocalPath(changes[0].path);
  }, [tab, localPath, changes]);

  useEffect(() => {
    if (tab !== "local" || !localPath || !profileId) {
      if (tab === "local" && !localPath) setPreview(null);
      return;
    }
    setLoading(true);
    void tauri
      .syncFilePreview(profileId, "local", localPath)
      .then(setPreview)
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [tab, localPath, profileId]);

  useEffect(() => {
    if (tab !== "history" || !selectedCommit || !commitPath || !profileId) {
      if (tab === "history" && !commitPath) setPreview(null);
      return;
    }
    setLoading(true);
    void tauri
      .syncWorkspaceCommitPreview(profileId, selectedCommit.sha, commitPath)
      .then(setPreview)
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [tab, selectedCommit?.sha, commitPath, profileId]);

  useEffect(() => {
    if (!commitSha && history[0]) setCommitSha(history[0].sha);
  }, [commitSha, history]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-0">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <FileDiff className="size-4 text-muted-foreground" />
            </span>
            <div className="max-w-208 space-y-1">
              <CardTitle className="type-block text-[1.25rem]">
                Review
              </CardTitle>
              <p className="type-body">
                This pane does not move files. It only shows what would
                change. The arrows between the cards above do the write.
              </p>
            </div>
          </div>
          <Tabs
            value={tab}
            onValueChange={(v) => onTabChange(v as ChangesTab)}
          >
            <TabsList variant="line">
              <TabsTrigger value="local">
                Not on Local yet
                {changes.length > 0 ? (
                  <span className="type-mono tabular-nums">
                    {changes.length}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="history">
                Workspace history
                {history.length > 0 ? (
                  <span className="type-mono tabular-nums">{history.length}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0 pb-0">
        <Tabs
          value={tab}
          onValueChange={(v) => onTabChange(v as ChangesTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsContent
            value="local"
            className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <Guide
              steps={[
                "Left list: workspace files that are not the same as the dedicated folder.",
                "Click a file. Red is Local server today. Green is your workspace edit.",
                "When the list looks right, press Copy to Local above. Then restart the dedicated server to test.",
              ]}
            />
            {changes.length === 0 ? (
              <p className="type-hint max-w-[65ch] px-6 py-5">
                Workspace and Local server match. Edit Types or other
                mission files — they show up here until you copy them.
              </p>
            ) : (
              <SplitReview
                sidebarTitle="Files"
                sidebarHint={`${changes.length} to copy to Local`}
                sidebar={
                  <ul>
                    {changes.map((c) => (
                      <FileRow
                        key={c.path}
                        path={c.path}
                        kind={c.kind}
                        active={localPath === c.path}
                        onClick={() => setLocalPath(c.path)}
                      />
                    ))}
                  </ul>
                }
                loading={loading}
                preview={preview}
                previewTitle="Diff"
                empty="Click a file. Nothing is written until you press Copy to Local."
                legend="Red (−) Local now · Green (+) workspace"
              />
            )}
          </TabsContent>
          <TabsContent
            value="history"
            className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
          >
            <Guide
              steps={[
                "Workspace only. Each time you save in this app, the Workspace folder keeps a snapshot. Local server and Production are not in this list.",
                "Click a snapshot, then a file, to see what that workspace save changed.",
                "Looking does not touch Local or Production. To test, go to Not on Local yet and press Copy to Local.",
              ]}
            />
            <div className="grid min-h-0 flex-1 grid-cols-[14rem_16rem_minmax(0,1fr)]">
              <ScrollCol>
                <ColHead
                  title="Snapshots"
                  hint="Workspace only. Newest first."
                />
                {history.length === 0 ? (
                  <p className="type-hint p-3">
                    No saves yet. Change a type or event and save — it
                    lands here automatically.
                  </p>
                ) : (
                  <ul>
                    {history.map((c) => {
                      const n = c.files.filter((p) => !isRuntimeNoise(p)).length;
                      return (
                      <li key={c.sha}>
                        <button
                          type="button"
                          onClick={() => {
                            setCommitSha(c.sha);
                            setCommitPath(null);
                            setPreview(null);
                          }}
                          className={cn(
                            "flex min-h-14 w-full flex-col justify-center px-3 py-2 text-left hover:bg-muted/60",
                            selectedCommit?.sha === c.sha && "bg-muted",
                          )}
                        >
                          <p className="type-section truncate">{c.message}</p>
                          <p className="type-hint mt-0.5">
                            {formatRelativeTime(c.committedAt)}
                            {n > 0
                              ? ` · ${n} file${n === 1 ? "" : "s"}`
                              : ""}
                          </p>
                        </button>
                      </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollCol>
              <ScrollCol className="border-l border-border">
                <ColHead
                  title="Files"
                  hint="This snapshot only."
                />
                {!selectedCommit ? (
                  <p className="type-hint p-3">Choose a snapshot on the left.</p>
                ) : selectedFiles.length === 0 ? (
                  <p className="type-hint p-3">
                    No mission files in this snapshot (logs are hidden).
                  </p>
                ) : (
                  <ul>
                    {selectedFiles.map((path) => (
                      <FileRow
                        key={path}
                        path={path}
                        active={commitPath === path}
                        onClick={() => setCommitPath(path)}
                      />
                    ))}
                  </ul>
                )}
              </ScrollCol>
              <div className="flex min-h-0 flex-col border-l border-border">
                <ColHead
                  title="Diff"
                  hint="Red = before · Green = after"
                />
                <div className="min-h-0 flex-1">
                  {loading ? (
                    <LoadingDiff />
                  ) : preview ? (
                    <DiffView preview={preview} />
                  ) : (
                    <p className="type-hint p-4">
                      Click a file in the middle column. This does not
                      copy or push anything.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function Guide({ steps }: { steps: string[] }) {
  return (
    <ol className="shrink-0 space-y-1 border-b border-border bg-muted/30 px-6 py-3">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2.5 type-hint">
          <span className="type-mono w-4 shrink-0 text-muted-foreground">
            {i + 1}.
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function ColHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-14 shrink-0 flex-col justify-center border-b border-border px-3">
      <p className="type-section truncate">{title}</p>
      <p className="type-hint mt-0.5 truncate">{hint}</p>
    </div>
  );
}

function isRuntimeNoise(path: string): boolean {
  const key = path.replaceAll("\\", "/");
  const parts = key.split("/");
  if (
    parts.some((p) => {
      const l = p.toLowerCase();
      return l === "logs" || l === "log";
    })
  ) {
    return true;
  }
  const name = (parts.at(-1) ?? "").toLowerCase();
  return (
    name.endsWith(".rpt") ||
    name.endsWith(".adm") ||
    name.endsWith(".log") ||
    name.endsWith(".mdmp") ||
    name.endsWith(".dmp")
  );
}

function SplitReview({
  sidebarTitle,
  sidebarHint,
  sidebar,
  loading,
  preview,
  previewTitle,
  empty,
  legend,
}: {
  sidebarTitle: string;
  sidebarHint: string;
  sidebar: ReactNode;
  loading: boolean;
  preview: FilePreview | null;
  previewTitle: string;
  empty: string;
  legend: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)]">
      <ScrollCol>
        <ColHead title={sidebarTitle} hint={sidebarHint} />
        {sidebar}
      </ScrollCol>
      <div className="flex min-h-0 flex-col border-l border-border">
        <ColHead title={previewTitle} hint={legend} />
        <div className="min-h-0 flex-1">
          {loading ? (
            <LoadingDiff />
          ) : preview ? (
            <DiffView preview={preview} />
          ) : (
            <p className="type-hint p-4">{empty}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ScrollCol({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-h-0 overflow-y-auto", className)}>{children}</div>
  );
}

function FileRow({
  path,
  kind,
  active,
  onClick,
}: {
  path: string;
  kind?: ChangeKind;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-muted/60",
          active && "bg-muted",
        )}
      >
        {kind ? <KindMark kind={kind} /> : null}
        <span className="type-mono min-w-0 truncate" title={path}>
          {path}
        </span>
      </button>
    </li>
  );
}

function KindMark({ kind }: { kind: ChangeKind }) {
  const label = kind === "added" ? "A" : kind === "deleted" ? "D" : "M";
  const title =
    kind === "added"
      ? "Added — only in the workspace"
      : kind === "deleted"
        ? "Deleted — Local still has it"
        : "Modified — both copies differ";
  const color =
    kind === "added"
      ? "text-severity-success"
      : kind === "deleted"
        ? "text-severity-error"
        : "text-severity-warning";
  return (
    <span className={cn("type-mono w-3 shrink-0", color)} title={title}>
      {label}
    </span>
  );
}

function LoadingDiff() {
  return (
    <p className="type-hint flex items-center gap-2 p-4">
      <Loader2 className="size-3 animate-spin" /> Loading
    </p>
  );
}

export function DiffView({ preview }: { preview: FilePreview }) {
  const lines = useMemo(
    () => unified(preview.destText ?? "", preview.workspaceText ?? ""),
    [preview],
  );
  if (preview.binary) {
    return (
      <p className="type-hint p-4">
        Binary file — the whole file would be replaced. No line preview.
      </p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="type-mono shrink-0 truncate border-b border-border px-3 py-2">
        {preview.path}
      </p>
      <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-5">
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
