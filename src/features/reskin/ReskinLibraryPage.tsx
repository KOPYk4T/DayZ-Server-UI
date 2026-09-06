import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ExternalLink,
  FileCode,
  Hammer,
  Library,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as tauri from "@/lib/tauri";
import { errorMessage, formatRelativeTime } from "@/lib/utils";
import type {
  ReskinBuildResult,
  ReskinEntry,
  ReskinRegistry,
} from "@/types/ipc";

export function ReskinLibraryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const registry = useQuery<ReskinRegistry>({
    queryKey: ["reskin", "registry"],
    queryFn: () => tauri.reskinRegistryGet(),
  });

  const remove = useMutation({
    mutationFn: (classname: string) => tauri.reskinRegistryRemove(classname),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reskin", "registry"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const buildAll = useMutation({
    mutationFn: () => tauri.reskinBuildAll(),
    onSuccess: (res) => {
      const parts: string[] = [];
      const reskinCount = res.classesWritten.length - res.configClassesWritten;
      if (reskinCount > 0)
        parts.push(`${reskinCount} reskin${reskinCount === 1 ? "" : "s"}`);
      if (res.configClassesWritten > 0)
        parts.push(
          `${res.configClassesWritten} config class${
            res.configClassesWritten === 1 ? "" : "es"
          }`,
        );
      if (res.externalPbosCopied > 0)
        parts.push(
          `${res.externalPbosCopied} external PBO${
            res.externalPbosCopied === 1 ? "" : "s"
          }`,
        );
      const summary = parts.length > 0 ? parts.join(" · ") : "empty modpack";
      toast.success(`Built modpack — ${summary} in ${res.durationMs} ms`, {
        description: res.pboPath,
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const reskins = registry.data?.reskins ?? [];
  const externalPbos = registry.data?.externalPbos ?? [];
  const configClasses = registry.data?.configClasses ?? [];
  const includedPboCount = externalPbos.filter((e) => e.include).length;
  const modpackEmpty =
    reskins.length === 0 &&
    configClasses.length === 0 &&
    includedPboCount === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Library}
        title="Server Modpack · Overview"
        description="One mod bundling your reskins, author-written config classes, and any external PBOs you've added. Build regenerates the whole thing into a single signed mod folder."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate("/app/reskin/wizard")}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New reskin
            </Button>
            <Button
              size="sm"
              onClick={() => buildAll.mutate()}
              disabled={modpackEmpty || buildAll.isPending}
              title={
                modpackEmpty
                  ? "Add at least one reskin, config class, or external PBO before building"
                  : undefined
              }
            >
              {buildAll.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Hammer className="mr-1.5 h-3.5 w-3.5" />
              )}
              Build mod
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
        {registry.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : registry.error ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {errorMessage(registry.error)}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <ModNameCard registry={registry.data!} />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  What ships in this modpack
                </CardTitle>
                <CardDescription>
                  One PBO with the reskins + config classes below, plus
                  whichever external PBOs you've included. Any non-zero
                  row is enough to build — you don't need all three.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                <SummaryTile
                  icon={<Boxes className="h-4 w-4" />}
                  label="Reskins"
                  count={reskins.length}
                  emptyHint="No reskins yet"
                  onOpen={() => navigate("/app/reskin/wizard")}
                  openLabel="New reskin"
                />
                <SummaryTile
                  icon={<FileCode className="h-4 w-4" />}
                  label="Config classes"
                  count={configClasses.length}
                  emptyHint="No class overrides yet"
                  onOpen={() => navigate("/app/reskin/config")}
                  openLabel="Manage"
                />
                <SummaryTile
                  icon={<Package className="h-4 w-4" />}
                  label="External PBOs"
                  count={includedPboCount}
                  totalCount={externalPbos.length}
                  emptyHint="No PBOs added yet"
                  onOpen={() => navigate("/app/reskin/pbos")}
                  openLabel="Manage"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="h-4 w-4" /> Reskins (
                  {reskins.length})
                </CardTitle>
                <CardDescription>
                  Every registered reskin is packed into the modpack's
                  main PBO on build. Removing an entry here drops it
                  from the next build.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {reskins.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    No reskins yet —{" "}
                    <button
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => navigate("/app/reskin/wizard")}
                    >
                      start a new reskin
                    </button>{" "}
                    to add the first, or leave this section empty and
                    build with just config classes / external PBOs.
                  </div>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {reskins.map((r) => (
                      <ReskinRow
                        key={r.newClassname}
                        entry={r}
                        onEdit={() =>
                          navigate(
                            `/app/reskin/wizard?edit=${encodeURIComponent(r.newClassname)}`,
                          )
                        }
                        onViewInItems={() =>
                          navigate(
                            `/app/items?name=${encodeURIComponent(r.newClassname)}`,
                          )
                        }
                        onRemove={() => {
                          if (
                            window.confirm(
                              `Remove reskin "${r.newClassname}" from the library?`,
                            )
                          ) {
                            remove.mutate(r.newClassname);
                          }
                        }}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {buildAll.data ? (
              <BuildResultCard result={buildAll.data} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ModNameCard({ registry }: { registry: ReskinRegistry }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(registry.modName);
  const dirty = draft.trim() !== registry.modName;

  const save = useMutation({
    mutationFn: (modName: string) => tauri.reskinRegistrySetModName(modName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reskin", "registry"] });
      toast.success("Mod name updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mod folder name</CardTitle>
        <CardDescription>
          Everything in the modpack — reskins, config classes, external
          PBOs — ships under this folder name (
          <code className="font-mono">{registry.modName}/</code>) and
          becomes the PBO prefix internally. Must start with @.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="mod-name">Name</Label>
          <Input
            id="mod-name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono"
            placeholder="@OperatorReskins"
          />
        </div>
        <Button
          onClick={() => save.mutate(draft.trim())}
          disabled={!dirty || save.isPending}
        >
          {save.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function ReskinRow({
  entry,
  onEdit,
  onRemove,
  onViewInItems,
}: {
  entry: ReskinEntry;
  onEdit: () => void;
  onRemove: () => void;
  onViewInItems: () => void;
}) {
  const overrideCount = useMemo(
    () =>
      entry.slots.filter((s) => s.sourceFile || s.sourceColor).length,
    [entry.slots],
  );
  return (
    <li className="flex items-start gap-3 py-2.5">
      <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium">
            {entry.newClassname}
          </span>
          <span className="text-[11px] text-muted-foreground">
            ← <code className="font-mono">{entry.source.name}</code>
          </span>
          <Badge
            variant="outline"
            className="text-[9px]"
            title={
              entry.mode === "replace"
                ? "Source class added to CE ignore list on deploy"
                : "Spawns alongside the source class"
            }
          >
            {entry.mode}
          </Badge>
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {overrideCount} override(s) · updated{" "}
          {formatRelativeTime(entry.updatedAt)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onViewInItems}
          title="Open this reskin in the Items editor — tune nominal, lifetime, usage zones."
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Items
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-severity-error hover:text-severity-error"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function SummaryTile({
  icon,
  label,
  count,
  totalCount,
  emptyHint,
  onOpen,
  openLabel,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  /** When the section supports include/exclude toggles (external
   *  PBOs), show `count / totalCount` — "2 included of 5 added". */
  totalCount?: number;
  emptyHint: string;
  onOpen: () => void;
  openLabel: string;
}) {
  const isEmpty = count === 0;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          {isEmpty ? (
            emptyHint
          ) : totalCount !== undefined && totalCount !== count ? (
            <>
              {count} included <span className="opacity-60">/ {totalCount} added</span>
            </>
          ) : (
            `${count} ${count === 1 ? "item" : "items"}`
          )}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0"
        onClick={onOpen}
      >
        {openLabel}
      </Button>
    </div>
  );
}

function BuildResultCard({ result }: { result: ReskinBuildResult }) {
  const reskinCount =
    result.classesWritten.length - result.configClassesWritten;
  const summaryParts: string[] = [];
  if (reskinCount > 0)
    summaryParts.push(
      `${reskinCount} reskin${reskinCount === 1 ? "" : "s"}`,
    );
  if (result.configClassesWritten > 0)
    summaryParts.push(
      `${result.configClassesWritten} config class${
        result.configClassesWritten === 1 ? "" : "es"
      }`,
    );
  if (result.externalPbosCopied > 0)
    summaryParts.push(
      `${result.externalPbosCopied} external PBO${
        result.externalPbosCopied === 1 ? "" : "s"
      }`,
    );
  return (
    <Alert className="border-severity-success/40 bg-severity-success/10">
      <CheckCircle2 className="h-4 w-4 text-severity-success" />
      <AlertDescription className="space-y-2 text-xs">
        <div>
          <strong>
            Built modpack in {result.durationMs} ms —{" "}
            {summaryParts.length > 0
              ? summaryParts.join(" · ")
              : "empty modpack"}
            .
          </strong>{" "}
          {result.texturesConverted} texture(s) converted ·{" "}
          {result.signed ? "signed" : "unsigned"}.
        </div>
        <div className="font-mono text-[11px]">PBO: {result.pboPath}</div>
        <div className="font-mono text-[11px]">
          types.xml: {result.typesXmlPath}
        </div>
        {result.notes.length ? (
          <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
            {result.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        ) : null}
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground">
            Build log ({result.log.length} step
            {result.log.length === 1 ? "" : "s"})
          </summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 font-mono text-[10px] text-muted-foreground">
            {result.log.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </details>
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void tauri
                .reskinOpenBuild(result.modPath)
                .catch((e: unknown) => toast.error(errorMessage(e)))
            }
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open mod
            folder
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
