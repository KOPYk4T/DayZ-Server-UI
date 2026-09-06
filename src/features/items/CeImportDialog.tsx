import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileQuestion,
  FolderOpen,
  Import,
  Loader2,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useCeImportApply, useCeImportScan } from "@/hooks/useCeImport";
import { cn, errorMessage } from "@/lib/utils";
import type {
  CeFileKind,
  ClassificationSignal,
  ImportPlan,
  ScannedFile,
} from "@/types/ipc";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Pre-populate the source folder and auto-run the scan on open.
   *  Used by the Mods page to jump straight into reviewing a
   *  specific mod's CE fragments without an extra folder-picker
   *  round-trip. */
  initialSourceDir?: string | null;
}

const KIND_COLOR: Record<CeFileKind, string> = {
  types: "text-primary",
  spawnabletypes: "text-severity-info",
  events: "text-severity-info",
  eventposdef: "text-severity-info",
  randompresets: "text-severity-info",
  economy_core: "text-severity-warning",
  unknown: "text-muted-foreground",
};

export function CeImportDialog({
  open,
  onOpenChange,
  initialSourceDir,
}: Props) {
  const scan = useCeImportScan();
  const apply = useCeImportApply();

  const [sourceDir, setSourceDir] = useState<string>("");
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [destFolder, setDestFolder] = useState<string>("");
  const [overwrite, setOverwrite] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSourceDir("");
      setPlan(null);
      setDestFolder("");
      setOverwrite(false);
      setSelected(new Set());
      scan.reset();
      apply.reset();
      return;
    }
    // Auto-scan the supplied folder on open so Mods-page imports
    // skip the folder-picker step.
    if (initialSourceDir) {
      setSourceDir(initialSourceDir);
      scan.mutate(initialSourceDir, {
        onSuccess: (p) => {
          setPlan(p);
          setDestFolder(p.suggestedDestFolder);
          setSelected(
            new Set(
              p.files.filter((f) => f.importable).map((f) => f.relativePath),
            ),
          );
        },
        onError: (err) => toast.error(errorMessage(err)),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSourceDir]);

  const pickFolder = async () => {
    const picked = await openDialog({ directory: true, multiple: false });
    if (typeof picked === "string") {
      setSourceDir(picked);
      scan.mutate(picked, {
        onSuccess: (p) => {
          setPlan(p);
          setDestFolder(p.suggestedDestFolder);
          setSelected(
            new Set(
              p.files
                .filter((f) => f.importable)
                .map((f) => f.relativePath),
            ),
          );
        },
        onError: (err) =>
          toast.error(errorMessage(err)),
      });
    }
  };

  const toggleFile = (rel: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rel)) next.delete(rel);
      else next.add(rel);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    if (!plan) return;
    if (on) {
      setSelected(
        new Set(plan.files.filter((f) => f.importable).map((f) => f.relativePath)),
      );
    } else {
      setSelected(new Set());
    }
  };

  const runImport = () => {
    if (!plan || selected.size === 0 || destFolder.trim() === "") return;
    apply.mutate(
      {
        sourceRoot: plan.sourceRoot,
        destFolder: destFolder.trim(),
        relativePaths: Array.from(selected),
        overwrite,
      },
      {
        onSuccess: (res) => {
          if (res.importedCount === 0) {
            // Every file got skipped or failed. Don't pretend this
            // was a success — surface the first reason so the
            // operator knows where to look. The full per-file log
            // is in the ResultView below.
            const firstReason = res.entries.find(
              (e) => e.status !== "imported",
            )?.message;
            toast.warning("No files were imported", {
              description: firstReason
                ? `First skip reason: ${firstReason}. See the per-file log for the rest.`
                : "See the per-file log below for each file's reason.",
            });
            return;
          }
          toast.success(
            `imported ${res.importedCount} file${res.importedCount === 1 ? "" : "s"} into ${res.destFolder}/`,
            {
              description: res.cfgeconomycoreUpdated
                ? "cfgeconomycore.xml updated with new <ce> blocks"
                : "cfgeconomycore.xml unchanged — these entries already existed",
            },
          );
        },
        onError: (err) =>
          toast.error(errorMessage(err)),
      },
    );
  };

  const selectedCount = selected.size;
  const importableSelectedByKind = useMemo(() => {
    if (!plan) return new Map<CeFileKind, number>();
    const m = new Map<CeFileKind, number>();
    for (const f of plan.files) {
      if (!selected.has(f.relativePath)) continue;
      m.set(f.kind, (m.get(f.kind) ?? 0) + 1);
    }
    return m;
  }, [plan, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" /> Import mod CE files
          </DialogTitle>
          <DialogDescription>
            Point at a mod's <code>files/</code> folder (or any folder
            containing CE XMLs). The app copies them into a dedicated
            folder inside your mission and registers each one in{" "}
            <code>cfgeconomycore.xml</code>. Vanilla{" "}
            <code>types.xml</code> is never touched.
          </DialogDescription>
        </DialogHeader>

        {apply.data ? (
          <ResultView
            result={apply.data}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <div className="space-y-4">
            <SourcePicker
              sourceDir={sourceDir}
              pickFolder={pickFolder}
              scanning={scan.isPending}
            />

            {plan ? (
              <>
                <PlanSummary plan={plan} />

                <Separator />

                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Files detected ({plan.files.length})
                  </Label>
                  <div className="flex gap-2 text-xs">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleAll(true)}
                    >
                      Select all importable
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleAll(false)}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <ScrollArea className="h-64 rounded-md border border-border/60">
                  <ul className="divide-y divide-border/40">
                    {plan.files.map((f) => (
                      <FileRow
                        key={f.relativePath}
                        file={f}
                        checked={selected.has(f.relativePath)}
                        onToggle={() => toggleFile(f.relativePath)}
                      />
                    ))}
                    {plan.files.length === 0 ? (
                      <li className="p-4 text-sm text-muted-foreground">
                        No XML files found under the selected folder.
                      </li>
                    ) : null}
                  </ul>
                </ScrollArea>

                <Separator />

                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="dest-folder" className="text-xs">
                        Destination folder (inside mission)
                      </Label>
                      <InfoTooltip tagline="Where the copies will live">
                        This is the folder the tool creates under{" "}
                        <code>mpmissions/&lt;mission&gt;/</code>. Files keep
                        their sub-folder structure under it, and each one
                        gets a matching <code>&lt;ce folder="…"&gt;</code>{" "}
                        entry in <code>cfgeconomycore.xml</code>. Use a
                        distinct name per mod so updates don't collide.
                      </InfoTooltip>
                    </div>
                    <Input
                      id="dest-folder"
                      value={destFolder}
                      onChange={(e) =>
                        setDestFolder(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_-]/g, "_"),
                        )
                      }
                      placeholder={plan.suggestedDestFolder}
                      className="font-mono"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Lowercase letters, digits, dashes, and underscores only.
                    </p>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 pb-2 text-xs">
                      <Checkbox
                        checked={overwrite}
                        onCheckedChange={(v) => setOverwrite(v === true)}
                      />
                      Overwrite existing files
                    </label>
                  </div>
                </div>

                <SelectedSummary
                  count={selectedCount}
                  byKind={importableSelectedByKind}
                />
              </>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {apply.data ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={runImport}
                disabled={
                  !plan ||
                  selectedCount === 0 ||
                  destFolder.trim() === "" ||
                  apply.isPending
                }
              >
                {apply.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Import className="mr-2 h-4 w-4" />
                )}
                Import {selectedCount || ""} file
                {selectedCount === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SourcePicker({
  sourceDir,
  pickFolder,
  scanning,
}: {
  sourceDir: string;
  pickFolder: () => void;
  scanning: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Source folder</Label>
      <div className="flex gap-2">
        <Input
          readOnly
          value={sourceDir}
          placeholder="Pick the mod's files/ folder"
          className="font-mono text-xs"
        />
        <Button variant="secondary" onClick={pickFolder} disabled={scanning}>
          {scanning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="mr-2 h-4 w-4" />
          )}
          Pick folder
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Scans recursively for <code>.xml</code> files and detects which CE
        category each one belongs to.
      </p>
    </div>
  );
}

function PlanSummary({ plan }: { plan: ImportPlan }) {
  return (
    <Alert className="bg-muted/20">
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle className="text-xs">Scanned successfully</AlertTitle>
      <AlertDescription className="text-xs">
        <p>
          Found <strong>{plan.files.length}</strong> XML file
          {plan.files.length === 1 ? "" : "s"} —{" "}
          <strong>{plan.importableCount}</strong> CE file
          {plan.importableCount === 1 ? "" : "s"} the app knows how to
          register
          {plan.unknownCount > 0 ? (
            <>
              {" "}
              and <strong>{plan.unknownCount}</strong> unrecognised file
              {plan.unknownCount === 1 ? "" : "s"} (skipped by default)
            </>
          ) : null}
          .
        </p>
      </AlertDescription>
    </Alert>
  );
}

function FileRow({
  file,
  checked,
  onToggle,
}: {
  file: ScannedFile;
  checked: boolean;
  onToggle: () => void;
}) {
  const disabled = !file.importable;
  return (
    <li
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        disabled && "bg-muted/30",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        disabled={disabled}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-mono text-xs">{file.relativePath}</span>
          {file.kind === "unknown" ? (
            <FileQuestion className="h-3 w-3 text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span className={cn("font-medium uppercase", KIND_COLOR[file.kind])}>
            {file.kindLabel}
          </span>
          <ClassificationBadge signal={file.classification} />
          {file.recordCount > 0 ? <span>{file.recordCount} records</span> : null}
          <span>{formatBytes(file.sizeBytes)}</span>
        </div>
      </div>
      {disabled ? (
        <Badge
          variant="outline"
          className="text-[9px] uppercase text-muted-foreground"
        >
          skipped
        </Badge>
      ) : (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
      )}
    </li>
  );
}

/** Compact badge next to a file's kind label that shows how we
 *  arrived at the classification. Silent for the happy path
 *  (`filename_agreed`) since "both signals match" is the expected
 *  case and would otherwise be noise. Surfaces the mismatch /
 *  filename-only / content-only / unknown cases with distinct
 *  colours so the operator can spot fragments that need a second
 *  look before import. */
function ClassificationBadge({
  signal,
}: {
  signal: ClassificationSignal;
}) {
  if (signal === "filename_agreed") return null;
  const meta: Record<
    ClassificationSignal,
    { label: string; title: string; className: string } | null
  > = {
    filename_agreed: null,
    content: {
      label: "by content",
      title:
        "Classified by reading the XML root element. Filename was ambiguous.",
      className: "border-severity-info/40 text-severity-info",
    },
    filename_only: {
      label: "by filename",
      title:
        "Filename matches a known kind but content was unparseable. Double-check before importing.",
      className: "border-severity-warning/40 text-severity-warning",
    },
    filename_mismatch: {
      label: "filename mismatch",
      title:
        "Filename hints at a different kind than the content. Content wins; verify this is intentional before importing.",
      className: "border-severity-warning/40 text-severity-warning",
    },
    unknown: {
      label: "unknown",
      title:
        "Neither the filename nor the root element match a CE kind. Safe to skip.",
      className: "border-muted-foreground/40 text-muted-foreground",
    },
  };
  const m = meta[signal];
  if (!m) return null;
  return (
    <Badge
      variant="outline"
      className={cn("px-1 text-[9px] uppercase", m.className)}
      title={m.title}
    >
      {m.label}
    </Badge>
  );
}

function SelectedSummary({
  count,
  byKind,
}: {
  count: number;
  byKind: Map<CeFileKind, number>;
}) {
  if (count === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Select at least one file to import.
      </p>
    );
  }
  const parts: string[] = [];
  byKind.forEach((n, kind) => {
    if (kind === "unknown") return;
    parts.push(`${n} ${kind}`);
  });
  return (
    <p className="text-xs text-muted-foreground">
      <strong className="text-foreground">{count} selected</strong>
      {parts.length ? ` — ${parts.join(", ")}` : ""}. Each file's{" "}
      <code>&lt;ce folder=…&gt;</code> block will be added to{" "}
      <code>cfgeconomycore.xml</code>.
    </p>
  );
}

function ResultView({
  result,
  onDone,
}: {
  result: import("@/types/ipc").ImportResult;
  onDone: () => void;
}) {
  const failed = result.entries.filter((e) => e.status === "failed");
  const importedByKind = result.entries
    .filter((e) => e.status === "imported")
    .reduce(
      (acc, e) => {
        acc[e.kind] = (acc[e.kind] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

  const nothingImported = result.importedCount === 0;

  return (
    <div className="space-y-3">
      <Alert>
        {nothingImported ? (
          <AlertTriangle className="h-4 w-4 text-severity-warning" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        <AlertTitle className="text-sm">
          {nothingImported ? (
            <>
              No files imported into <code>{result.destFolder}/</code>
            </>
          ) : (
            <>
              Imported {result.importedCount} file
              {result.importedCount === 1 ? "" : "s"} into{" "}
              <code>{result.destFolder}/</code>
            </>
          )}
        </AlertTitle>
        <AlertDescription className="text-xs">
          <p>
            {result.cfgeconomycoreUpdated
              ? "cfgeconomycore.xml updated with new <ce> blocks."
              : result.importedCount === 0
                ? "cfgeconomycore.xml unchanged — nothing was imported."
                : "cfgeconomycore.xml unchanged — these entries already existed."}{" "}
            {result.skippedCount > 0
              ? `${result.skippedCount} file(s) skipped (see below).`
              : ""}
          </p>
          {Object.keys(importedByKind).length > 0 ? (
            <p>
              Breakdown:{" "}
              {Object.entries(importedByKind)
                .map(([k, n]) => `${n} ${k}`)
                .join(", ")}
              .
            </p>
          ) : null}
        </AlertDescription>
      </Alert>

      <NextStepsCard />

      {failed.length > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-sm text-severity-warning">
            Some files did not import
          </AlertTitle>
          <AlertDescription className="text-xs">
            <ul className="space-y-1">
              {failed.map((e) => (
                <li key={e.source} className="font-mono">
                  {e.source}: {e.message ?? "unknown error"}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <details className="rounded-md border border-border/60">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
          Per-file log ({result.entries.length})
        </summary>
        <ScrollArea className="h-48">
          <ul className="divide-y divide-border/40">
            {result.entries.map((e) => (
              <li
                key={e.source}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span
                  className={
                    e.status === "imported"
                      ? "text-severity-success"
                      : e.status === "skipped"
                        ? "text-severity-warning"
                        : "text-severity-error"
                  }
                >
                  {e.status}
                </span>
                <span className="truncate font-mono text-muted-foreground">
                  {e.destination}
                </span>
                {e.message ? (
                  <span className="ml-auto truncate text-[10px] text-muted-foreground">
                    {e.message}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </details>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function NextStepsCard() {
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <p className="text-xs font-medium">What to check next</p>
      <ol className="space-y-1.5 text-xs text-muted-foreground">
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">1.</span>
          <span>
            <strong className="text-foreground">
              Open the Items list.
            </strong>{" "}
            Filter by <em>Source → Mod only</em>, or search the new{" "}
            <code>modId</code>. Confirm the count matches what the import
            reported.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">2.</span>
          <span>
            <strong className="text-foreground">Push to server.</strong>{" "}
            Head to <em>Sync → Review &amp; push</em>. The diff should
            include the new folder and the updated{" "}
            <code>cfgeconomycore.xml</code>.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">3.</span>
          <span>
            <strong className="text-foreground">Restart the server.</strong>{" "}
            CE loads the new files only at startup. A full shutdown +
            start is cleaner than a reload.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">4.</span>
          <span>
            <strong className="text-foreground">
              Watch the <code>.RPT</code> log.
            </strong>{" "}
            Any CE parsing error surfaces immediately there —{" "}
            <em>"Cannot find type"</em>, missing category, etc. Classnames
            that don't exist in an installed mod also log as "unknown
            class" warnings.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">5.</span>
          <span>
            <strong className="text-foreground">Admin-spawn a sample.</strong>{" "}
            In-game with VPPAdminTools, CF admin, or Server Admin Menu,
            spawn one of the new classnames. If the item appears, the
            mod's <code>.pbo</code> defines it correctly and the CE
            entry is shaped right.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">6.</span>
          <span>
            <strong className="text-foreground">Walk an expected zone.</strong>{" "}
            For items tagged <code>Military</code>, visit a military
            base; for <code>Tier4</code>, inland military. Natural spawns
            take a few minutes after restart — don't judge on the first
            sweep.
          </span>
        </li>
        <li className="flex gap-2">
          <span className="font-semibold text-foreground">7.</span>
          <span>
            <strong className="text-foreground">Tweak and iterate.</strong>{" "}
            If counts look wrong, come back to the Items page, adjust{" "}
            <code>nominal</code> / <code>min</code> / usage, then push
            again.
          </span>
        </li>
      </ol>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}
