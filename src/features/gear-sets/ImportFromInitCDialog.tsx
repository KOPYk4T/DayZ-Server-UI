import { useMemo } from "react";
import { FileCode2, Loader2, RefreshCw } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useGenerateGearSetsFromInitC,
  useInitCScan,
} from "@/hooks/useGearSets";
import { cn, errorMessage } from "@/lib/utils";
import type { InitCCall } from "@/types/ipc";

export function ImportFromInitCDialog({
  open,
  onOpenChange,
  targetExists,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When true, a destructive confirmation appears before generate —
   *  cfgPlayerSpawnGear.json already exists and will be overwritten. */
  targetExists: boolean;
}) {
  const scan = useInitCScan(open);
  const generate = useGenerateGearSetsFromInitC();

  const grouped = useMemo(() => groupByKind(scan.data?.calls ?? []), [scan.data]);

  const runGenerate = () => {
    generate.mutate(undefined, {
      onSuccess: (r) => {
        toast.success("cfgPlayerSpawnGear.json generated", {
          description: `${r.classnamesCount} classname${r.classnamesCount === 1 ? "" : "s"} imported · wrote ${r.writtenPath}`,
        });
        onOpenChange(false);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4" />
              Import gear from init.c
            </DialogTitle>
            <DialogDescription className="text-xs">
              Scans the mission's <code>init.c</code> for legacy{" "}
              <code>CreateInInventory</code> /{" "}
              <code>CreateAttachment</code> calls and offers to seed a
              starter <code>cfgPlayerSpawnGear.json</code> with every
              classname it finds. This is a one-shot migration —
              you'll refine slots, chances, and character-type
              matching afterwards (editor lands in Phase 6b).
            </DialogDescription>
          </DialogHeader>

          {scan.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning init.c…
            </div>
          ) : scan.isError ? (
            <div className="space-y-2 py-4 text-xs">
              <div className="font-mono text-severity-error">
                {errorMessage(scan.error)}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void scan.refetch()}
              >
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          ) : !scan.data?.fileExists ? (
            <div className="rounded-md border border-severity-warning/40 bg-severity-warning/5 p-3 text-xs">
              No <code>init.c</code> found at{" "}
              <code>{scan.data?.fileDisplay}</code>. Some mod setups
              keep gear logic in other script files (e.g. a PBO's
              <code> init.cpp</code>) which this scanner doesn't touch.
              Create the JSON by hand for now.
            </div>
          ) : (
            <ScanBody
              filePath={scan.data.fileDisplay}
              totalLines={scan.data.totalLines}
              grouped={grouped}
              arrayCount={scan.data.arrays.length}
              uniqueCount={scan.data.classnames.length}
            />
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={() => void scan.refetch()}
              disabled={scan.isFetching}
            >
              <RefreshCw
                className={cn(
                  "mr-2 h-3 w-3",
                  scan.isFetching && "animate-spin",
                )}
              />
              Re-scan
            </Button>
            <ConfirmGenerateButton
              disabled={
                !scan.data?.fileExists ||
                scan.data.classnames.length === 0 ||
                generate.isPending
              }
              isPending={generate.isPending}
              targetExists={targetExists}
              onConfirm={runGenerate}
              classnamesCount={scan.data?.classnames.length ?? 0}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfirmGenerateButton({
  disabled,
  isPending,
  targetExists,
  onConfirm,
  classnamesCount,
}: {
  disabled: boolean;
  isPending: boolean;
  targetExists: boolean;
  onConfirm: () => void;
  classnamesCount: number;
}) {
  if (!targetExists) {
    return (
      <Button disabled={disabled} onClick={onConfirm}>
        {isPending ? (
          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
        ) : null}
        Generate ({classnamesCount} item{classnamesCount === 1 ? "" : "s"})
      </Button>
    );
  }
  return (
    <AlertDialog>
      <Button
        asChild
        variant="destructive"
        disabled={disabled}
      >
        <AlertDialogAction
          onClick={(e) => {
            e.preventDefault();
          }}
          // Using the radix default; the nested content handles the
          // actual action. The asChild pattern lets us keep shadcn's
          // styling while Radix controls the modal.
        >
          Overwrite existing ({classnamesCount} item{classnamesCount === 1 ? "" : "s"})
        </AlertDialogAction>
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Overwrite cfgPlayerSpawnGear.json?</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            The file already exists in the mission root. Generating
            replaces its entire contents with the starter JSON seeded
            from init.c. Previous edits will be lost — the git commit
            that this write creates lets you recover if needed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Generating…" : "Overwrite"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ScanBody({
  filePath,
  totalLines,
  grouped,
  arrayCount,
  uniqueCount,
}: {
  filePath: string;
  totalLines: number;
  grouped: Record<InitCCall["kind"], InitCCall[]>;
  arrayCount: number;
  uniqueCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="font-mono text-[10px]">
          {filePath}
        </Badge>
        <span className="text-muted-foreground">
          {totalLines} line{totalLines === 1 ? "" : "s"} · {arrayCount}{" "}
          string array{arrayCount === 1 ? "" : "s"} detected · {uniqueCount}{" "}
          unique classname{uniqueCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="max-h-[48vh] space-y-4 overflow-y-auto rounded-md border border-border/50 bg-muted/10 p-3">
        <KindSection
          label="CreateInInventory"
          items={grouped.createInInventory}
        />
        <KindSection
          label="CreateAttachment"
          items={grouped.createAttachment}
        />
        <KindSection
          label="Expanded from string arrays"
          items={grouped.arrayElement}
          note="Randomised pools that init.c picks from — the starter JSON puts every possibility in the cargo pool."
        />
      </div>

      {uniqueCount === 0 ? (
        <div className="rounded-md border border-severity-warning/40 bg-severity-warning/5 p-3 text-xs">
          Scanner found no gear-spawning calls in this init.c. Nothing
          to import. If you're sure gear is defined here, the scanner
          might be missing a pattern — file an issue with a sample
          line and we'll add it.
        </div>
      ) : null}
    </div>
  );
}

function KindSection({
  label,
  items,
  note,
}: {
  label: string;
  items: InitCCall[];
  note?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <Badge variant="outline" className="text-[10px]">
          {items.length}
        </Badge>
      </div>
      {note ? (
        <p className="text-[11px] italic text-muted-foreground">{note}</p>
      ) : null}
      {items.length === 0 ? (
        <div className="text-[11px] italic text-muted-foreground">
          None found.
        </div>
      ) : (
        <div className="divide-y divide-border/40 rounded-md border border-border/40 bg-background/40">
          {items.slice(0, 80).map((c, i) => (
            <div
              key={`${c.lineNumber}:${i}:${c.classname}`}
              className="grid grid-cols-[3rem_12rem_1fr] gap-2 px-2 py-1 text-[11px]"
            >
              <span className="font-mono text-muted-foreground">
                L{c.lineNumber}
              </span>
              <code className="truncate font-mono text-foreground">
                {c.classname}
              </code>
              <code className="truncate text-muted-foreground/80">
                {c.contextLine}
              </code>
            </div>
          ))}
          {items.length > 80 ? (
            <div className="px-2 py-1 text-[11px] italic text-muted-foreground">
              … and {items.length - 80} more.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function groupByKind(
  calls: InitCCall[],
): Record<InitCCall["kind"], InitCCall[]> {
  const out: Record<InitCCall["kind"], InitCCall[]> = {
    createInInventory: [],
    createAttachment: [],
    arrayElement: [],
  };
  calls.forEach((c) => out[c.kind].push(c));
  return out;
}
