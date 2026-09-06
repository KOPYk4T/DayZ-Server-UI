import { useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  FileCheck2,
  FileX2,
  FolderMinus,
  Loader2,
  Package,
  PackageX,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, errorMessage } from "@/lib/utils";
import {
  useCeImportsList,
  useCeImportsRemove,
} from "@/hooks/useCeImport";
import type { CeImportEntry } from "@/types/ipc";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function CeImportsManagerDialog({ open, onOpenChange }: Props) {
  const { data, isLoading, isError, error, refetch, isFetching } =
    useCeImportsList(open);
  const remove = useCeImportsRemove();

  const [confirming, setConfirming] = useState<CeImportEntry | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(true);
  const [customConfirm, setCustomConfirm] = useState(false);

  const openConfirm = (entry: CeImportEntry) => {
    setConfirming(entry);
    setDeleteFiles(!entry.isCustom);
    setCustomConfirm(false);
  };
  const closeConfirm = () => {
    setConfirming(null);
    setDeleteFiles(true);
    setCustomConfirm(false);
  };

  const runRemove = () => {
    if (!confirming) return;
    if (confirming.isCustom && !customConfirm) return;
    remove.mutate(
      {
        folderTop: confirming.folderTop,
        deleteFiles,
        allowCustom: confirming.isCustom,
      },
      {
        onSuccess: (res) => {
          toast.success(
            res.directoryRemoved
              ? `removed ${confirming.folderTop}/ and its ${res.filesDeleted} file(s)`
              : `unregistered ${confirming.folderTop} (kept files on disk)`,
            {
              description: res.cfgeconomycoreUpdated
                ? `${res.blocksRemoved} cfgeconomycore block(s) removed`
                : undefined,
            },
          );
          closeConfirm();
        },
        onError: (err) =>
          toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Manage imported CE files
          </DialogTitle>
          <DialogDescription>
            Every <code>&lt;ce folder="…"&gt;</code> block registered in{" "}
            <code>cfgeconomycore.xml</code>, grouped by top-level folder.
            Removing an entry strips its blocks from{" "}
            <code>cfgeconomycore.xml</code> and optionally deletes the
            files on disk. Auto-committed to git so you can revert.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {data ? `${data.length} registered folder(s)` : ""}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not read cfgeconomycore.xml</AlertTitle>
            <AlertDescription>
              {errorMessage(error)}
            </AlertDescription>
          </Alert>
        ) : !data || data.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No <code>&lt;ce folder&gt;</code> registrations in this mission.
          </div>
        ) : (
          <ScrollArea className="max-h-[55vh]">
            <ul className="space-y-2">
              {data.map((entry) => (
                <li key={entry.folderTop}>
                  <ImportEntryRow entry={entry} onRemove={openConfirm} />
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!confirming} onOpenChange={(v) => !v && closeConfirm()}>
        <AlertDialogContent>
          {confirming ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  {confirming.isCustom ? (
                    <ShieldAlert className="h-5 w-5 text-severity-error" />
                  ) : (
                    <PackageX className="h-5 w-5" />
                  )}
                  Remove <code>{confirming.folderTop}/</code>?
                </AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2 text-xs">
                    {confirming.isCustom ? (
                      <div className="rounded-md border border-severity-error/40 bg-severity-error/5 p-2">
                        <p className="font-medium text-severity-error">
                          This is your own overrides folder.
                        </p>
                        <p>
                          Removing it deletes every custom item edit,
                          clone, and disable you've made. The typical way
                          to clean up mistakes is per-item from the Items
                          page ("Remove override"). Continue only if you
                          want a full reset.
                        </p>
                      </div>
                    ) : null}
                    <p>
                      This will remove{" "}
                      <strong>{confirming.blocks.length}</strong>{" "}
                      <code>&lt;ce folder&gt;</code> block
                      {confirming.blocks.length === 1 ? "" : "s"} from{" "}
                      <code>cfgeconomycore.xml</code>. Items loaded from
                      these files will disappear from the Items list on
                      the next refresh.
                    </p>
                    <label className="flex items-start gap-2 rounded-md border border-border/60 p-2">
                      <Checkbox
                        checked={deleteFiles}
                        onCheckedChange={(v) => setDeleteFiles(v === true)}
                      />
                      <span className="flex-1">
                        <strong>Also delete the files on disk</strong>
                        <span className="block text-muted-foreground">
                          Removes{" "}
                          <code>
                            &lt;mission&gt;/{confirming.folderTop}/
                          </code>{" "}
                          and everything inside it ({confirming.totalFiles}{" "}
                          file{confirming.totalFiles === 1 ? "" : "s"}).
                          Leave unchecked to just unregister — files stay
                          for re-registration later.
                        </span>
                      </span>
                    </label>
                    {confirming.isCustom ? (
                      <label className="flex items-start gap-2 rounded-md border border-severity-error/40 bg-severity-error/5 p-2">
                        <Checkbox
                          checked={customConfirm}
                          onCheckedChange={(v) =>
                            setCustomConfirm(v === true)
                          }
                        />
                        <span className="text-severity-error">
                          I understand this wipes <strong>all</strong> my
                          custom CE overrides.
                        </span>
                      </label>
                    ) : null}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={
                    remove.isPending ||
                    (confirming.isCustom && !customConfirm)
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    runRemove();
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {remove.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FolderMinus className="mr-2 h-4 w-4" />
                  )}
                  {deleteFiles ? "Remove & delete" : "Unregister only"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function ImportEntryRow({
  entry,
  onRemove,
}: {
  entry: CeImportEntry;
  onRemove: (entry: CeImportEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-md border border-border/60 bg-card",
        entry.isCustom && "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          <span className="font-mono text-sm">{entry.folderTop}</span>
        </button>
        {entry.isCustom ? (
          <Badge variant="outline" className="border-primary/40 text-primary">
            your overrides
          </Badge>
        ) : (
          <Badge variant="outline" className="text-severity-info">
            mod
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {entry.blocks.length} block{entry.blocks.length === 1 ? "" : "s"} ·{" "}
          {entry.totalFiles} file{entry.totalFiles === 1 ? "" : "s"}
        </span>
        {!entry.missionDirExists ? (
          <Badge
            variant="outline"
            className="text-severity-warning"
            title="folder missing on disk"
          >
            orphan
          </Badge>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "ml-auto",
            entry.isCustom
              ? "text-severity-error hover:text-severity-error"
              : "",
          )}
          onClick={() => onRemove(entry)}
        >
          <FolderMinus className="mr-1.5 h-3.5 w-3.5" />
          {entry.isCustom ? "Reset" : "Remove"}
        </Button>
      </div>
      {expanded ? (
        <div className="border-t border-border/60 bg-muted/20 p-3 text-xs">
          {entry.blocks.map((block) => (
            <div key={block.folder} className="mb-2 last:mb-0">
              <p className="font-mono text-[11px] text-muted-foreground">
                &lt;ce folder="{block.folder}"&gt;
              </p>
              <ul className="mt-1 space-y-0.5">
                {block.files.map((f) => (
                  <li
                    key={f.name}
                    className="flex items-center gap-2 pl-3 font-mono text-[11px]"
                  >
                    {f.existsOnDisk ? (
                      <FileCheck2 className="h-3 w-3 text-severity-success" />
                    ) : (
                      <FileX2 className="h-3 w-3 text-severity-error" />
                    )}
                    <span className="truncate">{f.name}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase"
                    >
                      {f.fileType}
                    </Badge>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {formatBytes(f.sizeBytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / (1024 * 1024)).toFixed(1)}MB`;
}
