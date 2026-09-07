import { useMemo, type ComponentType, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Boxes,
  Compass,
  FileStack,
  HardDrive,
  Home,
  Loader2,
  MapPin,
  Package,
  Server,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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

  const remoteLabel =
    profile?.sftp
      ? `${profile.sftp.username}@${profile.sftp.host}`
      : null;
  const localLabel = status.data?.localServerPath
    ?? profile?.workDir
    ?? profile?.local?.rootPath
    ?? null;
  const lastImport = formatRelativeTime(
    status.data?.lastPullAt ?? profile?.lastPullAt ?? undefined,
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Home}
        title="Home"
        description={
          profile
            ? `Working on ${profile.name}.`
            : "No profile loaded. Open the profile picker."
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="space-y-4">
            <HomeBlock icon={MapPin} title="Places">
              <div className="space-y-2">
                <PlaceLine
                  icon={Server}
                  label="Remote"
                  value={remoteLabel ?? "not set"}
                  empty={!remoteLabel}
                />
                <PlaceLine
                  icon={HardDrive}
                  label="Local server"
                  value={localLabel ?? "not set"}
                  empty={!localLabel}
                />
              </div>
              {unsaved > 0 ? (
                <p className="type-body mt-3">
                  Workspace · {unsaved} file{unsaved === 1 ? "" : "s"} since
                  last import
                </p>
              ) : null}
              <p className="type-hint mt-3">
                {profile?.map ?? "—"}
                {profile?.paths.mpmissionsRelative
                  ? ` · ${profile.paths.mpmissionsRelative}`
                  : ""}
                {lastImport !== "never" ? ` · imported ${lastImport}` : ""}
              </p>
            </HomeBlock>

            <HomeBlock
              icon={Activity}
              title="Health"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/app/health")}
                >
                  Open Health
                </Button>
              }
            >
              <div className="flex flex-wrap gap-2">
                {healthCounts.e === 0 &&
                healthCounts.w === 0 &&
                orphanCount === 0 ? (
                  <span className="type-hint">No errors or warnings</span>
                ) : (
                  <>
                    <HealthCount
                      n={healthCounts.e}
                      label="errors"
                      tone={healthCounts.e > 0 ? "error" : "ok"}
                      onClick={() => navigate("/app/health")}
                    />
                    {healthCounts.w > 0 ? (
                      <HealthCount
                        n={healthCounts.w}
                        label="warnings"
                        tone="warning"
                        onClick={() => navigate("/app/health")}
                      />
                    ) : null}
                    {orphanCount > 0 ? (
                      <HealthCount
                        n={orphanCount}
                        label="orphan limits"
                        tone="warning"
                        onClick={() => navigate("/app/zones-tiers")}
                      />
                    ) : null}
                  </>
                )}
              </div>
            </HomeBlock>
          </div>

          <HomeBlock icon={ArrowRight} title="Next">
            <p className="type-hint mb-3">
              Copy the workspace to Local server, then send to production.
            </p>
            <Button
              className="w-full justify-start"
              onClick={() => navigate("/app/sync")}
            >
              <ArrowRight />
              Open Sync
            </Button>
          </HomeBlock>
        </div>

        <HomeBlock
          icon={Compass}
          title="Quick steps"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/app/getting-started")}
            >
              <Compass />
              Getting started
            </Button>
          }
        >
          <ol className="grid gap-6 sm:grid-cols-3">
            <Step
              n="1"
              title="Edit in the workspace"
              body="Types, events, loadouts. Nothing leaves this PC until you sync."
            />
            <Step
              n="2"
              title="Copy to Local server"
              body="Review the diff, copy it to the dedicated folder, restart the server."
            />
            <Step
              n="3"
              title="Send to production"
              body="After the local test looks right, upload the workspace over SFTP."
            />
          </ol>
        </HomeBlock>

        <HomeBlock
          icon={Boxes}
          title="Economy"
          hint="Classes in types.xml, by source and usage."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/app/items")}
            >
              <Package />
              Open Items
            </Button>
          }
        >
          {itemsLoading ? (
            <LoadingLine />
          ) : (
            <div className="grid gap-10 md:grid-cols-3">
              <SourceBreakdown stats={stats} />
              <TopList
                title="Categories"
                entries={stats.topCategories}
                onClickEntry={(name) =>
                  navigate(`/app/items?category=${encodeURIComponent(name)}`)
                }
              />
              <TopList
                title="Usage zones"
                entries={stats.topUsages}
                onClickEntry={(name) =>
                  navigate(`/app/items?usage=${encodeURIComponent(name)}`)
                }
              />
            </div>
          )}
        </HomeBlock>

        <HomeBlock
          icon={Target}
          title="Spawn coverage"
          hint="Nominal rolled up by zone and tier."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate("/app/health")}
            >
              <Activity />
              Open balance lints
            </Button>
          }
        >
          {itemsLoading ? (
            <LoadingLine />
          ) : (
            <div className="space-y-6">
              <div className="grid gap-10 md:grid-cols-2">
                <TopList
                  title="By usage zone"
                  entries={balance.byUsage
                    .slice(0, 8)
                    .map((e) => ({ name: e.name, count: e.total }))}
                  onClickEntry={(name) =>
                    navigate(`/app/items?usage=${encodeURIComponent(name)}`)
                  }
                />
                <TopList
                  title="By tier"
                  entries={balance.byTier
                    .slice(0, 8)
                    .map((e) => ({ name: e.name, count: e.total }))}
                  onClickEntry={(name) =>
                    navigate(`/app/items?value=${encodeURIComponent(name)}`)
                  }
                />
              </div>
              {balance.neverSpawnCount > 0 ? (
                <p className="type-body max-w-[65ch]">
                  <span className="text-severity-warning">
                    {balance.neverSpawnCount}
                  </span>{" "}
                  item{balance.neverSpawnCount === 1 ? "" : "s"} have nominal
                  above 0 and no usage zone. CE will not place them in the
                  loot loop.{" "}
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    onClick={() => navigate("/app/health?domain=balance")}
                  >
                    Review in Health
                  </Button>
                </p>
              ) : null}
            </div>
          )}
        </HomeBlock>

        <HomeBlock icon={FileStack} title="Mission files">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="type-section">Events</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/app/events")}
                >
                  Open Events
                </Button>
              </div>
              {events.isLoading ? (
                <LoadingLine />
              ) : (
                <PairList
                  rows={[
                    ["Total", eventStats.total],
                    ["Active", eventStats.active],
                    ["Fixed position", eventStats.fixed],
                    ["Random position", eventStats.random],
                    ["Script placed", eventStats.scriptPlaced],
                    ["Positions", eventStats.totalSpawnPositions],
                  ]}
                />
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="type-section">Loadouts</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/app/loadouts")}
                >
                  Open Loadouts
                </Button>
              </div>
              {loadouts.isLoading ? (
                <LoadingLine />
              ) : (
                <PairList
                  rows={[
                    ["Spawnables", loadoutStats.spawnables],
                    ["Random presets", loadoutStats.presets],
                    ["Hoarders", loadoutStats.hoarders],
                    ["With attachments", loadoutStats.withAttachments],
                    ["With cargo", loadoutStats.withCargo],
                    ["Item references", loadoutStats.totalReferences],
                  ]}
                />
              )}
            </div>
          </div>
        </HomeBlock>
      </div>
    </div>
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

function HomeBlock({
  icon: Icon,
  title,
  hint,
  action,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="type-block">{title}</CardTitle>
            {hint ? <CardDescription>{hint}</CardDescription> : null}
          </div>
        </div>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PlaceLine({
  icon: Icon,
  label,
  value,
  empty,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  empty?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="type-hint w-30 shrink-0">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate",
          empty ? "type-hint" : "type-mono text-foreground",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function Step({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li className="min-w-0">
      <span className="flex size-7 items-center justify-center rounded-md bg-muted type-mono text-foreground">
        {n}
      </span>
      <p className="type-section mt-3">{title}</p>
      <p className="type-hint mt-1.5 max-w-[36ch]">{body}</p>
    </li>
  );
}

function HealthCount({
  n,
  label,
  tone,
  onClick,
}: {
  n: number;
  label: string;
  tone: "error" | "warning" | "ok" | "muted";
  onClick?: () => void;
}) {
  const color =
    tone === "error"
      ? "text-severity-error"
      : tone === "warning"
        ? "text-severity-warning"
        : tone === "ok"
          ? "text-severity-success"
          : "text-foreground";
  const chip =
    tone === "error"
      ? "border-severity-error/30 bg-severity-error/10"
      : tone === "warning"
        ? "border-severity-warning/30 bg-severity-warning/10"
        : tone === "ok"
          ? "border-severity-success/30 bg-severity-success/10"
          : "border-border bg-muted/40";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-baseline gap-2 rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent",
        chip,
      )}
    >
      <span className={cn("text-lg font-semibold tabular-nums", color)}>{n}</span>
      <span className="type-hint">{label}</span>
    </button>
  );
}

function SourceBreakdown({ stats }: { stats: ItemsStats }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-section">Items</h3>
        <span className="type-mono tabular-nums">
          {stats.total.toLocaleString()}
        </span>
      </div>
      <BarRow label="Vanilla" value={stats.bySource.vanilla} total={stats.total} />
      <BarRow label="Mod" value={stats.bySource.mod} total={stats.total} />
      <BarRow label="Custom" value={stats.bySource.custom} total={stats.total} />
      <p className="type-hint pt-1">
        Nominal{" "}
        <span className="tabular-nums text-foreground">
          {stats.totalNominal.toLocaleString()}
        </span>
        {stats.withZeroNominal > 0 ? (
          <>
            {" · "}
            <span className="text-severity-warning">
              {stats.withZeroNominal.toLocaleString()} at 0
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function TopList({
  title,
  entries,
  onClickEntry,
}: {
  title: string;
  entries: { name: string; count: number }[];
  onClickEntry: (name: string) => void;
}) {
  const max = entries[0]?.count ?? 0;
  return (
    <div className="space-y-3">
      <h3 className="type-section">{title}</h3>
      {entries.length === 0 ? (
        <p className="type-hint">None yet.</p>
      ) : (
        entries.map((e) => (
          <button
            key={e.name}
            type="button"
            onClick={() => onClickEntry(e.name)}
            className="-mx-1 w-[calc(100%+0.5rem)] rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60"
          >
            <BarRow label={e.name} value={e.count} total={max} />
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
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="type-mono truncate">{label}</span>
        <span className="type-hint tabular-nums">{value.toLocaleString()}</span>
      </div>
      <div className="h-px w-full bg-border">
        <div
          className="h-px bg-foreground/50"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

function PairList({ rows }: { rows: [string, number][] }) {
  return (
    <dl className="space-y-1.5">
      {rows.map(([label, n]) => (
        <div key={label} className="flex items-baseline justify-between gap-4">
          <dt className="type-hint">{label}</dt>
          <dd className="tabular-nums text-sm">{n.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

function LoadingLine() {
  return (
    <div className="type-hint flex items-center gap-2">
      <Loader2 className="h-3 w-3 animate-spin" /> Loading
    </div>
  );
}
