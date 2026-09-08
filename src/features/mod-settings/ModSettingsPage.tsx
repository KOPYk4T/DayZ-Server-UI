import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ExternalLink,
  Filter,
  Loader2,
  RotateCcw,
  Search,
  Sliders,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useProfileJsonsCatalog,
  useProfileJsonsOverride,
  useProfileJsonsReset,
} from "@/hooks/useProfileJsons";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ProfileJsonFile,
  ProfileJsonGroup,
  ProfileJsonOverrideAction,
} from "@/types/ipc";

import { ModSettingsEditor } from "./ModSettingsEditor";

type StatusFilter = "all" | "on" | "off";

export function ModSettingsPage() {
  const profile = useProfileStore((s) => s.active);
  const catalog = useProfileJsonsCatalog();
  const setOverride = useProfileJsonsOverride();
  const resetAll = useProfileJsonsReset();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("on");
  const [selected, setSelected] = useState<string | null>(null);

  const groups = catalog.data?.groups ?? [];
  const hasOverrides = groups.some((g) =>
    g.files.some((f) => f.overrideState),
  );
  const onCount = catalog.data?.enabledCount ?? 0;
  const totalCount = catalog.data?.totalCount ?? 0;
  const offCount = Math.max(0, totalCount - onCount);

  const filtered = useMemo(
    () => filterGroups(groups, query, status),
    [groups, query, status],
  );

  const selectedFile = useMemo(
    () =>
      groups.flatMap((g) => g.files).find((f) => f.relativePath === selected) ??
      null,
    [groups, selected],
  );

  useEffect(() => {
    if (selected) return;
    const first = groups.flatMap((g) => g.files).find((f) => f.enabled);
    if (first) setSelected(first.relativePath);
  }, [groups, selected]);

  const toggle = (file: ProfileJsonFile, wantOn: boolean) => {
    setOverride.mutate(
      { relativePath: file.relativePath, action: nextAction(file, wantOn) },
      { onError: (err) => toast.error(errorMessage(err)) },
    );
  };

  const resetFile = (file: ProfileJsonFile) => {
    setOverride.mutate(
      { relativePath: file.relativePath, action: "auto" },
      { onError: (err) => toast.error(errorMessage(err)) },
    );
  };

  if (!profile) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No profile loaded.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Sliders}
        title="Mod settings"
        path={catalog.data?.profilesRoot}
        description="JSON settings files under the server Profiles folder. Auto-detected settings stay on; turn extras on if a mod hid them."
        badges={
          catalog.data && !catalog.data.missing ? (
            <Badge variant="outline" className="text-[10px]">
              {catalog.data.enabledCount}/{catalog.data.totalCount} on
            </Badge>
          ) : null
        }
        actions={
          hasOverrides ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={resetAll.isPending}
              onClick={() =>
                resetAll.mutate(undefined, {
                  onSuccess: () => toast.success("overrides reset to auto"),
                  onError: (err) => toast.error(errorMessage(err)),
                })
              }
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset all to auto
            </Button>
          ) : null
        }
      />
      <Explainer
        title="How Mod settings works"
        subtitle="Profiles JSON, not Market / Quests / Loadouts"
        storageKey="explainer:mod-settings"
      >
        <p>
          These files live under the server Profiles folder. Auto-detected
          settings stay on; turn extras on if a mod hid them. The list
          defaults to On — use All or Off to find files the scan left out.
        </p>
        <p>
          Include wins over auto-off, exclude wins over auto-on. Expansion
          Market, Traders, Quests, Loadouts and AI stay off here — they already
          have dedicated editors. Save writes the workspace and auto-commits;
          Copy to Local / Send to production are unchanged.
        </p>
      </Explainer>

      {catalog.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning Profiles…
        </div>
      ) : catalog.isError ? (
        <div className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{errorMessage(catalog.error)}</AlertDescription>
          </Alert>
        </div>
      ) : catalog.data?.missing ? (
        <div className="p-6">
          <Alert>
            <AlertDescription>
              Profiles folder is not in the workspace yet. Pull from the{" "}
              <Link to="/app/sync" className="font-medium underline-offset-2 hover:underline">
                Sync
              </Link>{" "}
              page first.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-r border-border/60">
            <div className="shrink-0 space-y-2 border-b border-border/60 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search settings…"
                  className="h-8 pl-8 text-xs"
                />
                {query ? (
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Filter className="h-3 w-3" />
                </span>
                {(
                  [
                    ["all", "All", totalCount],
                    ["on", "On", onCount],
                    ["off", "Off", offCount],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStatus(id)}
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] transition",
                      status === id
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {label}
                    <span className="ml-1 text-[10px] opacity-70">{count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-xs text-muted-foreground">
                  No matching JSON files.
                  {status !== "all" ? " Try All, or turn a file on." : null}
                </p>
              ) : (
                filtered.map((group) => (
                  <CatalogGroup
                    key={group.folder}
                    group={group}
                    showOffDivider={status === "all"}
                    selected={selected}
                    onSelect={setSelected}
                    onToggle={toggle}
                    onReset={resetFile}
                    busy={setOverride.isPending}
                  />
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selectedFile ? (
              <ModSettingsEditor
                file={selectedFile}
                onDeleted={() => setSelected(null)}
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                Select a file from the catalog.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function CatalogGroup({
  group,
  showOffDivider,
  selected,
  onSelect,
  onToggle,
  onReset,
  busy,
}: {
  group: ProfileJsonGroup;
  showOffDivider: boolean;
  selected: string | null;
  onSelect: (path: string) => void;
  onToggle: (file: ProfileJsonFile, on: boolean) => void;
  onReset: (file: ProfileJsonFile) => void;
  busy: boolean;
}) {
  const onFiles = group.files.filter((f) => f.enabled);
  const offFiles = group.files.filter((f) => !f.enabled);
  const split = showOffDivider && onFiles.length > 0 && offFiles.length > 0;
  const first = split ? onFiles : group.files;
  const rest = split ? offFiles : [];

  return (
    <section className="border-b border-border/40">
      <h3 className="sticky top-0 z-10 bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {group.folder || "Profiles"}
        <span className="ml-1.5 font-normal normal-case tracking-normal opacity-70">
          {onFiles.length}/{group.files.length}
        </span>
      </h3>
      <ul>
        {first.map((file) => (
          <CatalogRow
            key={file.relativePath}
            file={file}
            selected={file.relativePath === selected}
            onSelect={() => onSelect(file.relativePath)}
            onToggle={(on) => onToggle(file, on)}
            onReset={() => onReset(file)}
            busy={busy}
          />
        ))}
        {rest.length > 0 ? (
          <li className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            Off
          </li>
        ) : null}
        {rest.map((file) => (
          <CatalogRow
            key={file.relativePath}
            file={file}
            selected={file.relativePath === selected}
            onSelect={() => onSelect(file.relativePath)}
            onToggle={(on) => onToggle(file, on)}
            onReset={() => onReset(file)}
            busy={busy}
          />
        ))}
      </ul>
    </section>
  );
}

function CatalogRow({
  file,
  selected,
  onSelect,
  onToggle,
  onReset,
  busy,
}: {
  file: ProfileJsonFile;
  selected: boolean;
  onSelect: () => void;
  onToggle: (on: boolean) => void;
  onReset: () => void;
  busy: boolean;
}) {
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex w-full cursor-pointer items-start gap-2 px-3 py-2 text-left text-xs transition-colors",
          selected ? "bg-muted" : "hover:bg-muted/50",
          !file.enabled && "opacity-60",
        )}
      >
        <Switch
          size="sm"
          checked={file.enabled}
          disabled={busy}
          onCheckedChange={(on) => onToggle(on === true)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
          aria-label={`Include ${file.fileName}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium">{file.name}</span>
            <StateBadge file={file} />
          </div>
          <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {shortPath(file.relativePath)} · {fmtBytes(file.sizeBytes)}
          </div>
          {file.dedicatedRoute ? (
            <Link
              to={file.dedicatedRoute}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              open in Expansion
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          ) : null}
          {file.overrideState ? (
            <button
              type="button"
              className="mt-0.5 block text-[10px] text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onReset();
              }}
            >
              reset to auto
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StateBadge({ file }: { file: ProfileJsonFile }) {
  if (file.overrideState === "include") {
    return (
      <Badge className="h-4 px-1 text-[9px] uppercase">On</Badge>
    );
  }
  if (file.overrideState === "exclude") {
    return (
      <Badge variant="secondary" className="h-4 px-1 text-[9px] uppercase">
        Off
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">
      Auto
    </Badge>
  );
}

function nextAction(
  file: ProfileJsonFile,
  wantOn: boolean,
): ProfileJsonOverrideAction {
  if (wantOn) return file.autoOn ? "auto" : "include";
  return file.autoOn ? "exclude" : "auto";
}

function filterGroups(
  groups: ProfileJsonGroup[],
  query: string,
  status: StatusFilter,
): ProfileJsonGroup[] {
  const q = query.trim().toLowerCase();
  return groups
    .map((g) => {
      const files = g.files
        .filter((f) => {
          if (status === "on" && !f.enabled) return false;
          if (status === "off" && f.enabled) return false;
          if (!q) return true;
          return (
            f.name.toLowerCase().includes(q) ||
            f.fileName.toLowerCase().includes(q) ||
            f.relativePath.toLowerCase().includes(q) ||
            g.folder.toLowerCase().includes(q)
          );
        })
        .slice()
        .sort((a, b) => {
          if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
          return a.name.localeCompare(b.name, undefined, {
            sensitivity: "base",
          });
        });
      return { ...g, files };
    })
    .filter((g) => g.files.length > 0);
}

function shortPath(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  if (parts.length <= 3) return relativePath;
  return parts.slice(-3).join("/");
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
