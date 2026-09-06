import { useMemo, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Circle,
  CircleOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/InfoTooltip";
import { OriginChip } from "@/features/ce/OriginChip";
import { cn } from "@/lib/utils";
import type { DynamicEvent, EventSpawnGroup } from "@/types/ipc";

import { EVENT_FIELDS } from "./glossary";

interface ColSpec {
  id: string;
  header: React.ReactNode;
  width: number;
  accessor?: keyof DynamicEvent;
  render: (e: DynamicEvent, positionsCount: number) => React.ReactNode;
  enableSorting?: boolean;
}

interface Props {
  events: DynamicEvent[];
  spawns: EventSpawnGroup[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
}

export function EventsTable({
  events,
  spawns,
  selectedName,
  onSelect,
  sorting,
  onSortingChange,
}: Props) {
  const positionsByEvent = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of spawns) m.set(g.eventName, g.positions.length);
    return m;
  }, [spawns]);

  const specs = useMemo<ColSpec[]>(
    () => [
      {
        id: "name",
        accessor: "name",
        width: 260,
        header: <Hdr label="Name" fieldKey="name" />,
        render: (e) => <span className="truncate font-mono text-xs">{e.name}</span>,
      },
      {
        id: "active",
        accessor: "active",
        width: 56,
        header: <Hdr label="On" fieldKey="active" />,
        render: (e) =>
          e.active > 0 ? (
            <Circle className="h-3 w-3 fill-severity-success text-severity-success" />
          ) : (
            <CircleOff className="h-3 w-3 text-muted-foreground" />
          ),
      },
      {
        id: "nominal",
        accessor: "nominal",
        width: 64,
        header: <Hdr label="Nom" fieldKey="nominal" />,
        render: (e) => <span className="tabular-nums">{e.nominal}</span>,
      },
      {
        id: "min",
        accessor: "min",
        width: 56,
        header: <Hdr label="Min" fieldKey="min" />,
        render: (e) => <span className="tabular-nums">{e.min}</span>,
      },
      {
        id: "max",
        accessor: "max",
        width: 56,
        header: <Hdr label="Max" fieldKey="max" />,
        render: (e) => <span className="tabular-nums">{e.max}</span>,
      },
      {
        id: "lifetime",
        accessor: "lifetime",
        width: 92,
        header: <Hdr label="Lifetime" fieldKey="lifetime" />,
        render: (e) => <span className="tabular-nums">{e.lifetime}</span>,
      },
      {
        id: "position",
        accessor: "position",
        width: 80,
        header: <Hdr label="Mode" fieldKey="position" />,
        render: (e) => (
          <Badge
            variant="outline"
            className={cn(
              "px-1.5 py-0 text-[10px] uppercase",
              e.position === "fixed"
                ? "text-severity-info"
                : "text-muted-foreground",
            )}
          >
            {e.position}
          </Badge>
        ),
      },
      {
        id: "children",
        width: 80,
        enableSorting: false,
        header: <Hdr label="Children" fieldKey="children" />,
        render: (e) => (
          <span className="tabular-nums">
            {e.children.length +
              (e.childrenEx?.length ?? 0)}
          </span>
        ),
      },
      {
        id: "positions",
        width: 80,
        enableSorting: false,
        header: <Hdr label="Positions" fieldKey="positions" />,
        render: (e, positionsCount) => {
          // limit="custom" events are script-placed (infected
          // territories, animal zones, mod spawners). They don't use
          // cfgeventspawns, so 0 positions is normal. Show a neutral
          // em-dash just like random-position events.
          if (e.position !== "fixed" || e.limit === "custom") {
            return (
              <span
                className="text-muted-foreground"
                title={
                  e.limit === "custom"
                    ? "custom-limit event — placement is script-handled, cfgeventspawns is not used"
                    : undefined
                }
              >
                —
              </span>
            );
          }
          return (
            <span
              className={cn(
                "tabular-nums",
                positionsCount === 0 && "text-severity-warning",
              )}
              title={
                positionsCount === 0
                  ? "no positions in cfgeventspawns.xml — event won't spawn"
                  : undefined
              }
            >
              {positionsCount}
            </span>
          );
        },
      },
      {
        id: "source",
        accessor: "source",
        width: 150,
        header: "Origin",
        // OriginChip renders the actual mod folder name (or
        // Vanilla / Custom). Replaces the previous single-letter
        // Src badge so cross-mod rows are easy to scan.
        render: (e) => <OriginChip record={e} />,
      },
    ],
    [],
  );

  const columns = useMemo<ColumnDef<DynamicEvent>[]>(
    () =>
      specs.map((spec) => ({
        id: spec.id,
        accessorKey: spec.accessor as string | undefined,
        size: spec.width,
        header: () => spec.header,
        cell: ({ row }) =>
          spec.render(row.original, positionsByEvent.get(row.original.name) ?? 0),
        enableSorting: spec.enableSorting ?? true,
      })),
    [specs, positionsByEvent],
  );

  const table = useReactTable({
    data: events,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      onSortingChange(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  const totalWidth = specs.reduce((acc, s) => acc + s.width, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="sticky top-0 z-10 flex border-b border-border bg-card"
        style={{ width: totalWidth, minWidth: "100%" }}
      >
        {table.getHeaderGroups()[0]?.headers.map((header) => {
          const sortable = header.column.getCanSort();
          const sorted = header.column.getIsSorted();
          return (
            <div
              key={header.id}
              onClick={
                sortable ? header.column.getToggleSortingHandler() : undefined
              }
              style={{ width: header.column.getSize() }}
              className={cn(
                "flex h-8 items-center gap-1.5 px-3 text-[11px] font-medium text-muted-foreground",
                sortable && "cursor-pointer select-none hover:text-foreground",
              )}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
              {sortable ? (
                sorted === "asc" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : sorted === "desc" ? (
                  <ArrowDown className="h-3 w-3" />
                ) : (
                  <ArrowUpDown className="h-3 w-3 opacity-30" />
                )
              ) : null}
            </div>
          );
        })}
      </div>

      <div ref={parentRef} className="relative min-h-0 flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: totalWidth,
            minWidth: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const isSelected = row.original.name === selectedName;
            return (
              <div
                key={row.id}
                onClick={() => onSelect(row.original.name)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  "flex cursor-pointer border-b border-border/60 text-xs hover:bg-accent/40",
                  isSelected && "bg-accent/60 hover:bg-accent/60",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="flex min-w-0 items-center px-3"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            No events match the current filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Hdr({ label, fieldKey }: { label: string; fieldKey: string }) {
  const def = EVENT_FIELDS[fieldKey];
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {def ? (
        <InfoTooltip tagline={def.tagline} side="bottom">
          {def.description}
        </InfoTooltip>
      ) : null}
    </span>
  );
}
