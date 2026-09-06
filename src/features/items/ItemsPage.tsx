import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckSquare,
  Info,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  PowerOff,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { SortingState } from "@tanstack/react-table";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import {
  useItemsSnapshot,
  useItemsDelete,
  useItemsDisable,
} from "@/hooks/useItems";
import { errorMessage } from "@/lib/utils";
import { AddItemWizard } from "@/features/items/AddItemWizard";
import { BulkEditDialog } from "@/features/items/BulkEditDialog";
import { CeImportDialog } from "@/features/items/CeImportDialog";
import { CeImportsManagerDialog } from "@/features/items/CeImportsManagerDialog";
import { applyFilters, DEFAULT_FILTERS } from "@/features/items/filters";
import { ItemDetailDrawer } from "@/features/items/ItemDetailDrawer";
import { ItemsFiltersPanel } from "@/features/items/ItemsFiltersPanel";
import { ItemsTable } from "@/features/items/ItemsTable";
import { OriginFilter, useOriginFilter } from "@/features/ce/OriginFilter";

export function ItemsPage() {
  const snapshot = useItemsSnapshot();
  const navigate = useNavigate();
  const location = useLocation();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);

  // Bulk-select mode: classnames flagged for bulk ops. Kept as a Set
  // keyed on classname so selection survives filter / sort changes.
  // An `active` flag toggles the selection column + bar visibility.
  const [bulkActive, setBulkActive] = useState(false);
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(() => new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<null | "disable" | "delete">(
    null,
  );

  const bulkDelete = useItemsDelete();
  const bulkDisable = useItemsDisable();

  const items = snapshot.data?.items ?? [];
  const filteredByPanel = useMemo(
    () => applyFilters(items, filters),
    [items, filters],
  );
  // Origin filter sits AFTER the existing usage / category panel
  // so the mod chip counts reflect the panel-narrowed view rather
  // than the global record set — matches operator intuition that
  // "filter by Tier4 + select Expansion" should show Expansion's
  // Tier4 count, not Expansion's all-tier count.
  const origin = useOriginFilter({
    records: filteredByPanel,
    paramPrefix: "i",
  });
  const filtered = origin.filtered;

  // Deep-link handling. Supported query parameters:
  //   ?name=CLASS        — opens that item's detail drawer
  //   ?category=NAME     — pre-filters the list by category
  //   ?usage=NAME        — pre-filters by usage flag
  //   ?value=NAME        — pre-filters by value / tier flag
  //   ?tag=NAME          — pre-filters by tag
  // Used by Zones & Tiers (impact badges), Linked In panels, and any
  // other cross-page drill-down. Filter params drop any prior filter
  // on the same dimension but leave other filters and the search box
  // alone so the user can layer further.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const qName = params.get("name");
    if (qName) setSelectedName(qName);

    const qCategory = params.get("category");
    const qUsage = params.get("usage");
    const qValue = params.get("value");
    const qTag = params.get("tag");
    if (qCategory || qUsage || qValue || qTag) {
      setFilters((prev) => ({
        ...prev,
        category: qCategory ?? prev.category,
        usage: qUsage ?? prev.usage,
        value: qValue ?? prev.value,
        tag: qTag ?? prev.tag,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (selectedName && !items.some((i) => i.name === selectedName)) {
      setSelectedName(null);
    }
  }, [items, selectedName]);

  // Prune selected classnames that no longer exist (e.g. after a
  // refetch that dropped some mod items).
  useEffect(() => {
    if (bulkSelection.size === 0) return;
    setBulkSelection((prev) => {
      let changed = false;
      const next = new Set<string>();
      const present = new Set(items.map((i) => i.name));
      prev.forEach((n) => {
        if (present.has(n)) next.add(n);
        else changed = true;
      });
      return changed ? next : prev;
    });
  }, [items, bulkSelection]);

  const selectedItems = useMemo(
    () => items.filter((i) => bulkSelection.has(i.name)),
    [items, bulkSelection],
  );

  const toggleBulkMode = () => {
    setBulkActive((a) => {
      if (a) setBulkSelection(new Set());
      return !a;
    });
  };

  const toggleOne = (name: string) => {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleFilteredAll = (allAlready: boolean) => {
    setBulkSelection((prev) => {
      const next = new Set(prev);
      if (allAlready) {
        filtered.forEach((it) => next.delete(it.name));
      } else {
        filtered.forEach((it) => next.add(it.name));
      }
      return next;
    });
  };

  const runBulkDisable = () => {
    if (bulkSelection.size === 0) return;
    bulkDisable.mutate(Array.from(bulkSelection), {
      onSuccess: () => {
        toast.success(
          `Disabled ${bulkSelection.size} item${bulkSelection.size === 1 ? "" : "s"}`,
          { description: "Nominal + min zeroed. Custom override written." },
        );
        setBulkConfirm(null);
        setBulkSelection(new Set());
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const runBulkDelete = () => {
    if (bulkSelection.size === 0) return;
    bulkDelete.mutate(Array.from(bulkSelection), {
      onSuccess: () => {
        toast.success(
          `Removed override${bulkSelection.size === 1 ? "" : "s"} for ${bulkSelection.size} item${bulkSelection.size === 1 ? "" : "s"}`,
          {
            description:
              "Vanilla items revert to upstream values; custom-only items are gone.",
          },
        );
        setBulkConfirm(null);
        setBulkSelection(new Set());
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const selected = useMemo(
    () => items.find((i) => i.name === selectedName) ?? null,
    [items, selectedName],
  );

  const errorCount = snapshot.data?.validation.filter((v) => v.severity === "error").length ?? 0;
  const warningCount = snapshot.data?.validation.filter((v) => v.severity === "warning").length ?? 0;

  if (snapshot.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading items…
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
        icon={Boxes}
        title="Types"
        description={`${snapshot.data?.files.length ?? 0} file${
          snapshot.data?.files.length === 1 ? "" : "s"
        } · ${items.length} effective type${items.length === 1 ? "" : "s"}`}
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
              variant={bulkActive ? "default" : "ghost"}
              size="sm"
              onClick={toggleBulkMode}
              title={
                bulkActive
                  ? "Exit bulk select"
                  : "Enter bulk select — multi-select items for bulk edit / disable / delete"
              }
            >
              {bulkActive ? (
                <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Square className="mr-1.5 h-3.5 w-3.5" />
              )}
              {bulkActive ? "Selecting" : "Bulk select"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void snapshot.refetch()}
              disabled={snapshot.isFetching}
            >
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${snapshot.isFetching ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <PackagePlus className="mr-1.5 h-3.5 w-3.5" /> Import mod files
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setManagerOpen(true)}
              title="List and remove registered CE files / mods"
            >
              <Package className="mr-1.5 h-3.5 w-3.5" /> Manage
            </Button>
            <Button size="sm" onClick={() => setWizardOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add item
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        <ItemsFiltersPanel
          value={filters}
          onChange={setFilters}
          categories={snapshot.data?.categories ?? []}
          usages={snapshot.data?.usages ?? []}
          values={snapshot.data?.values ?? []}
          tags={snapshot.data?.tags ?? []}
          totalCount={items.length}
          filteredCount={filtered.length}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {origin.origins.length > 1 ? (
            <div className="border-b border-border/40 bg-card/30 px-4 py-2">
              <OriginFilter records={filteredByPanel} paramPrefix="i" />
            </div>
          ) : null}
          <ItemsTable
            items={filtered}
            selectedName={selectedName}
            onSelect={setSelectedName}
            sorting={sorting}
            onSortingChange={setSorting}
            bulkSelection={bulkActive ? bulkSelection : undefined}
            onBulkToggle={bulkActive ? toggleOne : undefined}
            onBulkToggleAll={bulkActive ? toggleFilteredAll : undefined}
          />
          {bulkActive && bulkSelection.size > 0 ? (
            <div className="flex items-center gap-2 border-t border-border/60 bg-card px-4 py-2 text-xs">
              <Badge variant="outline" className="border-primary/40 text-primary">
                {bulkSelection.size} selected
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setBulkSelection(new Set())}
              >
                <X className="mr-1.5 h-3.5 w-3.5" /> Clear
              </Button>
              <span className="text-muted-foreground">·</span>
              <Button
                size="sm"
                variant="secondary"
                className="h-7"
                onClick={() => setBulkEditOpen(true)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Bulk edit…
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setBulkConfirm("disable")}
                title="Zero out nominal + min for every selected item"
              >
                <PowerOff className="mr-1.5 h-3.5 w-3.5" /> Disable
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-destructive hover:text-destructive"
                onClick={() => setBulkConfirm("delete")}
                title="Remove custom overrides; vanilla items revert to upstream"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove override
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        selection={selectedItems}
        categories={snapshot.data?.categories ?? []}
        usages={snapshot.data?.usages ?? []}
        values={snapshot.data?.values ?? []}
        tags={snapshot.data?.tags ?? []}
        onDone={() => setBulkSelection(new Set())}
      />

      <AlertDialog
        open={bulkConfirm !== null}
        onOpenChange={(o) => !o && setBulkConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkConfirm === "disable"
                ? `Disable ${bulkSelection.size} item${bulkSelection.size === 1 ? "" : "s"}?`
                : `Remove override for ${bulkSelection.size} item${bulkSelection.size === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {bulkConfirm === "disable" ? (
                <>
                  Sets <code>nominal=0</code> and <code>min=0</code> on
                  every selected item via a custom override. CE will
                  stop spawning them. Revertible with Bulk edit.
                </>
              ) : (
                <>
                  Removes the custom override entries. Vanilla items
                  snap back to upstream values; items that exist only
                  as customs disappear entirely. Irreversible from the
                  UI — restore from git if you need the old override
                  back.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={
                bulkConfirm === "disable" ? runBulkDisable : runBulkDelete
              }
              className={
                bulkConfirm === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {bulkConfirm === "disable"
                ? bulkDisable.isPending
                  ? "Disabling…"
                  : "Disable"
                : bulkDelete.isPending
                  ? "Removing…"
                  : "Remove override"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ItemDetailDrawer
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedName(null);
            if (location.search) {
              navigate(location.pathname, { replace: true });
            }
          }
        }}
        item={selected}
        snapshot={snapshot.data}
        onCloned={(name) => setSelectedName(name)}
        onSelectItem={(name) => setSelectedName(name)}
      />

      <AddItemWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        snapshot={snapshot.data}
        onCreated={(name) => setSelectedName(name)}
      />

      <CeImportDialog open={importOpen} onOpenChange={setImportOpen} />

      <CeImportsManagerDialog
        open={managerOpen}
        onOpenChange={setManagerOpen}
      />
    </div>
  );
}
