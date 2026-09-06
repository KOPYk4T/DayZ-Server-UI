import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  Compass,
  GitCommit,
  Home,
  Info,
  Loader2,
  Map as MapIcon,
  Plug,
  ShieldAlert,
  Target,
  XCircle,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { computeBalanceStats } from "@/features/health/balance";
import { useEventsSnapshot } from "@/hooks/useEvents";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useLimitsSnapshot } from "@/hooks/useLimits";
import { useLoadoutsSnapshot } from "@/hooks/useLoadouts";
import { useLocalDiff, useWorkspaceStatus } from "@/hooks/useProfiles";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  DynamicEvent,
  EventSpawnGroup,
  ItemSource,
  ItemType,
  RandomPreset,
  SpawnableType,
} from "@/types/ipc";

export function DashboardPage() {
  const profile = useProfileStore((s) => s.active);
  const navigate = useNavigate();

  const items = useItemsSnapshot();
  const events = useEventsSnapshot();
  const loadouts = useLoadoutsSnapshot();
  const limits = useLimitsSnapshot();
  const status = useWorkspaceStatus(profile?.id ?? null);
  const localDiff = useLocalDiff(profile?.id ?? null);
  const unsaved =
    (localDiff.data?.addedCount ?? 0) +
    (localDiff.data?.modifiedCount ?? 0) +
    (localDiff.data?.deletedCount ?? 0);

  const itemsLoading = items.isLoading;
  const stats = useMemo(() => buildStats(items.data?.items ?? []), [items.data]);
  const eventStats = useMemo(
    () =>
      buildEventStats(
        events.data?.events ?? [],
        events.data?.spawns ?? [],
      ),
    [events.data],
  );
  const loadoutStats = useMemo(
    () =>
      buildLoadoutStats(
        loadouts.data?.spawnables ?? [],
        loadouts.data?.presets ?? [],
      ),
    [loadouts.data],
  );
  const balance = useMemo(
    () => computeBalanceStats(items.data?.items ?? []),
    [items.data],
  );
  const healthCounts = useMemo(() => {
    const all = [
      ...(items.data?.validation ?? []),
      ...(events.data?.validation ?? []),
      ...(loadouts.data?.validation ?? []),
    ];
    return {
      e: all.filter((i) => i.severity === "error").length,
      w: all.filter((i) => i.severity === "warning").length,
      i: all.filter((i) => i.severity === "info").length,
      total: all.length,
    };
  }, [items.data, events.data, loadouts.data]);

  const orphanCount = useMemo(() => {
    const imp = limits.data?.impact;
    if (!imp) return 0;
    return (
      imp.orphanCategories.length +
      imp.orphanTags.length +
      imp.orphanUsageflags.length +
      imp.orphanValueflags.length
    );
  }, [limits.data]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Home}
        title="Home"
        description={
          profile
            ? `Working on ${profile.name}.`
            : "No profile loaded — go back to the profile picker."
        }
      />
      <div className="space-y-6 overflow-y-auto p-6">

      {/* Quick actions — one click to the most common operations */}
      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4" /> Quick actions
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => navigate("/app/getting-started")}
          >
            <Compass className="mr-1 h-3 w-3" /> Getting started →
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <QuickAction
              icon={<ArrowDownToLine className="h-4 w-4" />}
              label="Pull"
              hint="refresh from server"
              onClick={() => navigate("/app/sync")}
            />
            <QuickAction
              icon={<ArrowUpFromLine className="h-4 w-4" />}
              label="Review push"
              hint={
                unsaved > 0
                  ? `${unsaved} unsaved`
                  : "no local changes yet"
              }
              onClick={() => navigate("/app/sync")}
              emphasise={unsaved > 0}
            />
            <QuickAction
              icon={<Boxes className="h-4 w-4" />}
              label="Types"
              hint={`${items.data?.items.length?.toLocaleString() ?? "—"} classes`}
              onClick={() => navigate("/app/items")}
            />
            <QuickAction
              icon={<Target className="h-4 w-4" />}
              label="Events"
              hint={`${events.data?.events.length ?? "—"} events`}
              onClick={() => navigate("/app/events")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Profile status cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          icon={<Plug className="h-4 w-4" />}
          label="Mode"
          value={profile?.mode.toUpperCase() ?? "—"}
          hint={
            profile?.mode === "sftp"
              ? `${profile.sftp?.username}@${profile.sftp?.host}`
              : (profile?.local?.rootPath ?? "")
          }
        />
        <StatCard
          icon={<GitCommit className="h-4 w-4" />}
          label="Last pull"
          value={formatRelativeTime(
            status.data?.lastPullAt ?? profile?.lastPullAt ?? undefined,
          )}
          hint={profile?.paths.mpmissionsRelative ?? ""}
        />
        <StatCard
          icon={<ArrowUpFromLine className="h-4 w-4" />}
          label="Unsaved"
          value={
            localDiff.isFetching && !localDiff.data
              ? "…"
              : `${unsaved}`
          }
          hint={unsaved > 0 ? "files vs last pull" : "workspace clean"}
        />
        <StatCard
          icon={<MapIcon className="h-4 w-4" />}
          label="Map"
          value={profile?.map ?? "—"}
          hint={profile?.customMapId ?? ""}
        />
      </div>

      {/* Health + orphans summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <HealthCard
          icon={<XCircle className="h-4 w-4 text-severity-error" />}
          label="Errors"
          value={healthCounts.e}
          onClick={() => navigate("/app/health")}
          emphasise={healthCounts.e > 0}
        />
        <HealthCard
          icon={<AlertTriangle className="h-4 w-4 text-severity-warning" />}
          label="Warnings"
          value={healthCounts.w}
          onClick={() => navigate("/app/health")}
          emphasise={healthCounts.w > 0}
        />
        <HealthCard
          icon={<Info className="h-4 w-4 text-severity-info" />}
          label="Info"
          value={healthCounts.i}
          onClick={() => navigate("/app/health")}
        />
        <HealthCard
          icon={<ShieldAlert className="h-4 w-4 text-muted-foreground" />}
          label="Orphan limit refs"
          value={orphanCount}
          onClick={() => navigate("/app/zones-tiers")}
          emphasise={orphanCount > 0}
          hint="Names used on items but not declared in cfglimitsdefinition"
        />
      </div>

      {/* Economy snapshot */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Economy snapshot</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => navigate("/app/items")}
          >
            Open Items →
          </Button>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <LoadingLine />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <SourceBreakdown stats={stats} />
              <TopList
                title="Top categories"
                icon={<Boxes className="h-3.5 w-3.5" />}
                entries={stats.topCategories}
                onClickEntry={(name) =>
                  navigate(`/app/items?category=${encodeURIComponent(name)}`)
                }
              />
              <TopList
                title="Top usage zones"
                icon={<Target className="h-3.5 w-3.5" />}
                entries={stats.topUsages}
                onClickEntry={(name) =>
                  navigate(`/app/items?usage=${encodeURIComponent(name)}`)
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Balance — spawn coverage</CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={() => navigate("/app/health")}
          >
            View balance lints →
          </Button>
        </CardHeader>
        <CardContent>
          {itemsLoading ? (
            <LoadingLine />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <TopList
                  title="Nominal by usage zone"
                  icon={<Target className="h-3.5 w-3.5" />}
                  entries={balance.byUsage
                    .slice(0, 8)
                    .map((e) => ({ name: e.name, count: e.total }))}
                  onClickEntry={(name) =>
                    navigate(`/app/items?usage=${encodeURIComponent(name)}`)
                  }
                />
                <TopList
                  title="Nominal by tier (value)"
                  icon={<ShieldAlert className="h-3.5 w-3.5" />}
                  entries={balance.byTier
                    .slice(0, 8)
                    .map((e) => ({ name: e.name, count: e.total }))}
                  onClickEntry={(name) =>
                    navigate(`/app/items?value=${encodeURIComponent(name)}`)
                  }
                />
              </div>
              {balance.neverSpawnCount > 0 ? (
                <div className="rounded-md border border-severity-warning/40 bg-severity-warning/5 p-3 text-xs">
                  <strong className="text-severity-warning">
                    {balance.neverSpawnCount}
                  </strong>{" "}
                  item{balance.neverSpawnCount === 1 ? "" : "s"} with{" "}
                  <code>nominal &gt; 0</code> but no usage zone — CE will
                  not place them through the normal loot loop.{" "}
                  <button
                    type="button"
                    onClick={() => navigate("/app/health?domain=balance")}
                    className="underline hover:text-foreground"
                  >
                    Review in Health →
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events + Loadouts summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Events</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => navigate("/app/events")}
            >
              Open →
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.isLoading ? (
              <LoadingLine />
            ) : (
              <>
                <TwoCol
                  left={`${eventStats.total} total`}
                  right={`${eventStats.active} active`}
                />
                <TwoCol
                  left={`${eventStats.fixed} fixed-position`}
                  right={`${eventStats.random} random-position`}
                />
                <TwoCol
                  left={`${eventStats.scriptPlaced} script-placed`}
                  right={`${eventStats.totalSpawnPositions} positions`}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Loadouts</CardTitle>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px]"
              onClick={() => navigate("/app/loadouts")}
            >
              Open →
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadouts.isLoading ? (
              <LoadingLine />
            ) : (
              <>
                <TwoCol
                  left={`${loadoutStats.spawnables} spawnables`}
                  right={`${loadoutStats.presets} random presets`}
                />
                <TwoCol
                  left={`${loadoutStats.hoarders} hoarders`}
                  right={`${loadoutStats.withAttachments} with attachments`}
                />
                <TwoCol
                  left={`${loadoutStats.withCargo} with cargo`}
                  right={`${loadoutStats.totalReferences} item references`}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      </div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  hint,
  onClick,
  emphasise,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  emphasise?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-md border border-border/60 bg-card p-3 text-left transition-colors hover:border-border hover:bg-muted/40",
        emphasise && "ring-1 ring-primary/50",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </span>
      {hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </button>
  );
}

// ---------- Stats helpers ----------

interface ItemsStats {
  total: number;
  bySource: Record<ItemSource, number>;
  totalNominal: number;
  withZeroNominal: number;
  topCategories: { name: string; count: number }[];
  topUsages: { name: string; count: number }[];
}

function buildStats(items: ItemType[]): ItemsStats {
  const bySource: Record<ItemSource, number> = {
    vanilla: 0,
    mod: 0,
    custom: 0,
  };
  let totalNominal = 0;
  let withZeroNominal = 0;
  const catCount = new Map<string, number>();
  const usageCount = new Map<string, number>();
  items.forEach((it) => {
    bySource[it.source]++;
    totalNominal += it.nominal;
    if (it.nominal === 0) withZeroNominal++;
    if (it.category) {
      catCount.set(it.category, (catCount.get(it.category) ?? 0) + 1);
    }
    it.usage.forEach((u) => {
      usageCount.set(u, (usageCount.get(u) ?? 0) + 1);
    });
  });
  return {
    total: items.length,
    bySource,
    totalNominal,
    withZeroNominal,
    topCategories: toTopList(catCount, 6),
    topUsages: toTopList(usageCount, 6),
  };
}

function toTopList(
  map: Map<string, number>,
  n: number,
): { name: string; count: number }[] {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, n);
}

interface EventStats {
  total: number;
  active: number;
  fixed: number;
  random: number;
  scriptPlaced: number;
  totalSpawnPositions: number;
}

function buildEventStats(
  events: DynamicEvent[],
  spawns: EventSpawnGroup[],
): EventStats {
  let active = 0;
  let fixed = 0;
  let random = 0;
  let scriptPlaced = 0;
  events.forEach((e) => {
    if (e.active > 0) active++;
    if (e.position === "fixed") fixed++;
    else random++;
    if (e.limit === "custom") scriptPlaced++;
  });
  const totalSpawnPositions = spawns.reduce(
    (acc, g) => acc + g.positions.length,
    0,
  );
  return { total: events.length, active, fixed, random, scriptPlaced, totalSpawnPositions };
}

interface LoadoutStats {
  spawnables: number;
  presets: number;
  hoarders: number;
  withAttachments: number;
  withCargo: number;
  totalReferences: number;
}

function buildLoadoutStats(
  spawnables: SpawnableType[],
  presets: RandomPreset[],
): LoadoutStats {
  let hoarders = 0;
  let withAttachments = 0;
  let withCargo = 0;
  let totalReferences = 0;
  spawnables.forEach((s) => {
    if (s.hoarder) hoarders++;
    if (s.attachments.length > 0) withAttachments++;
    if (s.cargo.length > 0) withCargo++;
    s.attachments.forEach((a) => (totalReferences += a.items.length));
    s.cargo.forEach((c) => (totalReferences += c.items.length));
  });
  presets.forEach((p) => (totalReferences += p.items.length));
  return {
    spawnables: spawnables.length,
    presets: presets.length,
    hoarders,
    withAttachments,
    withCargo,
    totalReferences,
  };
}

// ---------- Small components ----------

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-xl font-medium tabular-nums">{value}</div>
        {hint ? (
          <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function HealthCard({
  icon,
  label,
  value,
  hint,
  onClick,
  emphasise,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
  onClick: () => void;
  emphasise?: boolean;
}) {
  const zero = value === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-md border border-border/60 bg-card p-3 text-left transition-colors hover:bg-muted/30",
        emphasise && "ring-1 ring-severity-warning/40",
      )}
    >
      <div className="mt-0.5">
        {zero && !emphasise ? (
          <CheckCircle2 className="h-4 w-4 text-severity-success" />
        ) : (
          icon
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint ? (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
        ) : null}
      </div>
    </button>
  );
}

function SourceBreakdown({ stats }: { stats: ItemsStats }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Boxes className="h-3.5 w-3.5" />
        <span>Items</span>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {stats.total.toLocaleString()}
        </span>
      </div>
      <BarRow
        label="Vanilla"
        value={stats.bySource.vanilla}
        total={stats.total}
        color="var(--brand-cream-dim)"
      />
      <BarRow
        label="Mod"
        value={stats.bySource.mod}
        total={stats.total}
        color="var(--brand-olive-light)"
      />
      <BarRow
        label="Custom"
        value={stats.bySource.custom}
        total={stats.total}
        color="var(--brand-rust)"
      />
      <div className="pt-2 text-[11px] text-muted-foreground">
        Total nominal:{" "}
        <span className="tabular-nums text-foreground">
          {stats.totalNominal.toLocaleString()}
        </span>
        {stats.withZeroNominal > 0 ? (
          <>
            {" · "}
            <span className="text-severity-warning">
              {stats.withZeroNominal.toLocaleString()} with nominal=0
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function TopList({
  title,
  icon,
  entries,
  onClickEntry,
}: {
  title: string;
  icon: React.ReactNode;
  entries: { name: string; count: number }[];
  onClickEntry: (name: string) => void;
}) {
  const max = entries[0]?.count ?? 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">None yet.</div>
      ) : (
        entries.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => onClickEntry(e.name)}
            className="w-full text-left"
          >
            <BarRow
              label={e.name}
              value={e.count}
              total={max}
              color="var(--brand-olive-mid)"
            />
          </button>
        ))
      )}
    </div>
  );
}

function BarRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="truncate font-mono">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, pct)}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

function TwoCol({ left, right }: { left: string; right: string }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm">
      <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 tabular-nums">
        {left}
      </div>
      <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1 tabular-nums">
        {right}
      </div>
    </div>
  );
}

function LoadingLine() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
    </div>
  );
}
