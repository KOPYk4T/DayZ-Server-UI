import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Box,
  Info,
  Layers,
  Loader2,
  Package,
  PackageSearch,
  RefreshCw,
  Search,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useLoadoutsSnapshot } from "@/hooks/useLoadouts";
import { useLocation, useNavigate } from "react-router-dom";
import { cn, errorMessage } from "@/lib/utils";
import type { PresetKind } from "@/types/ipc";

import { LoadoutsExplainer } from "./LoadoutsExplainer";
import { PresetDetailDrawer } from "./PresetDetailDrawer";
import { PresetsList, SpawnablesList } from "./LoadoutsTables";
import { SpawnableDetailDrawer } from "./SpawnableDetailDrawer";
import { OriginFilter, useOriginFilter } from "@/features/ce/OriginFilter";

export function LoadoutsPage() {
  const snapshot = useLoadoutsSnapshot();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<"spawnables" | "presets">("spawnables");
  const [spawnableSearch, setSpawnableSearch] = useState("");
  const [presetSearch, setPresetSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState({
    vanilla: true,
    mod: true,
    custom: true,
  });
  const [presetKindFilter, setPresetKindFilter] = useState<"all" | PresetKind>(
    "all",
  );
  const [selectedSpawnable, setSelectedSpawnable] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Support deep-linking: /app/loadouts?tab=spawnables&name=AK101 lands here
  // with the matching drawer open (used by Events children → Spawnable nav).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qTab = params.get("tab");
    const qName = params.get("name");
    if (qTab === "presets" || qTab === "spawnables") {
      setTab(qTab);
    }
    if (qName) {
      if (qTab === "presets") setSelectedPreset(qName);
      else setSelectedSpawnable(qName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const spawnables = snapshot.data?.spawnables ?? [];
  const presets = snapshot.data?.presets ?? [];

  const spawnablesByPanel = useMemo(() => {
    const needle = spawnableSearch.trim().toLowerCase();
    return spawnables.filter((s) => {
      if (!sourceFilter[s.source]) return false;
      if (needle && !s.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [spawnables, spawnableSearch, sourceFilter]);

  const presetsByPanel = useMemo(() => {
    const needle = presetSearch.trim().toLowerCase();
    return presets.filter((p) => {
      if (!sourceFilter[p.source]) return false;
      if (presetKindFilter !== "all" && p.kind !== presetKindFilter)
        return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [presets, presetSearch, sourceFilter, presetKindFilter]);

  // Per-tab origin filters — separate URL prefixes so the
  // Spawnables and Presets tabs can keep independent selections.
  const spawnableOrigin = useOriginFilter({
    records: spawnablesByPanel,
    paramPrefix: "sp",
  });
  const presetOrigin = useOriginFilter({
    records: presetsByPanel,
    paramPrefix: "rp",
  });
  const filteredSpawnables = spawnableOrigin.filtered;
  const filteredPresets = presetOrigin.filtered;

  const errorCount =
    snapshot.data?.validation.filter((v) => v.severity === "error").length ?? 0;
  const warningCount =
    snapshot.data?.validation.filter((v) => v.severity === "warning").length ??
    0;

  const selectedSpawnableObj = useMemo(
    () => spawnables.find((s) => s.name === selectedSpawnable) ?? null,
    [spawnables, selectedSpawnable],
  );
  const selectedPresetObj = useMemo(
    () => presets.find((p) => p.name === selectedPreset) ?? null,
    [presets, selectedPreset],
  );

  if (snapshot.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading spawnables…
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={PackageSearch}
        title="Spawnables"
        description={`${spawnables.length} spawnable${
          spawnables.length === 1 ? "" : "s"
        } · ${presets.length} preset${presets.length === 1 ? "" : "s"} from ${
          snapshot.data?.files.length ?? 0
        } file${snapshot.data?.files.length === 1 ? "" : "s"}`}
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
        }
      />

      <LoadoutsExplainer />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = v as "spawnables" | "presets";
          setTab(next);
          // Drop any deep-link once the user navigates by hand.
          if (location.search) navigate(location.pathname, { replace: true });
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-6 mt-3 w-fit">
          <TabsTrigger value="spawnables">
            <Package className="mr-1.5 h-3.5 w-3.5" /> Spawnables (
            {spawnables.length})
          </TabsTrigger>
          <TabsTrigger value="presets">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Random presets (
            {presets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="spawnables"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex items-center gap-3 border-y border-border/60 bg-card/30 px-6 py-2 text-xs">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="filter by parent classname"
                value={spawnableSearch}
                onChange={(e) => setSpawnableSearch(e.target.value)}
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
            <span className="ml-auto text-muted-foreground">
              {filteredSpawnables.length} / {spawnables.length}
            </span>
          </div>
          {spawnableOrigin.origins.length > 1 ? (
            <div className="border-b border-border/40 bg-card/20 px-6 py-2">
              <OriginFilter
                records={spawnablesByPanel}
                paramPrefix="sp"
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <SpawnablesList
              items={filteredSpawnables}
              selectedName={selectedSpawnable}
              onSelect={setSelectedSpawnable}
            />
          </div>
        </TabsContent>

        <TabsContent value="presets" className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-y border-border/60 bg-card/30 px-6 py-2 text-xs">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="filter by preset name"
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
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
            <div className="flex items-center gap-1 text-[11px]">
              {(["all", "cargo", "attachments"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPresetKindFilter(k)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-0.5",
                    presetKindFilter === k
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "cargo" ? (
                    <Box className="h-3 w-3" />
                  ) : k === "attachments" ? (
                    <Layers className="h-3 w-3" />
                  ) : null}
                  <span className="capitalize">{k}</span>
                </button>
              ))}
            </div>
            <span className="ml-auto text-muted-foreground">
              {filteredPresets.length} / {presets.length}
            </span>
          </div>
          {presetOrigin.origins.length > 1 ? (
            <div className="border-b border-border/40 bg-card/20 px-6 py-2">
              <OriginFilter records={presetsByPanel} paramPrefix="rp" />
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
            <PresetsList
              items={filteredPresets}
              selectedName={selectedPreset}
              onSelect={setSelectedPreset}
            />
          </div>
        </TabsContent>
      </Tabs>

      <SpawnableDetailDrawer
        open={selectedSpawnableObj !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedSpawnable(null);
        }}
        spawnable={selectedSpawnableObj}
        knownClassnames={snapshot.data?.knownClassnames ?? []}
        presetNamesAttachments={snapshot.data?.presetNamesAttachments ?? []}
        presetNamesCargo={snapshot.data?.presetNamesCargo ?? []}
      />

      <PresetDetailDrawer
        open={selectedPresetObj !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPreset(null);
        }}
        preset={selectedPresetObj}
        knownClassnames={snapshot.data?.knownClassnames ?? []}
      />
    </div>
  );
}
