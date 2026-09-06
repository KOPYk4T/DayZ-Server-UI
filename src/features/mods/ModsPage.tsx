import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  Import,
  Info,
  Key,
  Loader2,
  Package,
  PackagePlus,
  Puzzle,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CeImportDialog } from "@/features/items/CeImportDialog";
import { useModsScan } from "@/hooks/useMods";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  KnownModKind,
  ModCeAvailability,
  ModInfo,
  ModsScan,
} from "@/types/ipc";

import { moduleByKnown, type ModModule } from "./modules";
import {
  useModsActivation,
  useRemoveUserMod,
  useSetModActivation,
} from "./useModsActivation";
import { AddModFolderDialog } from "./AddModFolderDialog";

const KNOWN_LABEL: Record<KnownModKind, string> = {
  traderPlus: "TraderPlus",
  expansion: "DayZ Expansion",
  drJones: "Dr Jones Trader",
  communityFramework: "Community Framework",
  other: "",
};

/** One-line note shown on a known-mod card when no dedicated
 *  configurator module exists yet. Expansion has its own page, so
 *  it gets an empty string. */
const KNOWN_HINT: Record<KnownModKind, string> = {
  traderPlus: "Dedicated configurator coming in a later release.",
  expansion: "",
  drJones: "Dedicated configurator coming in a later release.",
  communityFramework: "Core framework — no dedicated editor planned.",
  other: "",
};

export function ModsPage() {
  const active = useProfileStore((s) => s.active);
  const query = useModsScan();
  const activation = useModsActivation();
  const [search, setSearch] = useState("");
  const [importSource, setImportSource] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const scan = query.data;
  const filtered = useMemo(() => {
    if (!scan) return [];
    const q = search.trim().toLowerCase();
    if (!q) return scan.mods;
    return scan.mods.filter((m) => {
      const hay =
        `${m.name} ${m.folderName} ${m.ceFolders.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [scan, search]);

  // Split detected mods into two buckets: those with a dedicated
  // ModModule ("known") and those without ("detected-no-module").
  // User-added mods come from the activation store, not the scan,
  // since scanner doesn't know about them.
  const { known, unknown } = useMemo(() => {
    const known: Array<{ mod: ModInfo; module: ModModule }> = [];
    const unknown: ModInfo[] = [];
    for (const m of filtered) {
      const module = moduleByKnown(m.known);
      if (module) known.push({ mod: m, module });
      else unknown.push(m);
    }
    return { known, unknown };
  }, [filtered]);

  const userAdded = activation.data?.userAdded ?? [];

  if (!active) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a profile first.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Puzzle}
        title="Mods"
        description="Detected workshop / user mods, their CE folders, and the Expansion submodules surfaced when applicable."
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search mods / CE folders"
                className="h-8 w-56 pl-7 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
              Add mod folder…
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              title="Rescan"
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4 overflow-y-auto p-6">

        {query.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…
          </div>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{errorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : scan ? (
          <>
            {scan.inventorySource === "missing" ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Mod inventory for this profile hasn't been captured
                  yet. The next <strong>Pull</strong> will enumerate
                  your remote <code>@*</code> folders and{" "}
                  <code>keys/*.bikey</code> files automatically — until
                  then only mods registered through{" "}
                  <code>cfgeconomycore.xml</code> show up.
                </AlertDescription>
              </Alert>
            ) : null}

            {scan.orphanCeFolders.length > 0 ? (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  {scan.orphanCeFolders.length} CE folder
                  {scan.orphanCeFolders.length === 1 ? "" : "s"} in{" "}
                  <code>cfgeconomycore.xml</code> didn't match any mod —
                  likely custom hand-authored overrides:{" "}
                  <span className="font-mono text-xs">
                    {scan.orphanCeFolders.join(", ")}
                  </span>
                </AlertDescription>
              </Alert>
            ) : null}

            <Stats scan={scan} />

            {/* <SanityCheckBanner scan={scan} /> */}

            <CeIntegrationExplainer scan={scan} />

            <ImportableModsSection scan={scan} onImport={setImportSource} />

            {scan.mods.length + userAdded.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Puzzle className="h-8 w-8 opacity-40" />
                <p>
                  No mods detected. For local profiles this means the
                  server root has no <code>@*</code> folders and no
                  mod-registered CE folders. Use{" "}
                  <strong>Add mod folder…</strong> above to register one
                  manually.
                </p>
              </div>
            ) : (
              <>
                {known.length > 0 ? (
                  <ModSection
                    title="Known mods"
                    hint="Mods with a dedicated editor. Click to open."
                    emptyMatchText="No known mods match the search."
                    empty={filtered.length === 0 && search.trim().length > 0}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {known.map(({ mod, module }) => (
                        <KnownModCard
                          key={mod.folderName || mod.name}
                          mod={mod}
                          module={module}
                          scan={scan}
                          onImport={setImportSource}
                          modId={modIdFor(mod)}
                        />
                      ))}
                    </div>
                  </ModSection>
                ) : null}

                {unknown.length > 0 ? (
                  <ModSection
                    title="Detected, no module yet"
                    hint="Detected mods that dont have a dedicated module yet. If  xml files are found within the mod, use the Review & Import button to register them which automatically makes them available troughout the application."
                    emptyMatchText="No other mods match the search."
                    empty={filtered.length === 0 && search.trim().length > 0}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {unknown.map((m) => (
                        <ModCard
                          key={m.folderName || m.name}
                          mod={m}
                          inventoryMissing={scan.inventorySource === "missing"}
                          onImport={setImportSource}
                          modId={modIdFor(m)}
                        />
                      ))}
                    </div>
                  </ModSection>
                ) : null}

                {userAdded.length > 0 ? (
                  <ModSection
                    title="User-added (manual)"
                    hint="Mods you registered by folder — not auto-detected. Remove to stop tracking."
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {userAdded.map((u) => (
                        <UserAddedModCard key={u.id} user={u} />
                      ))}
                    </div>
                  </ModSection>
                ) : null}
              </>
            )}
          </>
        ) : null}

        <AddModFolderDialog open={addOpen} onOpenChange={setAddOpen} />

        <CeImportDialog
          open={importSource !== null}
          onOpenChange={(v) => {
            if (!v) {
              setImportSource(null);
              // Rescan so the "already registered" heuristic flips and
              // the just-imported mod drops out of the Importable section.
              void query.refetch();
            }
          }}
          initialSourceDir={importSource}
        />
      </div>
    </div>
  );
}

/** Stable per-profile id for a mod. Known mods use their kind slug
 *  so the Expansion mod has the same id everywhere (`expansion`)
 *  regardless of whether the folder is `@Expansion`, `@DayZ-Expansion`,
 *  or registered only via CE. Unknown mods fall back to a sanitised
 *  folder name so two random mods don't collide. */
function modIdFor(m: ModInfo): string {
  if (m.known !== "other") return m.known.toLowerCase();
  const src = (m.folderName || m.name).toLowerCase();
  return src.replace(/[^a-z0-9_-]/g, "_");
}

// function SanityCheckBanner({ scan }: { scan: ModsScan }) {
//   const activation = useModsActivation();
//   const onMods = useMemo(() => {
//     return scan.mods.filter((m) => {
//       const id = modIdFor(m);
//       // Default-on — only a saved "off" excludes a mod.
//       return activation.data?.activation[id] !== "off";
//     });
//   }, [scan.mods, activation.data]);
//   const modParam = useMemo(
//     () =>
//       onMods
//         .map((m) => m.folderName || m.name)
//         .filter((s) => s.length > 0)
//         .map((s) => (s.startsWith("@") ? s : `@${s}`))
//         .join(";"),
//     [onMods],
//   );

//   const [copied, setCopied] = useState(false);
//   const copy = async () => {
//     try {
//       await navigator.clipboard.writeText(modParam);
//       setCopied(true);
//       setTimeout(() => setCopied(false), 1500);
//     } catch {
//       // Clipboard API failures are harmless — the user can select
//       // and copy the visible string instead.
//     }
//   };

//   return (
//     <Alert className="border-severity-warning/30 bg-severity-warning/5">
//       <Info className="h-4 w-4 text-severity-warning" />
//       <AlertDescription className="text-xs">
//         <p>
//           <strong>Sanity check:</strong> the server's{" "}
//           <code>mod=&quot;…&quot;</code> launch parameter at boot is
//           what actually runs. This app can't read it, so activation
//           toggles here are your claim. Confirm the on-mods match what
//           the server launches.
//         </p>
//         {modParam.length > 0 ? (
//           <div className="mt-1.5 flex flex-wrap items-center gap-2">
//             <code className="max-w-full truncate rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">
//               mod={modParam}
//             </code>
//             <Button
//               type="button"
//               size="sm"
//               variant="outline"
//               className="h-6 px-2 text-[10px]"
//               onClick={copy}
//             >
//               {copied ? "copied ✓" : "copy"}
//             </Button>
//           </div>
//         ) : null}
//       </AlertDescription>
//     </Alert>
//   );
// }

function Stats({
  scan,
}: {
  scan: { mods: ModInfo[]; orphanCeFolders: string[] };
}) {
  const diskMods = scan.mods.filter((m) => m.folderName).length;
  const ceOnly = scan.mods.length - diskMods;
  const knownCount = scan.mods.filter((m) => m.known !== "other").length;
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
      <span>
        <strong className="text-foreground">{scan.mods.length}</strong>{" "}
        total
      </span>
      <span>
        <strong className="text-foreground">{diskMods}</strong> on disk
      </span>
      <span>
        <strong className="text-foreground">{ceOnly}</strong> CE-only
      </span>
      <span>
        <strong className="text-foreground">{knownCount}</strong> known
      </span>
      {scan.orphanCeFolders.length > 0 ? (
        <span>
          <strong className="text-foreground">
            {scan.orphanCeFolders.length}
          </strong>{" "}
          orphan CE folders
        </span>
      ) : null}
    </div>
  );
}

function CeIntegrationExplainer({ scan }: { scan: ModsScan }) {
  const ceRegisteredCount = scan.mods.reduce(
    (n, m) => n + m.ceFolders.length,
    0,
  );
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription className="text-xs">
        <strong>Cross-editor integration.</strong> Types, events,
        spawnable types, and random presets registered by any mod in{" "}
        <code>cfgeconomycore.xml</code> (currently{" "}
        {ceRegisteredCount} folder{ceRegisteredCount === 1 ? "" : "s"})
        feed into the main{" "}
        <Link to="/app/items" className="font-medium underline-offset-2 hover:underline">
          Items
        </Link>
        ,{" "}
        <Link to="/app/events" className="font-medium underline-offset-2 hover:underline">
          Events
        </Link>
        , and{" "}
        <Link
          to="/app/loadouts"
          className="font-medium underline-offset-2 hover:underline"
        >
          Loadouts
        </Link>{" "}
        editors automatically.
      </AlertDescription>
    </Alert>
  );
}

function ImportableModsSection({
  scan,
  onImport,
}: {
  scan: ModsScan;
  onImport: (sourcePath: string) => void;
}) {
  // Mods that ship CE fragments we haven't registered yet. Shown
  // prominently so a freshly-installed mod doesn't need a trip to the
  // Items page to get its types / events wired up.
  const pending = scan.mods.filter(
    (m) => m.ceAvailability && !m.ceAvailability.alreadyRegistered,
  );
  if (pending.length === 0) return null;

  return (
    <Alert className="border-primary/40 bg-primary/5">
      <PackagePlus className="h-4 w-4 text-primary" />
      <AlertDescription>
        <p className="text-xs font-semibold text-foreground">
          {pending.length} mod{pending.length === 1 ? "" : "s"} ship CE
          files that aren't registered yet
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Types / events / spawnable-types / presets sitting inside
          the mod folder (usually <code>@ModName/files/</code>). Click
          Review &amp; Import on each to copy them into the mission
          and register them in <code>cfgeconomycore.xml</code> so the
          main Items / Events / Loadouts editors see them.
        </p>
        <div className="flex flex-col gap-1.5">
          {pending.map((m) => {
            const avail = m.ceAvailability!;
            return (
              <div
                key={m.folderName || m.name}
                className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-background px-2 py-1.5 text-xs"
              >
                <span className="truncate font-medium">{m.name}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {describeAvailability(avail)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className="ml-auto h-7 px-2 text-[11px]"
                  onClick={() => onImport(avail.sourcePath)}
                >
                  <Import className="mr-1 h-3 w-3" /> Review &amp;
                  Import
                </Button>
              </div>
            );
          })}
        </div>
      </AlertDescription>
    </Alert>
  );
}

function describeAvailability(avail: ModCeAvailability): string {
  const parts: string[] = [];
  const order = [
    "types",
    "spawnabletypes",
    "events",
    "event positions",
    "random presets",
  ];
  for (const k of order) {
    const n = avail.byKind[k] ?? 0;
    if (n > 0) parts.push(`${n} ${k}`);
  }
  const summary = parts.join(" · ") || `${avail.fileCount} file(s)`;
  return avail.typesRecordCount > 0
    ? `${summary} · ${avail.typesRecordCount} classnames`
    : summary;
}

function ModSection({
  title,
  hint,
  emptyMatchText,
  empty = false,
  children,
}: {
  title: string;
  hint: string;
  emptyMatchText?: string;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      {empty && emptyMatchText ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          {emptyMatchText}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/** Card for a detected mod that *has* a dedicated ModModule. Adds a
 *  prominent "Open editor" link on top of the standard ModCard
 *  content — everything else (activation switch, CE import badge,
 *  file counts) is reused from the generic card. */
function KnownModCard({
  mod,
  module,
  scan,
  onImport,
  modId,
}: {
  mod: ModInfo;
  module: ModModule;
  scan: ModsScan;
  onImport: (sourcePath: string) => void;
  modId: string;
}) {
  const Icon = module.icon;
  return (
    <div className="flex flex-col gap-2">
      <Link
        to={`/app/mods/${module.slug}`}
        className="group flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 transition-colors hover:bg-primary/10"
      >
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{module.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {module.summary(scan)}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-primary">
          Open editor
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
      <ModCard
        mod={mod}
        inventoryMissing={scan.inventorySource === "missing"}
        onImport={onImport}
        modId={modId}
      />
    </div>
  );
}

/** Card for a user-added mod. Distinct visual from auto-detected
 *  cards because the operator explicitly registered it — needs a
 *  remove affordance that the scanner-detected mods don't have. */
function UserAddedModCard({
  user,
}: {
  user: { id: string; displayName: string; folderPath: string };
}) {
  const activation = useModsActivation();
  const setActivation = useSetModActivation();
  const remove = useRemoveUserMod();
  const isOn = activation.data?.activation[user.id] !== "off";
  return (
    <Card className={cn("gap-3 py-4", !isOn && "opacity-60")}>
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="truncate">{user.displayName}</span>
          <Badge variant="outline" className="shrink-0">
            user-added
          </Badge>
          <div
            className="ml-auto flex shrink-0 items-center gap-1.5"
            title={isOn ? "active on boot" : "not running on boot"}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isOn ? "on" : "off"}
            </span>
            <Switch
              checked={isOn}
              onCheckedChange={(next) =>
                setActivation.mutate({ modId: user.id, on: next })
              }
              disabled={setActivation.isPending}
            />
          </div>
        </CardTitle>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {user.folderPath}
        </p>
      </CardHeader>
      <CardContent className="px-4 text-sm">
        <p className="text-[11px] text-muted-foreground">
          Registered manually via <em>Add mod folder…</em>. Stored in{" "}
          <code>.dzmgr/mods.json</code>.
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-2 h-7 text-[11px] text-destructive"
          onClick={() => remove.mutate(user.id)}
          disabled={remove.isPending}
        >
          <Trash2 className="mr-1 h-3 w-3" />
          Remove
        </Button>
      </CardContent>
    </Card>
  );
}

function ModCard({
  mod,
  inventoryMissing,
  onImport,
  modId,
}: {
  mod: ModInfo;
  inventoryMissing: boolean;
  onImport: (sourcePath: string) => void;
  modId: string;
}) {
  const knownLabel = KNOWN_LABEL[mod.known];
  const knownHint = KNOWN_HINT[mod.known];
  const ceOnly = !mod.folderName;
  const avail = mod.ceAvailability ?? null;
  const activation = useModsActivation();
  const setActivation = useSetModActivation();
  // Default to "on" for anything the store doesn't know yet —
  // matches the Rust-side default and means newly-detected mods
  // surface as active without requiring a save.
  const isOn = activation.data?.activation[modId] !== "off";
  return (
    <Card className={cn("gap-3 py-4", !isOn && "opacity-60")}>
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="truncate">{mod.name}</span>
          {knownLabel ? (
            <Badge variant="secondary" className="shrink-0">
              {knownLabel}
            </Badge>
          ) : null}
          {ceOnly ? (
            <Badge variant="outline" className="shrink-0">
              CE only
            </Badge>
          ) : null}
          <div
            className="ml-auto flex shrink-0 items-center gap-1.5"
            title={isOn ? "active on boot" : "not running on boot"}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isOn ? "on" : "off"}
            </span>
            <Switch
              checked={isOn}
              onCheckedChange={(next) =>
                setActivation.mutate({ modId, on: next })
              }
              disabled={setActivation.isPending}
            />
          </div>
        </CardTitle>
        {mod.folderName ? (
          <p className="truncate font-mono text-xs text-muted-foreground">
            {mod.folderName}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2 px-4 text-sm">
        {!ceOnly ? (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              <strong className="text-foreground">{mod.addonCount}</strong>{" "}
              pbo{mod.addonCount === 1 ? "" : "s"}
            </span>
            <span
              className={`inline-flex items-center gap-1 ${mod.bikeyCount === 0 ? "text-severity-warning" : ""
                }`}
            >
              <Key className="h-3.5 w-3.5" />
              <strong
                className={
                  mod.bikeyCount === 0 ? "" : "text-foreground"
                }
              >
                {mod.bikeyCount}
              </strong>{" "}
              bikey{mod.bikeyCount === 1 ? "" : "s"}
              {mod.bikeyCount === 0 ? " (missing)" : ""}
            </span>
          </div>
        ) : inventoryMissing ? (
          <p className="text-xs text-muted-foreground">
            Detected via CE registration only — pull the workspace to
            capture the full <code>@*</code> folder + key inventory
            from the server.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Registered in <code>cfgeconomycore.xml</code> but no{" "}
            <code>@{mod.name}</code> folder on disk.
          </p>
        )}

        {avail ? (
          <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
            <div className="flex items-center gap-1 text-[11px] font-semibold">
              {avail.alreadyRegistered ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-severity-success" />
                  <span>CE files registered</span>
                </>
              ) : (
                <>
                  <PackagePlus className="h-3 w-3 text-primary" />
                  <span>CE files available</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {describeAvailability(avail)}
            </p>
            {!avail.alreadyRegistered ? (
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-7 w-full px-2 text-[11px]"
                onClick={() => onImport(avail.sourcePath)}
              >
                <Import className="mr-1 h-3 w-3" /> Review &amp; Import
              </Button>
            ) : null}
          </div>
        ) : null}

        {mod.ceFolders.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">CE folders</p>
            <div className="flex flex-wrap gap-1">
              {mod.ceFolders.map((f) => (
                <Badge
                  key={f}
                  variant="outline"
                  className="font-mono text-[11px]"
                >
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        {mod.path ? (
          <p className="flex items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
            <FolderOpen className="h-3 w-3 shrink-0" />
            {mod.path}
          </p>
        ) : null}

        {knownHint ? (
          <p className="text-[11px] text-muted-foreground italic">
            {knownHint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
