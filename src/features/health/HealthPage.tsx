import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from "lucide-react";

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
import { useEventsSnapshot } from "@/hooks/useEvents";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useLimitsSnapshot } from "@/hooks/useLimits";
import { useLoadoutsSnapshot } from "@/hooks/useLoadouts";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { Issue, IssueSeverity } from "@/types/ipc";

import { computeBalanceIssues } from "./balance";

// ---------- Types ----------

type Domain =
  | "items"
  | "events"
  | "spawnables"
  | "presets"
  | "balance"
  | "other";

interface AugmentedIssue extends Issue {
  domain: Domain;
}

const DOMAIN_META: Record<
  Domain,
  { label: string; className: string }
> = {
  items: { label: "Types", className: "text-brand-rust" },
  events: { label: "Events", className: "text-brand-olive-light" },
  spawnables: {
    label: "Spawnables · Types",
    className: "text-brand-cream",
  },
  presets: {
    label: "Spawnables · Presets",
    className: "text-brand-cream-dim",
  },
  balance: {
    label: "Balance",
    className: "text-brand-olive-mid",
  },
  other: { label: "Other", className: "text-muted-foreground" },
};

// ---------- Page ----------

export function HealthPage() {
  const activeProfile = useProfileStore((s) => s.active);
  const navigate = useNavigate();
  const location = useLocation();

  const items = useItemsSnapshot();
  const events = useEventsSnapshot();
  const loadouts = useLoadoutsSnapshot();
  const limits = useLimitsSnapshot();

  const loading =
    items.isLoading ||
    events.isLoading ||
    loadouts.isLoading ||
    limits.isLoading;
  const anyError =
    items.isError || events.isError || loadouts.isError || limits.isError;

  const refetchAll = () => {
    void items.refetch();
    void events.refetch();
    void loadouts.refetch();
    void limits.refetch();
  };

  const issues = useMemo(
    () => aggregate(items, events, loadouts),
    [items.data, events.data, loadouts.data],
  );

  const [severity, setSeverity] = useState<"all" | IssueSeverity>("all");
  const [domain, setDomain] = useState<"all" | Domain>("all");
  const [fileFilter, setFileFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Deep-link: ?domain=balance (from Dashboard Balance card) pre-filters
  // the issues table to just balance lints.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const d = params.get("domain");
    if (
      d === "items" ||
      d === "events" ||
      d === "spawnables" ||
      d === "presets" ||
      d === "balance" ||
      d === "other"
    ) {
      setDomain(d);
    }
    const s = params.get("severity");
    if (s === "error" || s === "warning" || s === "info") {
      setSeverity(s);
    }
  }, [location.search]);

  const filesAvailable = useMemo(
    () => Array.from(new Set(issues.map((i) => i.file))).sort(),
    [issues],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i) => {
      if (severity !== "all" && i.severity !== severity) return false;
      if (domain !== "all" && i.domain !== domain) return false;
      if (fileFilter !== "all" && i.file !== fileFilter) return false;
      if (q) {
        const hay = `${i.code} ${i.message} ${i.entity ?? ""} ${i.file}`
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, severity, domain, fileFilter, search]);

  const counts = useMemo(() => {
    const byDomain: Record<Domain, { e: number; w: number; i: number }> = {
      items: { e: 0, w: 0, i: 0 },
      events: { e: 0, w: 0, i: 0 },
      spawnables: { e: 0, w: 0, i: 0 },
      presets: { e: 0, w: 0, i: 0 },
      balance: { e: 0, w: 0, i: 0 },
      other: { e: 0, w: 0, i: 0 },
    };
    let totalE = 0;
    let totalW = 0;
    let totalI = 0;
    issues.forEach((x) => {
      const bucket = byDomain[x.domain];
      if (x.severity === "error") {
        bucket.e++;
        totalE++;
      } else if (x.severity === "warning") {
        bucket.w++;
        totalW++;
      } else {
        bucket.i++;
        totalI++;
      }
    });
    return { byDomain, totalE, totalW, totalI, total: issues.length };
  }, [issues]);

  const goToIssue = (i: AugmentedIssue) => {
    if (!i.entity) return;
    const name = encodeURIComponent(i.entity);
    switch (i.domain) {
      case "items":
      case "balance":
        // Balance issues all reference item classnames.
        navigate(`/app/items?name=${name}`);
        break;
      case "events":
        navigate(`/app/events?name=${name}`);
        break;
      case "spawnables":
        navigate(`/app/loadouts?tab=spawnables&name=${name}`);
        break;
      case "presets":
        navigate(`/app/loadouts?tab=presets&name=${name}`);
        break;
      default:
        break;
    }
  };

  if (!activeProfile) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a profile to run health checks.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Activity}
        title="Health"
        description="Cross-file validation across Items, Events, Loadouts, and Zones & Tiers. Click any row with an entity to jump to its editor."
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={refetchAll}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Re-run checks
          </Button>
        }
      />

      {anyError ? (
        <Alert className="mx-6 mt-3">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 text-xs">
            One or more validation sources failed to load. Partial
            results shown below.
          </AlertDescription>
        </Alert>
      ) : null}

      <SummaryStrip counts={counts} onJumpSeverity={(s) => setSeverity(s)} />

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3 text-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search code / message / entity"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-64 pl-7 text-xs"
          />
        </div>
        <FilterSelect
          value={severity}
          onChange={(v) => setSeverity(v as "all" | IssueSeverity)}
          label="Severity"
          options={[
            { value: "all", label: "All severities" },
            { value: "error", label: "Errors" },
            { value: "warning", label: "Warnings" },
            { value: "info", label: "Info" },
          ]}
        />
        <FilterSelect
          value={domain}
          onChange={(v) => setDomain(v as "all" | Domain)}
          label="Domain"
          options={[
            { value: "all", label: "All domains" },
            { value: "items", label: "Types" },
            { value: "events", label: "Events" },
            { value: "spawnables", label: "Spawnables" },
            { value: "presets", label: "Random presets" },
            { value: "balance", label: "Balance (frontend lint)" },
            { value: "other", label: "Other" },
          ]}
        />
        <FilterSelect
          value={fileFilter}
          onChange={setFileFilter}
          label="File"
          options={[
            { value: "all", label: "All files" },
            ...filesAvailable.map((f) => ({ value: f, label: f || "(unknown)" })),
          ]}
        />
        <span className="ml-auto text-muted-foreground">
          {filtered.length} of {issues.length} issue
          {issues.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && issues.length === 0 ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Running checks…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            anyIssues={issues.length > 0}
            anyErrors={
              (items.error && errorMessage(items.error)) ||
              (events.error && errorMessage(events.error)) ||
              (loadouts.error && errorMessage(loadouts.error)) ||
              (limits.error && errorMessage(limits.error)) ||
              null
            }
          />
        ) : (
          <IssuesTable issues={filtered} onJump={goToIssue} />
        )}
      </div>
    </div>
  );
}

// ---------- Summary strip ----------

function SummaryStrip({
  counts,
  onJumpSeverity,
}: {
  counts: {
    byDomain: Record<Domain, { e: number; w: number; i: number }>;
    totalE: number;
    totalW: number;
    totalI: number;
    total: number;
  };
  onJumpSeverity: (sev: "all" | IssueSeverity) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border/60 px-6 py-4 md:grid-cols-4">
      <SummaryCard
        icon={<XCircle className="h-4 w-4 text-severity-error" />}
        label="Errors"
        value={counts.totalE}
        onClick={() => onJumpSeverity("error")}
        emphasis={counts.totalE > 0}
      />
      <SummaryCard
        icon={<AlertTriangle className="h-4 w-4 text-severity-warning" />}
        label="Warnings"
        value={counts.totalW}
        onClick={() => onJumpSeverity("warning")}
        emphasis={counts.totalW > 0}
      />
      <SummaryCard
        icon={<Info className="h-4 w-4 text-severity-info" />}
        label="Info"
        value={counts.totalI}
        onClick={() => onJumpSeverity("info")}
      />
      <SummaryCard
        icon={
          counts.total === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-severity-success" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          )
        }
        label={counts.total === 0 ? "All clear" : "Total issues"}
        value={counts.total}
        onClick={() => onJumpSeverity("all")}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  onClick,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border/60 bg-card p-3 text-left text-sm transition-colors hover:bg-muted/30",
        emphasis && "ring-1 ring-severity-warning/40",
      )}
    >
      <div className="shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </div>
    </button>
  );
}

// ---------- Issues table ----------

function IssuesTable({
  issues,
  onJump,
}: {
  issues: AugmentedIssue[];
  onJump: (i: AugmentedIssue) => void;
}) {
  return (
    <div className="divide-y divide-border/50">
      {issues.map((i, idx) => (
        <IssueRow
          key={`${i.code}:${i.entity ?? ""}:${i.file}:${idx}`}
          issue={i}
          onJump={() => onJump(i)}
        />
      ))}
    </div>
  );
}

function IssueRow({
  issue,
  onJump,
}: {
  issue: AugmentedIssue;
  onJump: () => void;
}) {
  const sevIcon =
    issue.severity === "error" ? (
      <XCircle className="h-4 w-4 shrink-0 text-severity-error" />
    ) : issue.severity === "warning" ? (
      <AlertTriangle className="h-4 w-4 shrink-0 text-severity-warning" />
    ) : (
      <Info className="h-4 w-4 shrink-0 text-severity-info" />
    );
  const navigable = canNavigate(issue);
  return (
    <button
      type="button"
      onClick={navigable ? onJump : undefined}
      disabled={!navigable}
      className={cn(
        "flex w-full items-start gap-3 px-6 py-2.5 text-left text-xs",
        navigable && "hover:bg-muted/30",
      )}
    >
      {sevIcon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("font-mono text-[10px]", DOMAIN_META[issue.domain].className)}
          >
            {DOMAIN_META[issue.domain].label}
          </Badge>
          <code className="text-[11px] text-muted-foreground">
            {issue.code}
          </code>
          {issue.entity ? (
            <code className="truncate text-[11px] text-foreground">
              {issue.entity}
            </code>
          ) : null}
        </div>
        <div className="mt-0.5 break-words text-foreground/90">
          {issue.message}
        </div>
        {issue.file ? (
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {issue.file}
          </div>
        ) : null}
      </div>
      {navigable ? (
        <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : null}
    </button>
  );
}

function canNavigate(issue: AugmentedIssue): boolean {
  if (!issue.entity) return false;
  return (
    issue.domain === "items" ||
    issue.domain === "events" ||
    issue.domain === "spawnables" ||
    issue.domain === "presets"
  );
}

// ---------- Filter helper ----------

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1">
      <Filter className="h-3 w-3 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ---------- Empty state ----------

function EmptyState({
  anyIssues,
  anyErrors,
}: {
  anyIssues: boolean;
  anyErrors: string | null;
}) {
  if (anyErrors) {
    return (
      <div className="mx-6 mt-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="ml-2 text-xs font-mono">
            {anyErrors}
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!anyIssues) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="h-8 w-8 text-severity-success" />
        <div>
          <strong className="text-foreground">All clear.</strong> No
          validation issues across Items, Events, Loadouts, or limits.
        </div>
      </div>
    );
  }
  return (
    <div className="py-16 text-center text-sm text-muted-foreground">
      No issues match the current filters.
    </div>
  );
}

// ---------- Aggregator ----------

function aggregate(
  items: { data?: { validation: Issue[]; items?: import("@/types/ipc").ItemType[] } },
  events: { data?: { validation: Issue[] } },
  loadouts: { data?: { validation: Issue[] } },
): AugmentedIssue[] {
  const out: AugmentedIssue[] = [];
  (items.data?.validation ?? []).forEach((i) =>
    out.push({ ...i, domain: classify(i.code) }),
  );
  (events.data?.validation ?? []).forEach((i) =>
    out.push({ ...i, domain: classify(i.code) }),
  );
  (loadouts.data?.validation ?? []).forEach((i) =>
    out.push({ ...i, domain: classify(i.code) }),
  );
  // Frontend-only balance lints on the items snapshot. Tagged with
  // the `balance` domain so users can filter them out if they only
  // care about schema-level problems.
  if (items.data?.items) {
    computeBalanceIssues(items.data.items).forEach((i) =>
      out.push({ ...i, domain: "balance" }),
    );
  }
  // Stable sort: errors first, then warnings, then info; within a
  // severity keep domain alphabetical for a clean deterministic view.
  out.sort((a, b) => {
    const sevRank = (s: IssueSeverity) =>
      s === "error" ? 0 : s === "warning" ? 1 : 2;
    const d = sevRank(a.severity) - sevRank(b.severity);
    if (d !== 0) return d;
    return a.domain.localeCompare(b.domain) || a.code.localeCompare(b.code);
  });
  return out;
}

function classify(code: string): Domain {
  const prefix = code.split(".")[0];
  if (prefix === "items") return "items";
  if (prefix === "events") return "events";
  if (prefix === "spawnables") return "spawnables";
  if (prefix === "presets") return "presets";
  if (prefix === "balance") return "balance";
  return "other";
}
