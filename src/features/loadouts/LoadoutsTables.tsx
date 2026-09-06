import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Box, Layers, Package } from "lucide-react";

import { OriginChip } from "@/features/ce/OriginChip";
import { cn } from "@/lib/utils";
import type { RandomPreset, SpawnableType } from "@/types/ipc";

interface SpawnablesListProps {
  items: SpawnableType[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export function SpawnablesList({
  items,
  selectedName,
  onSelect,
}: SpawnablesListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  const cols = useMemo(
    () => [
      { key: "name", width: 320, label: "Classname" },
      { key: "source", width: 150, label: "Origin" },
      { key: "attachments", width: 100, label: "Atch grp" },
      { key: "cargo", width: 100, label: "Cargo grp" },
      { key: "total", width: 90, label: "Items" },
    ],
    [],
  );
  const totalWidth = cols.reduce((n, c) => n + c.width, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="sticky top-0 z-10 flex border-b border-border bg-card"
        style={{ width: totalWidth, minWidth: "100%" }}
      >
        {cols.map((c) => (
          <div
            key={c.key}
            style={{ width: c.width }}
            className="flex h-8 items-center px-3 text-[11px] font-medium text-muted-foreground"
          >
            {c.label}
          </div>
        ))}
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
          {virtualizer.getVirtualItems().map((vr) => {
            const s = items[vr.index];
            if (!s) return null;
            const totalItems =
              s.attachments.reduce((n, g) => n + g.items.length, 0) +
              s.cargo.reduce((n, g) => n + g.items.length, 0);
            const isSelected = s.name === selectedName;
            return (
              <div
                key={s.name}
                role="row"
                onClick={() => onSelect(s.name)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${vr.size}px`,
                  transform: `translateY(${vr.start}px)`,
                }}
                className={cn(
                  "flex cursor-pointer border-b border-border/60 text-xs hover:bg-accent/40",
                  isSelected && "bg-accent/60 hover:bg-accent/60",
                )}
              >
                <div
                  style={{ width: cols[0].width }}
                  className="flex min-w-0 items-center px-3"
                >
                  <span className="truncate font-mono">{s.name}</span>
                </div>
                <div
                  style={{ width: cols[1].width }}
                  className="flex items-center px-3"
                >
                  <OriginChip record={s} />
                </div>
                <div
                  style={{ width: cols[2].width }}
                  className="flex items-center px-3 tabular-nums"
                >
                  {s.attachments.length}
                </div>
                <div
                  style={{ width: cols[3].width }}
                  className="flex items-center px-3 tabular-nums"
                >
                  {s.cargo.length}
                </div>
                <div
                  style={{ width: cols[4].width }}
                  className="flex items-center px-3 tabular-nums"
                >
                  {totalItems}
                </div>
              </div>
            );
          })}
        </div>
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Package className="mr-2 h-4 w-4" /> No spawnables match the
            current filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface PresetsListProps {
  items: RandomPreset[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}

export function PresetsList({
  items,
  selectedName,
  onSelect,
}: PresetsListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 12,
  });

  const cols = [
    { key: "name", width: 320, label: "Preset name" },
    { key: "kind", width: 110, label: "Kind" },
    { key: "source", width: 150, label: "Origin" },
    { key: "chance", width: 80, label: "Chance" },
    { key: "items", width: 80, label: "Items" },
  ];
  const totalWidth = cols.reduce((n, c) => n + c.width, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="sticky top-0 z-10 flex border-b border-border bg-card"
        style={{ width: totalWidth, minWidth: "100%" }}
      >
        {cols.map((c) => (
          <div
            key={c.key}
            style={{ width: c.width }}
            className="flex h-8 items-center px-3 text-[11px] font-medium text-muted-foreground"
          >
            {c.label}
          </div>
        ))}
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
          {virtualizer.getVirtualItems().map((vr) => {
            const p = items[vr.index];
            if (!p) return null;
            const isSelected = p.name === selectedName;
            return (
              <div
                key={`${p.kind}:${p.name}`}
                role="row"
                onClick={() => onSelect(p.name)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${vr.size}px`,
                  transform: `translateY(${vr.start}px)`,
                }}
                className={cn(
                  "flex cursor-pointer border-b border-border/60 text-xs hover:bg-accent/40",
                  isSelected && "bg-accent/60 hover:bg-accent/60",
                )}
              >
                <div
                  style={{ width: cols[0].width }}
                  className="flex min-w-0 items-center px-3"
                >
                  <span className="truncate font-mono">{p.name}</span>
                </div>
                <div
                  style={{ width: cols[1].width }}
                  className="flex items-center gap-1.5 px-3"
                >
                  {p.kind === "attachments" ? (
                    <Layers className="h-3 w-3 text-severity-info" />
                  ) : (
                    <Box className="h-3 w-3 text-primary" />
                  )}
                  <span className="uppercase">{p.kind}</span>
                </div>
                <div
                  style={{ width: cols[2].width }}
                  className="flex items-center px-3"
                >
                  <OriginChip record={p} />
                </div>
                <div
                  style={{ width: cols[3].width }}
                  className="flex items-center px-3 tabular-nums"
                >
                  {p.chance.toFixed(2)}
                </div>
                <div
                  style={{ width: cols[4].width }}
                  className="flex items-center px-3 tabular-nums"
                >
                  {p.items.length}
                </div>
              </div>
            );
          })}
        </div>
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Layers className="mr-2 h-4 w-4" /> No presets match the
            current filters.
          </div>
        ) : null}
      </div>
    </div>
  );
}
