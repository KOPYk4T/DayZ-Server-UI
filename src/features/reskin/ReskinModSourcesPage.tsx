import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  FolderPlus,
  FolderTree,
  Loader2,
  Package,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import * as tauri from "@/lib/tauri";
import { errorMessage, formatRelativeTime } from "@/lib/utils";
import type { ModClassIndex, ModSource } from "@/types/ipc";

/** Reskin · Mod sources page.
 *
 *  Lets the operator point at one or more `@*` folders (their
 *  server's mod tree, a workshop subscription, an extracted mod
 *  bundle, …). Each folder is walked for `*.pbo` files and any
 *  classes those PBOs contribute that expose `hiddenSelections*`
 *  arrays land in the reskin browser alongside vanilla.
 *
 *  Distinct from the External PBOs page: that one ships a verbatim
 *  PBO inside the modpack output (no parsing). This page parses the
 *  PBOs to discover reskinnable items inside them. */
export function ReskinModSourcesPage() {
  const qc = useQueryClient();
  const index = useQuery<ModClassIndex>({
    queryKey: ["reskin", "mod-sources"],
    queryFn: () => tauri.reskinModsList(),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["reskin", "mod-sources"] });
  // Refreshing classes also affects the Classes page (which folds
  // mod-sourced rows into its merged list) so invalidate there too.
  const invalidateClasses = () =>
    qc.invalidateQueries({ queryKey: ["reskin", "vanilla-index"] });

  const add = useMutation({
    mutationFn: (folder: string) => tauri.reskinModsAdd(folder),
    onSuccess: (summary) => {
      invalidate();
      invalidateClasses();
      if (summary.cacheHit) {
        toast.success(
          `${summary.classCount} reskinnable class${summary.classCount === 1 ? "" : "es"} (no change)`,
        );
      } else {
        toast.success(
          `Scanned ${summary.addonCount} addon${summary.addonCount === 1 ? "" : "s"} · ${summary.classCount} reskinnable class${summary.classCount === 1 ? "" : "es"}` +
            (summary.skipped ? ` · ${summary.skipped} skipped` : ""),
        );
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => tauri.reskinModsRemove(id),
    onSuccess: () => {
      invalidate();
      invalidateClasses();
      toast.success("Mod source removed");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const pickAndAdd = async () => {
    const picked = await openDialog({
      multiple: true,
      directory: true,
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const p of paths) {
      if (typeof p !== "string") continue;
      await add.mutateAsync(p);
    }
  };

  const sources = index.data?.sources ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={FolderTree}
        title="Mod sources"
        description="Reskin classes from third-party mods alongside vanilla."
        actions={
          <Button onClick={pickAndAdd} disabled={add.isPending}>
            {add.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FolderPlus className="mr-2 h-4 w-4" />
            )}
            Add mod folder
          </Button>
        }
      />

      <div className="flex-1 overflow-auto p-6">
        <Explainer
          title="What this page does"
          subtitle="Scan mod PBOs for reskinnable classes."
          storageKey="reskin-mod-sources"
        >
          <p>
            Pick an <code>@-folder</code> (e.g. <code>@ExpansionMod</code>,{" "}
            <code>@MMG</code>, a workshop bundle) and we'll walk its{" "}
            <code>addons/</code> tree, unpack each PBO, and extract every
            class that exposes <code>hiddenSelections[]</code>. Those
            classes show up on the Classes page tagged with their source
            mod so you can pick them as reskin targets.
          </p>
          <p>
            New mod-introduced classes (not just overrides of vanilla) are
            included — a custom AKM variant a mod ships will appear here
            and become a reskinnable target.
          </p>
          <p>
            When you build the modpack with a reskin whose source came
            from one of these mods, the generated <code>config.cpp</code>'s{" "}
            <code>requiredAddons[]</code> declares the source mod's
            CfgPatches identifiers — DayZ loads the parent mod first so
            the override resolves correctly.
          </p>
        </Explainer>

        {index.isLoading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : null}

        {index.isError ? (
          <Alert className="mt-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2 break-words">
              <div className="font-mono text-xs">
                {errorMessage(index.error)}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        {!index.isLoading && sources.length === 0 ? (
          <div className="mt-8 rounded-md border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p>No mod sources yet.</p>
            <p className="mt-1 text-xs">
              Add an <code>@-folder</code> above and we'll scan its PBOs
              for reskinnable classes.
            </p>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {sources.map((src) => (
            <ModSourceRow
              key={src.id}
              source={src}
              onRefresh={() => add.mutate(src.sourcePath)}
              onRemove={() => {
                if (
                  window.confirm(
                    `Remove ${src.displayName}? Reskin entries that pointed at its classes will keep their cached class data, but new picks won't see them until you re-add the folder.`,
                  )
                ) {
                  remove.mutate(src.id);
                }
              }}
              busy={add.isPending || remove.isPending}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ModSourceRow({
  source,
  onRefresh,
  onRemove,
  busy,
}: {
  source: ModSource;
  onRefresh: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const reskinnableCount = useMemo(
    () =>
      source.classes.filter(
        (c) =>
          c.hiddenSelections.length > 0 ||
          c.hiddenSelectionsTextures.length > 0 ||
          c.hiddenSelectionsMaterials.length > 0,
      ).length,
    [source.classes],
  );
  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary/70" />
            <h3 className="truncate font-mono text-sm font-semibold">
              {source.displayName}
            </h3>
            {source.lastScannedAt ? (
              <Badge variant="outline" className="text-[10px]">
                {formatRelativeTime(source.lastScannedAt)}
              </Badge>
            ) : null}
          </div>
          <p
            className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
            title={source.sourcePath}
          >
            {source.sourcePath}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="text-[10px]">
              {source.addonCount} addon{source.addonCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {reskinnableCount} reskinnable
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {source.classes.length} class{source.classes.length === 1 ? "" : "es"} total
            </Badge>
            {source.cfgPatches.length > 0 ? (
              <Badge variant="outline" className="text-[10px]">
                {source.cfgPatches.length} CfgPatches
              </Badge>
            ) : null}
            {source.skipped.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowSkipped((v) => !v)}
                className="rounded px-1.5 py-0.5 text-[10px] text-severity-warning underline-offset-2 hover:underline"
              >
                {source.skipped.length} skipped
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={onRefresh}
            disabled={busy}
            title="Re-scan this mod"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            disabled={busy}
            title="Remove mod source"
          >
            <Trash2 className="h-4 w-4 text-severity-error/70" />
          </Button>
        </div>
      </div>

      {showSkipped && source.skipped.length > 0 ? (
        <div className="mt-3 rounded border border-severity-warning/40 bg-severity-warning/5 p-2 text-[11px]">
          <p className="mb-1 font-medium text-severity-warning">
            Skipped PBOs
          </p>
          <ul className="space-y-0.5 font-mono">
            {source.skipped.map((s, i) => (
              <li key={i} className="break-all">
                <span className="text-foreground">{s.pbo}</span>:{" "}
                <span className="text-muted-foreground">{s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
