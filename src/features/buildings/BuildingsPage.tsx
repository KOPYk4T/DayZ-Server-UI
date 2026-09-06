import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  Loader2,
  Map as MapIcon,
  RefreshCw,
  Search,
  Target,
  ShieldAlert,
} from "lucide-react";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBuildingsSnapshot } from "@/hooks/useBuildings";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { BuildingPrototype } from "@/types/ipc";

type SortKey =
  | "name"
  | "containers"
  | "points"
  | "placements"
  | "usages"
  | "values";

export function BuildingsPage() {
  const active = useProfileStore((s) => s.active);
  const snapshot = useBuildingsSnapshot();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [usageFilter, setUsageFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");

  const prototypes = snapshot.data?.data.prototypes ?? [];

  const knownUsages = useMemo(() => {
    const s = new Set<string>();
    prototypes.forEach((p) => p.usages.forEach((u) => s.add(u)));
    return Array.from(s).sort();
  }, [prototypes]);

  const knownTiers = useMemo(() => {
    const s = new Set<string>();
    prototypes.forEach((p) => p.values.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [prototypes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = prototypes.filter((p) => {
      if (usageFilter !== "all" && !p.usages.includes(usageFilter)) return false;
      if (tierFilter !== "all" && !p.values.includes(tierFilter)) return false;
      if (q) {
        const hay = `${p.name} ${p.categories.join(" ")} ${p.tags.join(" ")} ${p.usages.join(" ")} ${p.values.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = list.slice();
    sorted.sort((a, b) => {
      switch (sort) {
        case "containers":
          return b.containerCount - a.containerCount;
        case "points":
          return b.pointCount - a.pointCount;
        case "placements":
          return b.placementCount - a.placementCount;
        case "usages":
          return b.usages.length - a.usages.length;
        case "values":
          return b.values.length - a.values.length;
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [prototypes, search, usageFilter, tierFilter, sort]);

  const usageCounts = useMemo(() => {
    const m = new Map<string, number>();
    prototypes.forEach((p) =>
      p.usages.forEach((u) => m.set(u, (m.get(u) ?? 0) + 1)),
    );
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [prototypes]);

  const tierCounts = useMemo(() => {
    const m = new Map<string, number>();
    prototypes.forEach((p) =>
      p.values.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)),
    );
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [prototypes]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a profile to view buildings.
      </div>
    );
  }

  if (snapshot.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading mapgroupproto.xml…
      </div>
    );
  }

  if (snapshot.isError) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 break-words">
            <div className="font-mono text-xs">
              {errorMessage(snapshot.error)}
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void snapshot.refetch()}
              >
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = snapshot.data!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Building2}
        title="Buildings"
        description="mapgroupproto.xml — which building prototypes hold loot, how many loot points each has, and which usage zones / tiers they cover. Vanilla Chernarus lives inside the map PBO — edit only if you've extracted a copy into the mission."
        badges={
          <>
            <Badge variant="outline" className="text-[10px]">
              read-only
            </Badge>
            {data.missingFile ? (
              <Badge
                variant="outline"
                className="border-severity-warning/40 text-severity-warning"
              >
                file not extracted
              </Badge>
            ) : null}
          </>
        }
        path={data.missingFile ? undefined : data.fileDisplay}
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const usage = usageFilter !== "all" ? usageFilter : null;
                const qs = usage
                  ? `?layer=building-placements&usage=${encodeURIComponent(usage)}`
                  : "?layer=building-placements";
                navigate(`/app/map${qs}`);
              }}
              disabled={data.missingPosFile}
              title={
                data.missingPosFile
                  ? "mapgrouppos.xml not extracted — no placements to show"
                  : "Open the map with the building-placements layer on"
              }
            >
              <MapIcon className="mr-1.5 h-3.5 w-3.5" /> Show on map
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void snapshot.refetch()}
              disabled={snapshot.isFetching}
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 h-3.5 w-3.5",
                  snapshot.isFetching && "animate-spin",
                )}
              />
              Refresh
            </Button>
          </>
        }
      />

      <BuildingsExplainer />

      {data.missingFile ? (
        <div className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="ml-2 text-xs">
              <p>
                No <code>mapgroupproto.xml</code> found in the mission
                root. That's normal for vanilla servers — the file
                lives inside the map PBO (e.g.{" "}
                <code>dta/dayz_chernarusplus.pbo</code>) and CE loads
                it from there at runtime.
              </p>
              <p className="mt-2">
                To customise loot distribution, extract the file from
                the map PBO (PBO Manager / Mikero Tools) and drop it
                into <code>mpmissions/&lt;your mission&gt;/</code>.
                Once it's there the server will prefer the override,
                and this page will populate on the next Refresh.
              </p>
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <>
          <SummaryStrip
            prototypes={prototypes.length}
            containers={data.totalContainers}
            points={data.totalPoints}
            placements={data.data.totalPlacements}
            missingPosFile={data.missingPosFile}
            posFileDisplay={data.posFileDisplay}
            unknownGroups={data.data.unknownPlacementGroups}
          />

          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 text-xs">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search prototype / category / tag"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-72 pl-7 text-xs"
              />
            </div>
            <Select value={usageFilter} onValueChange={setUsageFilter}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All usages</SelectItem>
                {knownUsages.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                {knownTiers.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortKey)}
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: name</SelectItem>
                <SelectItem value="containers">Sort: containers ↓</SelectItem>
                <SelectItem value="points">Sort: loot points ↓</SelectItem>
                <SelectItem value="placements">Sort: placements ↓</SelectItem>
                <SelectItem value="usages">Sort: usage count ↓</SelectItem>
                <SelectItem value="values">Sort: tier count ↓</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-muted-foreground">
              {filtered.length} of {prototypes.length} prototype
              {prototypes.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[1fr_280px] gap-4 overflow-hidden px-6 py-4">
            <div className="min-h-0 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
                  No prototypes match the current filter.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[1fr_70px_70px_80px_1fr_120px] gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Prototype</span>
                    <span className="text-right">Containers</span>
                    <span className="text-right">Points</span>
                    <span className="text-right">Placements</span>
                    <span>Usage</span>
                    <span>Tier</span>
                  </div>
                  {filtered.map((p) => (
                    <PrototypeRow
                      key={p.name}
                      proto={p}
                      onOpenUsage={(name) =>
                        navigate(`/app/items?usage=${encodeURIComponent(name)}`)
                      }
                      onOpenTier={(name) =>
                        navigate(`/app/items?value=${encodeURIComponent(name)}`)
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            <aside className="min-h-0 overflow-y-auto rounded-md border border-border/50 bg-muted/10 p-3">
              <SidePanel
                title="Prototypes by usage zone"
                icon={<Target className="h-3.5 w-3.5" />}
                entries={usageCounts}
                onClick={(name) =>
                  navigate(`/app/items?usage=${encodeURIComponent(name)}`)
                }
              />
              <SidePanel
                title="Prototypes by tier"
                icon={<ShieldAlert className="h-3.5 w-3.5" />}
                entries={tierCounts}
                onClick={(name) =>
                  navigate(`/app/items?value=${encodeURIComponent(name)}`)
                }
              />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Prototype row ----------

function PrototypeRow({
  proto,
  onOpenUsage,
  onOpenTier,
}: {
  proto: BuildingPrototype;
  onOpenUsage: (name: string) => void;
  onOpenTier: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_70px_70px_80px_1fr_120px] items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 text-xs">
      <code className="truncate font-mono">{proto.name}</code>
      <span className="text-right tabular-nums text-muted-foreground">
        {proto.containerCount}
      </span>
      <span className="text-right tabular-nums text-muted-foreground">
        {proto.pointCount}
      </span>
      <span
        className={cn(
          "text-right tabular-nums",
          proto.placementCount === 0
            ? "text-muted-foreground/50 italic"
            : "text-muted-foreground",
        )}
        title={
          proto.placementCount === 0
            ? "Not placed on the map (or mapgrouppos.xml not extracted)"
            : `${proto.placementCount} placement${proto.placementCount === 1 ? "" : "s"} on the map`
        }
      >
        {proto.placementCount}
      </span>
      <div className="flex flex-wrap gap-1 overflow-hidden">
        {proto.usages.slice(0, 5).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onOpenUsage(u)}
            className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] hover:border-primary/40 hover:text-primary"
          >
            {u}
          </button>
        ))}
        {proto.usages.length > 5 ? (
          <span className="text-[10px] text-muted-foreground">
            +{proto.usages.length - 5}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {proto.values.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onOpenTier(v)}
            className="rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] hover:border-primary/40 hover:text-primary"
          >
            {v.replace("Tier", "T")}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Summary strip ----------

function SummaryStrip({
  prototypes,
  containers,
  points,
  placements,
  missingPosFile,
  posFileDisplay,
  unknownGroups,
}: {
  prototypes: number;
  containers: number;
  points: number;
  placements: number;
  missingPosFile: boolean;
  posFileDisplay: string;
  unknownGroups: string[];
}) {
  return (
    <div className="space-y-3 border-b border-border/60 px-6 py-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Stat
          icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          label="Prototypes"
          value={prototypes}
        />
        <Stat
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
          label="Loot containers"
          value={containers}
        />
        <Stat
          icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
          label="Loot points"
          value={points}
          hint="total <point> entries across every container"
        />
        <Stat
          icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          label="Placements on map"
          value={placements}
          hint={
            missingPosFile
              ? "mapgrouppos.xml not extracted"
              : "from mapgrouppos.xml"
          }
        />
      </div>

      {missingPosFile ? (
        <div className="rounded-md border border-severity-warning/40 bg-severity-warning/5 p-3 text-xs">
          <strong className="text-severity-warning">
            Placement counts are zero
          </strong>{" "}
          because <code>mapgrouppos.xml</code> isn't in the mission
          folder (checked{" "}
          <code>{posFileDisplay}</code>). Extract it from the map
          PBO alongside <code>mapgroupproto.xml</code> to see how
          many times each prototype is placed on the map.
        </div>
      ) : unknownGroups.length > 0 ? (
        <div className="rounded-md border border-severity-info/40 bg-severity-info/5 p-3 text-xs">
          <strong className="text-severity-info">
            {unknownGroups.length} placement group
            {unknownGroups.length === 1 ? "" : "s"} unmatched
          </strong>{" "}
          — names in <code>mapgrouppos.xml</code> that don't resolve
          to any prototype in <code>mapgroupproto.xml</code>. Usually
          mod-added buildings whose prototype lives in a mod PBO and
          isn't extracted. Examples:{" "}
          <code>{unknownGroups.slice(0, 4).join(", ")}</code>
          {unknownGroups.length > 4 ? ` +${unknownGroups.length - 4}` : ""}.
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-card p-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">
          {value.toLocaleString()}
        </div>
        {hint ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}

// ---------- Side panel (usage / tier breakdown) ----------

function SidePanel({
  title,
  icon,
  entries,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  entries: { name: string; count: number }[];
  onClick: (name: string) => void;
}) {
  const max = entries[0]?.count ?? 0;
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[11px] italic text-muted-foreground">
          None found.
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => (
            <button
              key={e.name}
              type="button"
              onClick={() => onClick(e.name)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="truncate font-mono">{e.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {e.count}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{
                    width: `${max > 0 ? Math.min(100, (e.count / max) * 100) : 0}%`,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Explainer ----------

function BuildingsExplainer() {
  return (
    <Explainer
      title="How mapgroupproto.xml works"
      subtitle={<>defines which building prototypes CE spawns loot in.</>}
      storageKey="dzcm.buildings.explainer.open"
    >
      <p>
        <strong className="text-foreground">What this file is.</strong>{" "}
        Each <code>&lt;group name="Land_…"&gt;</code> describes one
        Enfusion building class and lists its internal loot
        containers. Each container has a list of{" "}
        <code>&lt;point pos="x y z"/&gt;</code> positions plus
        filters — categories, tags, usage zones, tiers — that
        decide which items can spawn there.
      </p>
      <p>
        <strong className="text-foreground">What drives loot.</strong>{" "}
        CE picks loot by matching the item's{" "}
        <code>usage</code> / <code>value</code> / <code>category</code>
        /<code>tag</code> flags against each container's filters.
        An item that has no matching container anywhere on the map
        can't spawn through the normal CE loop (events /
        cfgspawnabletypes can still place it).
      </p>
      <p>
        <strong className="text-foreground">Why "read-only".</strong>{" "}
        This page is a diagnostic viewer in Phase 8a —
        structurally editing a 10MB+ XML with tens of thousands
        of <code>&lt;point&gt;</code> elements is a dedicated
        workflow that's coming in a later phase. Use the tool
        today to understand coverage; hand-edit the XML when you
        need to change filter assignments.
      </p>
      <p>
        <strong className="text-foreground">Cross-navigation.</strong>{" "}
        Click any usage or tier chip on a row to open the Items
        page filtered to everything that can land there.
      </p>
      <p className="italic">
        Coming in 8b / 8c:{" "}
        <code>mapgrouppos.xml</code> parse (where each building
        sits on the map) + a tier coverage heatmap rendered on
        the Leaflet canvas.
      </p>
    </Explainer>
  );
}
