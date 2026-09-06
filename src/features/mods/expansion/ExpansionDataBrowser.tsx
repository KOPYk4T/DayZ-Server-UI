import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  File,
  Folder,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ExpansionDirEntry,
  ExpansionDirListing,
  ExpansionSettingsFile,
} from "@/types/ipc";

import { ExpansionSettingsEditor } from "./ExpansionSettingsEditor";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Workspace-relative folder to open the browser at (e.g.
   *  `profiles/ExpansionMod/Market`). Must live under the Expansion
   *  settings root. */
  initialPath: string | null;
  /** Root path the breadcrumb won't walk above. Prevents the user
   *  from navigating out of `ExpansionMod/`. */
  settingsRoot: string;
}

export function ExpansionDataBrowser({
  open,
  onOpenChange,
  initialPath,
  settingsRoot,
}: Props) {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;

  const [path, setPath] = useState<string>(initialPath ?? settingsRoot);
  const [search, setSearch] = useState("");
  const [editingFile, setEditingFile] =
    useState<ExpansionSettingsFile | null>(null);

  useEffect(() => {
    if (open) {
      setPath(initialPath ?? settingsRoot);
      setSearch("");
    }
  }, [open, initialPath, settingsRoot]);

  const listing = useQuery<ExpansionDirListing>({
    queryKey: profileId
      ? ["expansion-list-dir", profileId, path]
      : ["expansion-list-dir", "__none__"],
    queryFn: () => tauri.expansionListDir(profileId!, path),
    enabled: !!(open && profileId && path),
    staleTime: 0,
  });

  const entries = useMemo<ExpansionDirEntry[]>(() => {
    const all = listing.data?.entries ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((e) => e.name.toLowerCase().includes(q));
  }, [listing.data, search]);

  const crumbs = useMemo(() => buildBreadcrumbs(path, settingsRoot), [
    path,
    settingsRoot,
  ]);
  const canGoUp = path !== settingsRoot;

  const goInto = (entry: ExpansionDirEntry) => {
    if (entry.isDir) {
      setPath(entry.relativePath);
      setSearch("");
    } else if (entry.extension === "json") {
      setEditingFile({
        name: stripExt(entry.name),
        fileName: entry.name,
        relativePath: entry.relativePath,
        sizeBytes: entry.sizeBytes,
      });
    }
  };

  const goUp = () => {
    if (!canGoUp) return;
    const trimmed = path.replace(/\/+$/, "");
    const idx = trimmed.lastIndexOf("/");
    const parent = idx > 0 ? trimmed.slice(0, idx) : settingsRoot;
    setPath(parent.length >= settingsRoot.length ? parent : settingsRoot);
    setSearch("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>Expansion data browser</DialogTitle>
            <DialogDescription>
              Navigate any folder under <code>{settingsRoot}/</code> and
              click a <code>.json</code> file to open it in the JSON
              editor. Subfolders drill in; everything else is
              read-only for now. Saving any file auto-commits to the
              workspace — push from the Sync page to land changes on
              the server.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={goUp}
              disabled={!canGoUp || listing.isFetching}
            >
              <ArrowLeft className="mr-1 h-3 w-3" /> Up
            </Button>
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-mono text-xs">
              {crumbs.map((c, idx) => (
                <span
                  key={c.path}
                  className="flex shrink-0 items-center gap-1"
                >
                  <button
                    type="button"
                    className={
                      idx === crumbs.length - 1
                        ? "cursor-default font-semibold text-foreground"
                        : "hover:underline"
                    }
                    onClick={() => idx < crumbs.length - 1 && setPath(c.path)}
                    disabled={idx === crumbs.length - 1}
                  >
                    {c.label}
                  </button>
                  {idx < crumbs.length - 1 ? (
                    <ChevronRight className="h-3 w-3 opacity-50" />
                  ) : null}
                </span>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => listing.refetch()}
              disabled={listing.isFetching}
              title="Refresh"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  listing.isFetching ? "animate-spin" : ""
                }`}
              />
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter current folder"
              className="pl-7 text-xs"
            />
          </div>

          <div className="min-h-[280px] max-h-[50vh] overflow-y-auto rounded-md border border-border/60">
            {listing.isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : listing.isError ? (
              <div className="p-3">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {errorMessage(listing.error)}
                  </AlertDescription>
                </Alert>
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                {search
                  ? "No matches in this folder."
                  : "Folder is empty."}
              </div>
            ) : (
              <ul className="divide-y divide-border/50 text-sm">
                {entries.map((e) => {
                  const editable = !e.isDir && e.extension === "json";
                  const clickable = e.isDir || editable;
                  return (
                    <li
                      key={e.relativePath}
                      className={`flex items-center gap-2 px-3 py-1.5 ${
                        clickable
                          ? "cursor-pointer hover:bg-muted/60"
                          : "opacity-60"
                      }`}
                      onDoubleClick={() => clickable && goInto(e)}
                      onClick={() => clickable && goInto(e)}
                      title={
                        editable
                          ? "Click to edit as JSON"
                          : e.isDir
                            ? "Click to open folder"
                            : "Non-JSON file — view only in a text editor"
                      }
                    >
                      {e.isDir ? (
                        <Folder className="h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <File
                          className={`h-4 w-4 shrink-0 ${
                            editable
                              ? "text-primary/80"
                              : "text-muted-foreground"
                          }`}
                        />
                      )}
                      <span
                        className={`truncate font-mono text-xs ${
                          e.isDir ? "font-semibold" : ""
                        }`}
                      >
                        {e.name}
                        {e.isDir ? "/" : ""}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {e.isDir ? "" : formatBytes(e.sizeBytes)}
                      </span>
                      {editable ? (
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                          EDIT
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExpansionSettingsEditor
        open={editingFile !== null}
        onOpenChange={(v) => {
          if (!v) {
            setEditingFile(null);
            void listing.refetch();
          }
        }}
        file={editingFile}
      />
    </>
  );
}

function buildBreadcrumbs(
  path: string,
  root: string,
): { label: string; path: string }[] {
  const rootParts = root.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (pathParts.length < rootParts.length) {
    return [{ label: lastSegment(root), path: root }];
  }
  const crumbs: { label: string; path: string }[] = [];
  // First crumb is the settings root — always shows "ExpansionMod".
  crumbs.push({ label: lastSegment(root), path: root });
  for (let i = rootParts.length; i < pathParts.length; i++) {
    crumbs.push({
      label: pathParts[i],
      path: pathParts.slice(0, i + 1).join("/"),
    });
  }
  return crumbs;
}

function lastSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
