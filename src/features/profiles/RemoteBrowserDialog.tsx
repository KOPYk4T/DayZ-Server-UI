import { useCallback, useEffect, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  File,
  Folder,
  FolderSymlink,
  Home,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import type {
  BrowseResult,
  ProfileDraft,
  ProfileSecrets,
  RemoteEntry,
} from "@/types/ipc";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  buildDraft: () => { draft: ProfileDraft; secrets: ProfileSecrets };
  existingId?: string | null;
  initialPath?: string;
  purpose: "serverRoot" | "missions" | "profiles";
  onSelect: (absolutePath: string) => void;
}

const TITLE: Record<Props["purpose"], string> = {
  serverRoot: "Pick server root folder",
  missions: "Pick mission folder",
  profiles: "Pick profiles folder",
};

const HINT: Record<Props["purpose"], string> = {
  serverRoot:
    "Navigate to the folder that contains serverDZ.cfg, mpmissions/, and the profile directory.",
  missions:
    "Navigate into the mission folder (contains init.c, cfgeconomycore.xml, db/).",
  profiles:
    "Navigate into the server profile directory (contains *.RPT, battleye/).",
};

export function RemoteBrowserDialog({
  open,
  onOpenChange,
  buildDraft,
  existingId,
  initialPath,
  purpose,
  onSelect,
}: Props) {
  const [path, setPath] = useState<string>(initialPath ?? "");
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isHome, setIsHome] = useState(false);

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      try {
        const { draft, secrets } = buildDraft();
        const r = await tauri.sftpBrowseDraft({
          draft,
          secrets,
          existingId: existingId ?? null,
          path: p,
        });
        setResult(r);
        setPath(r.path);
        setIsHome(r.isHomeFallback);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [buildDraft, existingId],
  );

  useEffect(() => {
    if (!open) {
      setResult(null);
      setIsHome(false);
      return;
    }
    void load(initialPath ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openEntry = (entry: RemoteEntry) => {
    if (!entry.isDir && !entry.isSymlink) return;
    // Always build an absolute child path off the canonical `path`
    // returned by the backend. Works the same for "/foo" and "." —
    // after the first load, `path` is always absolute.
    const base = path.replace(/\/+$/, "");
    const next = base === "" ? `/${entry.name}` : `${base}/${entry.name}`;
    void load(next);
  };

  const goUp = () => {
    if (!path || path === "/" || !canGoUp) return;
    const trimmed = path.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    if (idx <= 0) {
      void load("/");
      return;
    }
    void load(trimmed.slice(0, idx));
  };

  const pickCurrent = () => {
    if (!result) return;
    onSelect(result.path);
    onOpenChange(false);
  };

  const canGoUp = !!path && path !== "/" && !loading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{TITLE[purpose]}</DialogTitle>
          <DialogDescription>{HINT[purpose]}</DialogDescription>
        </DialogHeader>

        {/* Current path + nav row */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goUp}
              disabled={!canGoUp}
              className="shrink-0"
            >
              <ArrowUp className="mr-1 h-4 w-4" />
              Up
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 font-mono text-xs">
              {isHome ? (
                <Home className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : null}
              <span className="truncate" title={path}>
                {path || "—"}
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void load(path)}
              disabled={loading}
              title="Refresh"
              className="shrink-0"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <strong>Double-click</strong> a folder to open it, or hit the
            arrow on its right. Use <strong>Up</strong> to go back.
          </p>
        </div>

        {/* Entries */}
        <div className="min-h-[260px] max-h-[45vh] overflow-y-auto rounded-md border border-border/60">
          {loading && !result ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : result && result.entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              Empty folder.
            </div>
          ) : (
            <ul className="divide-y divide-border/50 text-sm">
              {result?.entries.map((entry) => {
                const isNavigable = entry.isDir || entry.isSymlink;
                return (
                  <li
                    key={entry.name}
                    className={`group flex items-center gap-2 px-3 py-2 ${
                      isNavigable
                        ? "cursor-pointer hover:bg-muted/70"
                        : "opacity-60"
                    }`}
                    onDoubleClick={() => openEntry(entry)}
                    title={
                      isNavigable
                        ? "Double-click to open"
                        : "Regular file (not a folder)"
                    }
                  >
                    {entry.isDir ? (
                      <Folder className="h-4 w-4 shrink-0 text-primary" />
                    ) : entry.isSymlink ? (
                      <FolderSymlink className="h-4 w-4 shrink-0 text-primary/80" />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className={`truncate font-mono text-xs ${
                        entry.isDir ? "font-semibold" : ""
                      }`}
                    >
                      {entry.name}
                      {entry.isDir ? "/" : ""}
                    </span>
                    {isNavigable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 px-2 text-[11px] opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEntry(entry);
                        }}
                      >
                        Open <ChevronRight className="ml-0.5 h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                        {formatSize(entry.size)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={pickCurrent} disabled={!result || loading}>
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
