import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  EyeOff,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Target,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { useLocation, useNavigate } from "react-router-dom";
import type { SortingState } from "@tanstack/react-table";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEventsSnapshot } from "@/hooks/useEvents";
import { cn, errorMessage } from "@/lib/utils";
import type { DynamicEvent } from "@/types/ipc";

import { EventDetailDrawer } from "./EventDetailDrawer";
import { EventsTable } from "./EventsTable";
import { OriginFilter, useOriginFilter } from "@/features/ce/OriginFilter";

/** Starter event — sensible defaults the operator can tune before
 *  saving. `fixed + active: 1 + restock: 0` is the shape you want
 *  for a one-off world-spawned event; change `position` to "random"
 *  for loot-table events. Source is marked custom so the backend
 *  writes it to custom/events_custom.xml. */
const BLANK_EVENT: DynamicEvent = {
  name: "",
  nominal: 1,
  min: 1,
  max: 1,
  lifetime: 3600,
  restock: 0,
  saferadius: 500,
  distanceradius: 500,
  cleanupradius: 500,
  secondary: null,
  flags: { deletable: 0, init_random: 0, remove_damaged: 1 },
  position: "fixed",
  limit: "mixed",
  active: 1,
  children: [],
  childrenEx: [],
  source: "custom",
  modId: null,
  file: "",
};

export function EventsPage() {
  const snapshot = useEventsSnapshot();
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState({
    vanilla: true,
    mod: true,
    custom: true,
  });
  const [onlyFixed, setOnlyFixed] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "name", desc: false },
  ]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // When set, the drawer opens in create mode with this as the
  // starter event. Separate from `selectedName` so the two flows
  // don't stomp each other — finishing a Create won't re-open the
  // last-edited event.
  const [newDraft, setNewDraft] = useState<DynamicEvent | null>(null);

  // Deep-link: /app/events?name=EVENT opens the drawer for that event.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qName = params.get("name");
    if (qName) setSelectedName(qName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const events = snapshot.data?.events ?? [];
  const spawns = snapshot.data?.spawns ?? [];

  const filteredByPanel = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!sourceFilter[e.source]) return false;
      if (onlyFixed && e.position !== "fixed") return false;
      if (onlyActive && e.active === 0) return false;
      if (needle && !e.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [events, search, sourceFilter, onlyFixed, onlyActive]);
  // Origin filter narrows further by mod folder + XML file. Same
  // pattern as ItemsPage: panel filters first, origin filter
  // second, so the chip counts reflect the panel-narrowed view.
  const origin = useOriginFilter({
    records: filteredByPanel,
    paramPrefix: "e",
  });
  const filtered = origin.filtered;

  const selectedEvent = useMemo(
    () => events.find((e) => e.name === selectedName) ?? null,
    [events, selectedName],
  );
  const selectedSpawns = useMemo(
    () =>
      selectedName
        ? spawns.find((g) => g.eventName === selectedName) ?? null
        : null,
    [spawns, selectedName],
  );

  const errorCount =
    snapshot.data?.validation.filter((v) => v.severity === "error").length ?? 0;
  const warningCount =
    snapshot.data?.validation.filter((v) => v.severity === "warning").length ?? 0;

  if (snapshot.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
      </div>
    );
  }

  if (snapshot.isError) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 break-words">
            <div className="font-mono text-xs">{errorMessage(snapshot.error)}</div>
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={() => void snapshot.refetch()}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Target}
        title="Events"
        description={`${events.length} event${events.length === 1 ? "" : "s"} · ${spawns.length} spawn group${
          spawns.length === 1 ? "" : "s"
        } from ${snapshot.data?.files.length ?? 0} file${
          snapshot.data?.files.length === 1 ? "" : "s"
        }`}
        badges={
          errorCount + warningCount > 0 ? (
            <>
              {errorCount > 0 ? (
                <Badge
                  variant="outline"
                  className="border-severity-error/40 text-severity-error"
                >
                  {errorCount} error{errorCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
              {warningCount > 0 ? (
                <Badge
                  variant="outline"
                  className="border-severity-warning/40 text-severity-warning"
                >
                  {warningCount} warning{warningCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </>
          ) : (
            <Badge
              variant="outline"
              className="border-severity-success/40 text-severity-success"
            >
              <Info className="mr-1 h-3 w-3" /> clean
            </Badge>
          )
        }
        actions={
          <>
            <Button
              size="sm"
              onClick={() => setNewDraft({ ...BLANK_EVENT })}
              title="Create a new event in custom/events_custom.xml. Hook children + positions from the drawer."
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New event
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/app/ignorelist")}
              title="Classes listed in cfgignorelist.xml are skipped by CE at load time — useful to suppress an event's child without deleting the ref."
            >
              <EyeOff className="mr-1.5 h-3.5 w-3.5" /> CE ignore list →
            </Button>
            <Button
              variant="ghost"
              size="sm"
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

      <div className="flex items-center gap-3 border-b border-border/60 bg-card/30 px-6 py-2 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="filter by event name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 pl-7"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["vanilla", "mod", "custom"] as const).map((src) => (
            <label key={src} className="flex items-center gap-1.5">
              <Checkbox
                checked={sourceFilter[src]}
                onCheckedChange={(v) =>
                  setSourceFilter({ ...sourceFilter, [src]: v === true })
                }
              />
              <span className="capitalize">{src}</span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={onlyFixed}
            onCheckedChange={(v) => setOnlyFixed(v === true)}
          />
          <span>Fixed only</span>
        </label>
        <label className="flex items-center gap-1.5">
          <Checkbox
            checked={onlyActive}
            onCheckedChange={(v) => setOnlyActive(v === true)}
          />
          <span>Active only</span>
        </label>
        <span className="ml-auto text-muted-foreground">
          {filtered.length} / {events.length}
        </span>
      </div>

      {origin.origins.length > 1 ? (
        <div className="border-b border-border/40 bg-card/30 px-3 py-2">
          <OriginFilter records={filteredByPanel} paramPrefix="e" />
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <EventsTable
          events={filtered}
          spawns={spawns}
          selectedName={selectedName}
          onSelect={setSelectedName}
          sorting={sorting}
          onSortingChange={setSorting}
        />
      </div>

      <EventDetailDrawer
        open={selectedEvent !== null || newDraft !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (newDraft !== null) {
              setNewDraft(null);
            } else {
              setSelectedName(null);
              if (location.search) {
                navigate(location.pathname, { replace: true });
              }
            }
          }
        }}
        event={newDraft ?? selectedEvent}
        spawns={newDraft !== null ? null : selectedSpawns}
        knownClassnames={snapshot.data?.knownClassnames ?? []}
        isNew={newDraft !== null}
      />
    </div>
  );
}
