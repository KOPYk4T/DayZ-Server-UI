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
import { ArrowDown, ArrowUp, ArrowUpDown, Image } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { InfoTooltip } from "@/components/InfoTooltip";
import { OriginChip } from "@/features/ce/OriginChip";
import { cn } from "@/lib/utils";
import type { ItemType } from "@/types/ipc";

import { WikiItemImage } from "@/features/wiki-images/WikiItemImage";

import { FIELDS } from "./glossary";
import { ItemLinkBadges } from "./ItemLinkedInPanel";
import { getItemLinkCounts } from "./linkedIn";
import { useItemLinkIndexes } from "./useItemLinks";

interface ColSpec {
  id: string;
  header: React.ReactNode;
  width: number;
  accessor?: keyof ItemType;
  render: (it: ItemType) => React.ReactNode;
  enableSorting?: boolean;
}

interface Props {
  items: ItemType[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  sorting: SortingState;
  onSortingChange: (next: SortingState) => void;
  /** Set of classnames currently selected for bulk operations. When
   *  omitted, the selection column is hidden (non-bulk mode). */
  bulkSelection?: ReadonlySet<string>;
  onBulkToggle?: (name: string) => void;
  /** Fired when the user clicks the header checkbox. `all` is true
   *  when every row on the current filter is already selected. */
  onBulkToggleAll?: (all: boolean) => void;
}

export function ItemsTable({
  items,
  selectedName,
  onSelect,
  sorting,
  onSortingChange,
  bulkSelection,
  onBulkToggle,
  onBulkToggleAll,
}: Props) {
  const { indexes: linkIndexes } = useItemLinkIndexes();
  const bulkEnabled = !!bulkSelection && !!onBulkToggle;
  const allSelected =
    bulkEnabled &&
    items.length > 0 &&
    items.every((it) => bulkSelection!.has(it.name));
  const someSelected =
    bulkEnabled &&
    !allSelected &&
    items.some((it) => bulkSelection!.has(it.name));
  const specs = useMemo<ColSpec[]>(
    () => [
      ...(bulkEnabled
        ? [
            {
              id: "__bulk__",
              width: 34,
              enableSorting: false,
              header: (
                <Checkbox
                  aria-label="Select all filtered"
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={() =>
                    onBulkToggleAll?.(allSelected)
                  }
                  onClick={(e) => e.stopPropagation()}
                />
              ),
              render: (it: ItemType) => (
                <Checkbox
                  checked={bulkSelection!.has(it.name)}
                  onCheckedChange={() => onBulkToggle!(it.name)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${it.name}`}
                />
              ),
            } satisfies ColSpec,
          ]
        : []),
      {
        id: "__art__",
        width: 40,
        enableSorting: false,
        header: (
          <Image
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-label="Inventory art"
          />
        ),
        render: (it: ItemType) => (
          <WikiItemImage classname={it.name} size="sm" />
        ),
      },
      {
        id: "name",
        accessor: "name",
        width: 240,
        header: (
          <HeaderLabel
            label="Classname"
            field="name"
            description={FIELDS.name.description}
            tagline={FIELDS.name.tagline}
          />
        ),
        render: (it) => (
          <span className="truncate font-mono text-xs">{it.name}</span>
        ),
      },
      {
        id: "source",
        accessor: "source",
        width: 150,
        header: (
          <HeaderLabel
            label="Origin"
            field="source"
            description={FIELDS.source.description}
            tagline={FIELDS.source.tagline}
          />
        ),
        // OriginChip renders the actual mod folder name (or
        // Vanilla / Custom) with a colour-coded tint and a hover
        // tooltip showing the exact file. Replaces the former
        // single-letter Src badge so operators can spot which mod
        // a record came from at a glance.
        render: (it) => <OriginChip record={it} />,
      },
      {
        id: "nominal",
        accessor: "nominal",
        width: 72,
        header: (
          <HeaderLabel
            label="Nom"
            field="nominal"
            description={FIELDS.nominal.description}
            tagline={FIELDS.nominal.tagline}
          />
        ),
        render: (it) => <span className="tabular-nums">{it.nominal}</span>,
      },
      {
        id: "min",
        accessor: "min",
        width: 64,
        header: (
          <HeaderLabel
            label="Min"
            field="min"
            description={FIELDS.min.description}
            tagline={FIELDS.min.tagline}
          />
        ),
        render: (it) => <span className="tabular-nums">{it.min}</span>,
      },
      {
        id: "lifetime",
        accessor: "lifetime",
        width: 96,
        header: (
          <HeaderLabel
            label="Lifetime"
            field="lifetime"
            description={FIELDS.lifetime.description}
            tagline={FIELDS.lifetime.tagline}
          />
        ),
        render: (it) => <span className="tabular-nums">{it.lifetime}</span>,
      },
      {
        id: "category",
        accessor: "category",
        width: 120,
        header: (
          <HeaderLabel
            label="Category"
            field="category"
            description={FIELDS.category.description}
            tagline={FIELDS.category.tagline}
          />
        ),
        render: (it) => <span className="truncate">{it.category ?? "—"}</span>,
      },
      {
        id: "usage",
        width: 200,
        enableSorting: false,
        header: (
          <HeaderLabel
            label="Usage"
            field="usage"
            description={FIELDS.usage.description}
            tagline={FIELDS.usage.tagline}
          />
        ),
        render: (it) => (
          <div className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
            {it.usage.slice(0, 3).map((u) => (
              <Badge
                key={u}
                variant="outline"
                className="h-4 px-1 text-[9px] font-normal"
              >
                {u}
              </Badge>
            ))}
            {it.usage.length > 3 ? (
              <span className="text-[9px] text-muted-foreground">
                +{it.usage.length - 3}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "value",
        width: 110,
        enableSorting: false,
        header: (
          <HeaderLabel
            label="Tier"
            field="value"
            description={FIELDS.value.description}
            tagline={FIELDS.value.tagline}
          />
        ),
        render: (it) => (
          <div className="flex flex-wrap gap-1">
            {it.value.map((v) => (
              <Badge
                key={v}
                variant="outline"
                className="h-4 px-1 text-[9px] font-normal"
              >
                {v.replace("Tier", "T")}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: "refs",
        width: 108,
        enableSorting: false,
        header: (
          <HeaderLabel
            label="Refs"
            field="__refs__"
            tagline="Where this item is referenced"
            description="Counts how many other configs mention this classname. Package icon = spawnable loadouts (has-own + used-in-others); target = dynamic events that list it as a child; box = random presets that include it in their pool. Click the row to open the Items drawer's 'Linked In' tab for detailed jump links."
          />
        ),
        render: (it) => (
          <ItemLinkBadges counts={getItemLinkCounts(linkIndexes, it.name)} />
        ),
      },
    ],
    [linkIndexes, bulkEnabled, allSelected, someSelected, bulkSelection, onBulkToggle, onBulkToggleAll],
  );

  const columns = useMemo<ColumnDef<ItemType>[]>(
    () =>
      specs.map((spec) => ({
        id: spec.id,
        accessorKey: spec.accessor as string | undefined,
        size: spec.width,
        header: () => spec.header,
        cell: ({ row }) => spec.render(row.original),
        enableSorting: spec.enableSorting ?? true,
      })),
    [specs],
  );

  const table = useReactTable({
    data: items,
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
      {/* Sticky header — same flex layout as body rows so columns line up. */}
      <div
        className="sticky top-0 z-10 flex border-b border-border bg-card"
        style={{ width: totalWidth, minWidth: "100%" }}
        role="row"
      >
                {table.getHeaderGroups()[0]?.headers.map((header) => {
          const sortable = header.column.getCanSort();
          const sorted = header.column.getIsSorted();
          const tight = header.id === "__art__";
          return (
            <div
              key={header.id}
              role="columnheader"
              onClick={
                sortable ? header.column.getToggleSortingHandler() : undefined
              }
              style={{ width: header.column.getSize() }}
              className={cn(
                "flex h-8 items-center gap-1.5 text-left text-[11px] font-medium text-muted-foreground",
                tight ? "justify-center px-1" : "px-3",
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

      {/* Virtualized body. Inherits column widths from the header. */}
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
                role="row"
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
                    role="cell"
                    style={{ width: cell.column.getSize() }}
                    className={cn(
                      "flex min-w-0 items-center",
                      cell.column.id === "__art__"
                        ? "justify-center px-1"
                        : "px-3",
                    )}
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
            No items match the current filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HeaderLabel({
  label,
  field,
  description,
  tagline,
}: {
  label: string;
  field: string;
  description: string;
  tagline?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1" data-field={field}>
      {label}
      <InfoTooltip tagline={tagline} side="bottom">
        {description}
      </InfoTooltip>
    </span>
  );
}
