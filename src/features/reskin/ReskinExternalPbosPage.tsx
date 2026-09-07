import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  FilePlus2,
  FileWarning,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as tauri from "@/lib/tauri";
import { errorMessage, formatRelativeTime } from "@/lib/utils";
import type {
  ExternalPboEntry,
  ReskinRegistry,
} from "@/types/ipc";

export function ReskinExternalPbosPage() {
  const qc = useQueryClient();
  const registry = useQuery<ReskinRegistry>({
    queryKey: ["reskin", "registry"],
    queryFn: () => tauri.reskinRegistryGet(),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["reskin", "registry"] });

  const add = useMutation({
    mutationFn: (args: {
      sourcePath: string;
      displayName?: string;
      notes?: string;
    }) => tauri.reskinExternalPboAdd(args),
    onSuccess: () => {
      invalidate();
      toast.success("Added to modpack");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => tauri.reskinExternalPboRemove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Removed");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleInclude = useMutation({
    mutationFn: (args: { id: string; include: boolean }) =>
      tauri.reskinExternalPboSetInclude(args.id, args.include),
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const updateEntry = useMutation({
    mutationFn: (entry: ExternalPboEntry) =>
      tauri.reskinExternalPboUpdate(entry),
    onSuccess: invalidate,
    onError: (err) => toast.error(errorMessage(err)),
  });

  const pickAndAdd = async () => {
    const picked = await openDialog({
      multiple: true,
      directory: false,
      filters: [{ name: "PBO", extensions: ["pbo"] }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    for (const p of paths) {
      if (typeof p !== "string") continue;
      await add.mutateAsync({ sourcePath: p });
    }
  };

  const entries = registry.data?.externalPbos ?? [];
  const includedCount = entries.filter((e) => e.include).length;
  const totalBytes = entries
    .filter((e) => e.include)
    .reduce((acc, e) => acc + e.sizeBytes, 0);

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        icon={Package}
        title="External PBOs"
        description={`Drop any existing .pbo into your modpack — content mods, map tweaks, anything you want to ship alongside your reskins. The file is copied verbatim into the built mod's addons/ folder. Sibling .bisign and .bikey files are carried over automatically when present.`}
        badges={
          <>
            <Badge variant="outline">{entries.length} total</Badge>
            {includedCount !== entries.length ? (
              <Badge variant="outline" className="border-muted-foreground/40">
                {includedCount} included
              </Badge>
            ) : null}
          </>
        }
        actions={
          <Button size="sm" onClick={pickAndAdd} disabled={add.isPending}>
            {add.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Add PBO
          </Button>
        }
      />

      <Explainer
        title="How external PBOs ship"
        subtitle="copied as-is, signatures carried over when present."
        storageKey="dzcm.reskin.pbos.explainer.open"
      >
        <p>
          At build time each included <code>.pbo</code> above is copied
          straight into <code>&lt;mod&gt;/addons/</code> next to the
          auto-packed one. If there's a <code>.pbo.bisign</code> next
          to the source file it comes with it — otherwise the PBO will
          be rejected by servers running{" "}
          <code>verifySignatures=2</code> unless you drop a matching
          <code>.bikey</code> into <code>keys/</code> yourself.
        </p>
        <p>
          Any <code>.bikey</code> files next to the source are pulled
          into the modpack's <code>keys/</code> automatically, so a
          self-contained mod folder like{" "}
          <code>@SomeMod/addons/*.pbo</code> +{" "}
          <code>@SomeMod/keys/*.bikey</code> round-trips cleanly — add
          each PBO one by one and the matching key lands where it needs
          to.
        </p>
      </Explainer>

      {entries.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            No external PBOs in the modpack yet. Click{" "}
            <strong>Add PBO</strong> to include one — you can select
            multiple at once.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border border-border/60 bg-card/60">
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Include</span>
            <span>Name / source</span>
            <span>Size</span>
            <span>Added</span>
            <span></span>
          </div>
          <ul className="divide-y divide-border/40">
            {entries.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2 text-sm"
              >
                <Checkbox
                  checked={e.include}
                  onCheckedChange={(v) =>
                    toggleInclude.mutate({
                      id: e.id,
                      include: v === true,
                    })
                  }
                />
                <div className="min-w-0">
                  <PboRow
                    entry={e}
                    onRename={(name) =>
                      updateEntry.mutate({ ...e, displayName: name })
                    }
                    onNotes={(notes) =>
                      updateEntry.mutate({ ...e, notes })
                    }
                  />
                </div>
                <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {formatBytes(e.sizeBytes)}
                </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatRelativeTime(e.addedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(e.id)}
                  disabled={remove.isPending}
                  title="Remove from modpack"
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t border-border/40 px-4 py-2 text-[11px] text-muted-foreground">
            {includedCount} included · {formatBytes(totalBytes)} total at
            build time
          </div>
        </div>
      )}

      <Alert>
        <FileWarning className="h-4 w-4" />
        <AlertDescription className="ml-2">
          <strong>Signing tip:</strong> external PBOs we copy keep
          their original <code>.bisign</code>. If a PBO has none, your
          server must set <code>verifySignatures=0</code> or you'll
          need to sign it yourself with the key next to DSSignFile
          (DayZ Tools) — and ship the matching{" "}
          <code>.bikey</code> in <code>keys/</code>.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function PboRow({
  entry,
  onRename,
  onNotes,
}: {
  entry: ExternalPboEntry;
  onRename: (name: string) => void;
  onNotes: (notes: string) => void;
}) {
  const [name, setName] = useState(entry.displayName);
  const [notes, setNotes] = useState(entry.notes ?? "");
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (name.trim() && name !== entry.displayName) {
              onRename(name.trim());
            } else if (!name.trim()) {
              setName(entry.displayName);
            }
          }}
          className="h-7 max-w-xs text-xs"
        />
      </div>
      <div
        className="truncate font-mono text-[11px] text-muted-foreground"
        title={entry.sourcePath}
      >
        {entry.sourcePath}
      </div>
      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Notes</summary>
        <div className="mt-1">
          <Label className="sr-only">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (entry.notes ?? "")) onNotes(notes);
            }}
            placeholder="Why you added this PBO…"
            className="h-7 text-xs"
          />
        </div>
      </details>
    </div>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
