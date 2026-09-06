import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bug,
  ChevronDown,
  ChevronRight,
  Coins,
  FileJson2,
  FolderOpen,
  GitBranch,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Pencil,
  RefreshCw,
  Scroll,
  Settings as SettingsIcon,
  Shield,
  Shirt,
  Sliders,
  Target,
  UserPlus,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModsScan } from "@/hooks/useMods";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ExpansionDataFolder,
  ExpansionInventory,
  ExpansionSettingsFile,
} from "@/types/ipc";

import { ExpansionCeInstallBanner } from "./ExpansionCeInstallBanner";
import { ExpansionDataBrowser } from "./ExpansionDataBrowser";
import { ExpansionSettingsEditor } from "./ExpansionSettingsEditor";
import { schemaFor } from "./schemas";

/**
 * DayZ Expansion landing page — navigation-driven.
 *
 * Left rail groups surfaces by **kind** (Map editor · Typed editors ·
 * Settings files · Data folders) so at a glance you can tell whether
 * a click opens a page, a dialog, or a map layer. Settings and data
 * folders are collapsible per domain (Trading / Quests / AI / …) so
 * the rail stays compact even on servers with 30+ settings files.
 * Right pane is a thin overview: map-editor hero + scan stats + a
 * short help blurb. The legacy tile grid is gone.
 */

// ---------- Top-level page ----------

export function ExpansionPage() {
  const active = useProfileStore((s) => s.active);
  const query = useModsScan();
  const [editingFile, setEditingFile] =
    useState<ExpansionSettingsFile | null>(null);
  const [browsePath, setBrowsePath] = useState<string | null>(null);

  if (!active) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a profile first.
      </div>
    );
  }

  const scan = query.data;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <Breadcrumb />
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">DayZ Expansion</h1>
        </div>
        <p className="text-xs text-muted-foreground">
          Every Expansion submodule's config — map layers, traders,
          quests, AI loadouts, settings files — in one place.
        </p>
        {scan?.expansion ? <StatsLine inv={scan.expansion} /> : null}
        <Button
          variant="secondary"
          size="icon"
          className="ml-auto"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          title="Rescan"
        >
          <RefreshCw
            className={cn("h-4 w-4", query.isFetching && "animate-spin")}
          />
        </Button>
      </header>

      {query.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…
        </div>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : !scan?.expansion ? (
        <NotInstalledState />
      ) : (
        <>
          <ExpansionCeInstallBanner />
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[300px_1fr]">
            <ExpansionNavRail
              inv={scan.expansion}
              onEdit={setEditingFile}
              onBrowse={setBrowsePath}
            />
            <ExpansionOverview inv={scan.expansion} />
          </div>
        </>
      )}

      <ExpansionSettingsEditor
        open={editingFile !== null}
        onOpenChange={(v) => {
          if (!v) setEditingFile(null);
        }}
        file={editingFile}
      />

      <ExpansionDataBrowser
        open={browsePath !== null}
        onOpenChange={(v) => {
          if (!v) setBrowsePath(null);
        }}
        initialPath={browsePath}
        settingsRoot={scan?.expansion?.settingsRoot ?? ""}
      />
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        to="/app/mods"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60"
      >
        <ArrowLeft className="h-3 w-3" /> Mods
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">Expansion</span>
    </nav>
  );
}

function NotInstalledState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      <Layers className="h-8 w-8 opacity-40" />
      <p className="font-medium">DayZ Expansion isn't detected in this workspace.</p>
      <p className="max-w-md">
        Expansion writes its settings tree under{" "}
        <code>profiles/ExpansionMod/</code> on first server start. If the
        mod is installed but this page is empty, boot the server once
        with Expansion loaded, then Pull again.
      </p>
    </div>
  );
}

function StatsLine({ inv }: { inv: ExpansionInventory }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Badge variant="secondary" className="text-[10px]">
        {inv.settingsFiles.length} settings
      </Badge>
      {inv.dataFolders.length > 0 ? (
        <Badge variant="outline" className="text-[10px]">
          {inv.dataFolders.length} folders
        </Badge>
      ) : null}
      <code className="hidden font-mono text-[10px] md:inline">
        {inv.settingsRoot}/
      </code>
    </div>
  );
}

// ---------- Taxonomy ----------

interface EditorEntry {
  name: string;
  description: string;
  icon: LucideIcon;
  to: string;
  /** Data folder the editor manages (marked claimed so it doesn't
   *  also appear under Data folders). */
  folderName?: string;
}

interface MapModeEntry {
  name: string;
  icon: LucideIcon;
  to: string;
}

/** Typed page editors. These cover enough of Expansion's content
 *  that most operators never need to touch the raw data folders —
 *  a folder with a backing editor here is claimed so it doesn't
 *  duplicate in the Data folders rail. */
const EDITORS: EditorEntry[] = [
  {
    name: "Market categories",
    description:
      "Price tables, stock thresholds, and spawn attachments per category.",
    icon: Coins,
    to: "/app/mods/expansion/market",
    folderName: "Market",
  },
  {
    name: "Trader inventory",
    description:
      "Per-trader buy/sell lists, reputation gate, quest gate, currencies.",
    icon: Users,
    to: "/app/mods/expansion/traders",
    folderName: "Traders",
  },
  {
    name: "Quest definitions",
    description:
      "Identity, rewards, objectives, pre-quest chains, faction + reputation gates.",
    icon: Scroll,
    to: "/app/mods/expansion/quests",
    folderName: "Quests",
  },
  {
    name: "Quest graph",
    description:
      "Pan-zoom visualisation of prerequisite chains + follow-up links.",
    icon: GitBranch,
    to: "/app/mods/expansion/quest-graph",
  },
  {
    name: "Quest NPCs",
    description:
      "Position, dialogue, waypoints, and emotes for each quest giver / turn-in.",
    icon: UserPlus,
    to: "/app/mods/expansion/quest-npcs",
  },
  {
    name: "Objectives",
    description:
      "Typed forms for every objective type (Travel, Target, Collection, AI camps, …).",
    icon: Target,
    to: "/app/mods/expansion/objectives",
  },
  {
    name: "AI loadouts",
    description:
      "Attachment slots, cargo, sets, health ranges, construction parts — recursive typed editor.",
    icon: Shirt,
    to: "/app/mods/expansion/loadouts",
    folderName: "Loadouts",
  },
  {
    name: "Player spawn gear",
    description:
      "Clothing pools, starting gear, loadouts-mode toggle, respawn cooldowns — everything in SpawnSettings.json except the map locations.",
    icon: Shirt,
    to: "/app/mods/expansion/player-spawn-gear",
  },
];

/** Map editor is the single most important entry point. Shown in
 *  the rail as a prominent accent block with chips for each mode. */
const MAP_MODES: MapModeEntry[] = [
  { name: "Traders", icon: MapPin, to: "/app/mods/expansion/map?mode=traders" },
  { name: "Zones", icon: MapPin, to: "/app/mods/expansion/map?mode=zones" },
  { name: "Safezones", icon: Shield, to: "/app/mods/expansion/map?mode=safezones" },
  { name: "Quest NPCs", icon: UserPlus, to: "/app/mods/expansion/map?mode=quest-npcs" },
  { name: "AI patrols", icon: Users, to: "/app/mods/expansion/map?mode=ai-patrols" },
  { name: "Spawn selection", icon: MapPin, to: "/app/mods/expansion/map?mode=spawn-selection" },
];

interface DomainGroup {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Matches `ExpansionSettingsFile.name`. */
  settingsMatch?: (name: string) => boolean;
  /** Matches a top-level folder name under `ExpansionMod/`. */
  folderMatch?: (name: string) => boolean;
}

/** Domains for grouping settings and data folders. The set is
 *  stable; adding a new Expansion sub-module means adding one row
 *  here. Predicate regex match order follows declaration order. */
const DOMAINS: DomainGroup[] = [
  {
    id: "trading",
    title: "Trading & market",
    icon: Coins,
    settingsMatch: (n) => /^(market|p2p)/i.test(n),
  },
  {
    id: "quests",
    title: "Quests & NPCs",
    icon: Scroll,
    settingsMatch: (n) => /^quest/i.test(n),
  },
  {
    id: "ai",
    title: "AI",
    icon: Users,
    settingsMatch: (n) => /^ai/i.test(n),
    folderMatch: (n) => n === "AI",
  },
  {
    id: "world",
    title: "World & safety",
    icon: Shield,
    settingsMatch: (n) =>
      /^(safezone|raid|territory|basebuilding|nobuild)/i.test(n),
  },
  {
    id: "spawn-gear",
    title: "Spawn & starting gear",
    icon: MapPin,
    settingsMatch: (n) => /^spawn/i.test(n),
  },
  {
    id: "storage",
    title: "Storage & garages",
    icon: FolderOpen,
    settingsMatch: (n) => /^(garage|personalstorage)/i.test(n),
  },
  {
    id: "ui",
    title: "UI, chat, notifications",
    icon: MessageSquare,
    settingsMatch: (n) =>
      /^(chat|notification|book|map|nametag|playerlist|party|social)/i.test(n),
  },
  {
    id: "core",
    title: "Core & gameplay",
    icon: Sliders,
    settingsMatch: (n) =>
      /^(core|general|mission|damage|airdrop|cosmetic|vehicle)/i.test(n),
  },
  {
    id: "ops",
    title: "Logs & monitoring",
    icon: Bug,
    settingsMatch: (n) => /^(log|debug|monitoring)/i.test(n),
  },
];

/** Folders whose contents are written by the running server and
 *  should NEVER be edited mid-session. The rail flags them with a
 *  warning badge so the hint is unmistakable. */
const SERVER_STATE_FOLDERS = new Set(["ATM", "Groups", "Logs"]);

interface DomainBucket {
  domain: DomainGroup;
  settings: ExpansionSettingsFile[];
  folders: ExpansionDataFolder[];
}

interface NavModel {
  buckets: DomainBucket[];
  orphanSettings: ExpansionSettingsFile[];
  /** Non-server-state orphan folders (nothing claimed them). */
  orphanFolders: ExpansionDataFolder[];
  /** Runtime state folders pulled out into their own list so they
   *  always surface with a warning badge. */
  runtimeFolders: ExpansionDataFolder[];
}

function buildNavModel(inv: ExpansionInventory): NavModel {
  const claimedFolders = new Set<string>();
  const claimedSettings = new Set<string>();

  // Editors with a backing folder claim that folder so it doesn't
  // also surface under Data folders (the editor is the canonical
  // way in).
  for (const ed of EDITORS) {
    if (ed.folderName) claimedFolders.add(ed.folderName);
  }

  const buckets: DomainBucket[] = DOMAINS.map((d) => {
    const settings: ExpansionSettingsFile[] = [];
    const folders: ExpansionDataFolder[] = [];
    if (d.settingsMatch) {
      for (const f of inv.settingsFiles) {
        if (!claimedSettings.has(f.name) && d.settingsMatch(f.name)) {
          settings.push(f);
          claimedSettings.add(f.name);
        }
      }
    }
    if (d.folderMatch) {
      for (const f of inv.dataFolders) {
        if (!claimedFolders.has(f.name) && d.folderMatch(f.name)) {
          folders.push(f);
          claimedFolders.add(f.name);
        }
      }
    }
    settings.sort((a, b) => a.name.localeCompare(b.name));
    folders.sort((a, b) => a.name.localeCompare(b.name));
    return { domain: d, settings, folders };
  });

  const orphanSettings = inv.settingsFiles
    .filter((f) => !claimedSettings.has(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const unclaimedFolders = inv.dataFolders.filter(
    (f) => !claimedFolders.has(f.name),
  );
  const runtimeFolders = unclaimedFolders
    .filter((f) => SERVER_STATE_FOLDERS.has(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const orphanFolders = unclaimedFolders
    .filter((f) => !SERVER_STATE_FOLDERS.has(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { buckets, orphanSettings, orphanFolders, runtimeFolders };
}

// ---------- Nav rail ----------

function ExpansionNavRail({
  inv,
  onEdit,
  onBrowse,
}: {
  inv: ExpansionInventory;
  onEdit: (file: ExpansionSettingsFile) => void;
  onBrowse: (path: string) => void;
}) {
  const model = useMemo(() => buildNavModel(inv), [inv]);

  const settingsCount =
    model.buckets.reduce((s, b) => s + b.settings.length, 0) +
    model.orphanSettings.length;
  const folderCount =
    model.buckets.reduce((s, b) => s + b.folders.length, 0) +
    model.orphanFolders.length +
    model.runtimeFolders.length;

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-md border border-border/60 bg-muted/20 p-3">
      <MapEditorBlock />

      <NavSection
        id="editors"
        title="Editors"
        icon={Pencil}
        count={EDITORS.length}
        defaultOpen
      >
        {EDITORS.map((ed) => (
          <NavLinkLeaf
            key={ed.to}
            to={ed.to}
            icon={ed.icon}
            label={ed.name}
            hint={ed.description}
          />
        ))}
      </NavSection>

      <NavSection
        id="settings"
        title="Settings files"
        icon={Sliders}
        count={settingsCount}
        defaultOpen
      >
        {model.buckets.map((b) =>
          b.settings.length === 0 ? null : (
            <DomainSettingsGroup
              key={b.domain.id}
              domain={b.domain}
              files={b.settings}
              onEdit={onEdit}
            />
          ),
        )}
        {model.orphanSettings.length > 0 ? (
          <DomainSettingsGroup
            domain={{
              id: "other",
              title: "Other",
              icon: FolderOpen,
            }}
            files={model.orphanSettings}
            onEdit={onEdit}
          />
        ) : null}
        {settingsCount === 0 ? (
          <EmptyHint>No settings files yet.</EmptyHint>
        ) : null}
      </NavSection>

      <NavSection
        id="folders"
        title="Data folders"
        icon={FolderOpen}
        count={folderCount}
      >
        {model.buckets.map((b) =>
          b.folders.length === 0 ? null : (
            <DomainFolderGroup
              key={b.domain.id}
              domain={b.domain}
              folders={b.folders}
              onBrowse={onBrowse}
            />
          ),
        )}
        {model.orphanFolders.length > 0 ? (
          <DomainFolderGroup
            domain={{
              id: "other-folders",
              title: "Other",
              icon: FolderOpen,
            }}
            folders={model.orphanFolders}
            onBrowse={onBrowse}
          />
        ) : null}
        {model.runtimeFolders.length > 0 ? (
          <DomainFolderGroup
            domain={{
              id: "runtime",
              title: "Runtime state",
              icon: AlertTriangle,
            }}
            folders={model.runtimeFolders}
            onBrowse={onBrowse}
            runtime
          />
        ) : null}
        {folderCount === 0 ? (
          <EmptyHint>No data folders yet.</EmptyHint>
        ) : null}
      </NavSection>
    </aside>
  );
}

function MapEditorBlock() {
  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-background p-2">
      <Link
        to="/app/mods/expansion/map"
        className="group flex items-center gap-2 rounded px-1 py-0.5 text-sm font-semibold text-primary hover:bg-primary/10"
      >
        <MapIcon className="h-4 w-4" strokeWidth={2} />
        Map editor
        <ArrowRight className="ml-auto h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <p className="text-[10px] text-muted-foreground">
        Shared canvas for all position-based Expansion surfaces.
      </p>
      <ul className="flex flex-wrap gap-1">
        {MAP_MODES.map((m) => (
          <li key={m.to}>
            <Link
              to={m.to}
              className="inline-flex items-center gap-1 rounded border border-primary/30 bg-background/60 px-1.5 py-0.5 text-[10px] text-foreground hover:border-primary hover:bg-primary/10"
              title={`${m.name} layer`}
            >
              <m.icon className="h-2.5 w-2.5 text-primary" />
              {m.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Nav primitives ----------

function NavSection({
  id,
  title,
  icon: Icon,
  count,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = count > 0;
  return (
    <section className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
        aria-controls={`nav-${id}`}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Icon className="h-3 w-3" />
        <span>{title}</span>
        <Badge
          variant="outline"
          className="ml-auto h-4 text-[9px] font-mono tabular-nums"
        >
          {count}
        </Badge>
      </button>
      {open && hasChildren ? (
        <div id={`nav-${id}`} className="space-y-0.5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function NavLinkLeaf({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      title={hint}
      className="group flex items-center gap-2 rounded px-2 py-1 text-xs text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Collapsible sub-group inside a NavSection. Used to keep the
 *  settings / folders rail scannable on servers with 30+ files. */
function NavSubsection({
  id,
  title,
  icon: Icon,
  count,
  warn,
  defaultOpen,
  children,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  count: number;
  warn?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors hover:bg-muted/60",
          warn ? "text-severity-warning" : "text-foreground",
        )}
        aria-expanded={open}
        aria-controls={`sub-${id}`}
      >
        {open ? (
          <ChevronDown className="h-2.5 w-2.5" />
        ) : (
          <ChevronRight className="h-2.5 w-2.5" />
        )}
        <Icon className="h-3 w-3" />
        <span className="truncate">{title}</span>
        <Badge
          variant="outline"
          className="ml-auto h-4 text-[9px] font-mono tabular-nums"
        >
          {count}
        </Badge>
      </button>
      {open ? (
        <ul id={`sub-${id}`} className="space-y-0.5 pl-5">
          {children}
        </ul>
      ) : null}
    </div>
  );
}

function DomainSettingsGroup({
  domain,
  files,
  onEdit,
}: {
  domain: Pick<DomainGroup, "id" | "title" | "icon">;
  files: ExpansionSettingsFile[];
  onEdit: (file: ExpansionSettingsFile) => void;
}) {
  return (
    <NavSubsection
      id={`s-${domain.id}`}
      title={domain.title}
      icon={domain.icon}
      count={files.length}
    >
      {files.map((f) => (
        <SettingsLeaf key={f.relativePath} file={f} onEdit={onEdit} />
      ))}
    </NavSubsection>
  );
}

function DomainFolderGroup({
  domain,
  folders,
  onBrowse,
  runtime,
}: {
  domain: Pick<DomainGroup, "id" | "title" | "icon">;
  folders: ExpansionDataFolder[];
  onBrowse: (path: string) => void;
  runtime?: boolean;
}) {
  return (
    <NavSubsection
      id={`f-${domain.id}`}
      title={domain.title}
      icon={domain.icon}
      count={folders.length}
      warn={runtime}
    >
      {folders.map((f) => (
        <FolderLeaf
          key={f.relativePath}
          folder={f}
          onBrowse={onBrowse}
          warn={runtime}
        />
      ))}
    </NavSubsection>
  );
}

function SettingsLeaf({
  file,
  onEdit,
}: {
  file: ExpansionSettingsFile;
  onEdit: (file: ExpansionSettingsFile) => void;
}) {
  const typed = schemaFor(file.name) != null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(file)}
        className="group flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors hover:bg-primary/5 hover:text-primary"
        title={`${file.relativePath} · ${formatBytes(file.sizeBytes)}`}
      >
        {typed ? (
          <SettingsIcon className="h-3 w-3 shrink-0 text-primary" />
        ) : (
          <FileJson2 className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-primary" />
        )}
        <span className="truncate">{prettySettingsName(file.name)}</span>
        {!typed ? (
          <Badge
            variant="outline"
            className="ml-auto h-4 px-1 text-[9px] opacity-60 group-hover:opacity-100"
            title="Raw JSON editor — no typed form yet."
          >
            JSON
          </Badge>
        ) : null}
      </button>
    </li>
  );
}

function FolderLeaf({
  folder,
  onBrowse,
  warn,
}: {
  folder: ExpansionDataFolder;
  onBrowse: (path: string) => void;
  warn?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onBrowse(folder.relativePath)}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors",
          warn
            ? "text-severity-warning hover:bg-severity-warning/5"
            : "hover:bg-primary/5 hover:text-primary",
        )}
        title={`${folder.relativePath} · ${folder.fileCount} json`}
      >
        <FolderOpen
          className={cn(
            "h-3 w-3 shrink-0",
            warn
              ? "text-severity-warning"
              : "text-muted-foreground group-hover:text-primary",
          )}
        />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto font-mono text-[9px] text-muted-foreground tabular-nums">
          {folder.fileCount}
        </span>
      </button>
    </li>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-1 text-[11px] italic text-muted-foreground">
      {children}
    </p>
  );
}

// ---------- Overview pane ----------

function ExpansionOverview({ inv }: { inv: ExpansionInventory }) {
  const model = useMemo(() => buildNavModel(inv), [inv]);
  const settingsCount =
    model.buckets.reduce((s, b) => s + b.settings.length, 0) +
    model.orphanSettings.length;
  const typedCount =
    model.buckets
      .flatMap((b) => b.settings)
      .filter((f) => schemaFor(f.name) != null).length +
    model.orphanSettings.filter((f) => schemaFor(f.name) != null).length;
  const folderCount =
    model.buckets.reduce((s, b) => s + b.folders.length, 0) +
    model.orphanFolders.length +
    model.runtimeFolders.length;

  return (
    <main className="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <Link
        to="/app/mods/expansion/map"
        className="group relative flex items-stretch gap-0 overflow-hidden rounded-lg border border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-background transition-colors hover:border-primary/70"
      >
        <div className="hidden items-center justify-center border-r border-primary/20 bg-primary/10 px-6 md:flex">
          <MapIcon className="h-10 w-10 text-primary" strokeWidth={1.3} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Map editor</h2>
            <Badge variant="default" className="bg-primary text-[10px]">
              UNIFIED
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            One world map, many layers. Trader NPCs, trader zones,
            safezones, quest NPCs, AI patrols, spawn selection — all
            visible together with togglable layers and a mode switch
            for what your edits target.
          </p>
        </div>
        <div className="flex items-center px-4 text-muted-foreground transition-colors group-hover:text-primary">
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </div>
      </Link>

      <section className="grid grid-cols-3 gap-3 rounded-md border border-border/60 bg-muted/10 p-3 text-xs">
        <StatTile
          icon={Pencil}
          label="Typed page editors"
          value={EDITORS.length}
          hint="Market, Traders, Quests, Graph, NPCs, Objectives, Loadouts"
        />
        <StatTile
          icon={Sliders}
          label="Settings files"
          value={settingsCount}
          hint={`${typedCount} with typed form · ${settingsCount - typedCount} raw JSON`}
        />
        <StatTile
          icon={FolderOpen}
          label="Data folders"
          value={folderCount}
          hint={
            model.runtimeFolders.length > 0
              ? `${model.runtimeFolders.length} runtime · do not edit live`
              : "Raw JSON browser"
          }
        />
      </section>

      <section className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3 text-xs">
        <h2 className="text-sm font-semibold">Getting around</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Map editor</strong> (above
            or top-left of the rail) is the single canvas for
            everything positional — pick a mode to target your edits.
          </li>
          <li>
            <strong className="text-foreground">Editors</strong> in the
            rail are full pages for structured data (quest chains,
            market tables, loadouts, …). One click per section.
          </li>
          <li>
            <strong className="text-foreground">Settings files</strong>{" "}
            open a dialog — typed form when a schema is available,
            otherwise a raw JSON editor with round-trip safety.
          </li>
          <li>
            <strong className="text-foreground">Data folders</strong>{" "}
            open the JSON browser. Runtime-state folders (ATM,
            Groups, Logs) stay untouched while the server is up.
          </li>
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Reference:{" "}
          <a
            href="https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-2 hover:underline"
          >
            DayZ Expansion wiki
          </a>
          .
        </p>
      </section>

      {inv.topLevelFiles > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {inv.topLevelFiles} loose file
          {inv.topLevelFiles === 1 ? "" : "s"} directly under{" "}
          <code className="font-mono">{inv.settingsRoot}/</code>. Open
          the{" "}
          <strong className="text-foreground">Data folders › Other</strong>{" "}
          entry in the rail to browse.
        </p>
      ) : null}
    </main>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3 text-primary" />
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

// ---------- Helpers ----------

function prettySettingsName(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
