import { useEffect, useMemo } from "react";
import { Crosshair } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMapSettingsStore } from "@/stores/mapSettingsStore";
import { useProfileStore } from "@/stores/profileStore";
import type { MapId, PlayerSpawnPoints, SpawnPosition } from "@/types/ipc";

import { BackgroundImageLayer } from "./BackgroundImageLayer";
import { setCustomMapSize } from "./dayzMap";
import { useFlyToSpawnAt } from "./flyTo";
import { PLAYER_SPAWN_COLORS } from "./layerColors";
import { MapCanvas } from "./MapCanvas";
import { PlayerSpawnsLayer } from "./PlayerSpawnsLayer";
import type { PlayerSpawnKind, PlayerSpawnsLayerState } from "./types";

/** Compact Leaflet used on the Player Spawns category page — one
 *  kind at a time, click-to-add + drag. The world Map editor keeps
 *  the full layer stack (events, territories, CE). */
export function SpawnPlacementMap({
  data,
  kind,
  mapId,
  selectedIndex,
  onSelectIndex,
  onChange,
  addMode,
  onAddModeChange,
  readOnly,
}: {
  data: PlayerSpawnPoints;
  kind: PlayerSpawnKind;
  mapId: MapId;
  selectedIndex: number | null;
  onSelectIndex: (index: number | null) => void;
  onChange: (next: PlayerSpawnPoints) => void;
  addMode: boolean;
  onAddModeChange: (next: boolean) => void;
  readOnly?: boolean;
}) {
  const active = useProfileStore((s) => s.active);
  const stored = useMapSettingsStore((s) =>
    active ? s.byProfile[active.id] : undefined,
  );
  const mapSettings = {
    imagePath: stored?.imagePath,
    imageOpacity: stored?.imageOpacity ?? 0.7,
    imageOffsetX: stored?.imageOffsetX ?? 0,
    imageOffsetY: stored?.imageOffsetY ?? 0,
    imageScale: stored?.imageScale ?? 1,
  };

  useEffect(() => {
    setCustomMapSize(active?.customMapSizeM ?? null);
  }, [active?.customMapSizeM]);

  const layerState: PlayerSpawnsLayerState = useMemo(
    () => ({
      enabled: true,
      kinds: {
        fresh: kind === "fresh",
        hop: kind === "hop",
        travel: kind === "travel",
      },
    }),
    [kind],
  );

  const selected =
    selectedIndex !== null ? { kind, index: selectedIndex } : null;
  const selectedPos =
    selectedIndex !== null ? (data[kind][selectedIndex] ?? null) : null;
  const color = PLAYER_SPAWN_COLORS[kind];

  const onMapClick = ({ x, z }: { x: number; z: number }) => {
    if (!addMode || readOnly) return;
    const next: SpawnPosition = {
      x: Math.round(x),
      z: Math.round(z),
      a: 0,
    };
    onChange({ ...data, [kind]: [...data[kind], next] });
    onSelectIndex(data[kind].length);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border/60">
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-2 py-1.5">
        <Button
          size="sm"
          variant={addMode ? "default" : "secondary"}
          className="h-7 px-2 text-[11px]"
          disabled={readOnly}
          onClick={() => onAddModeChange(!addMode)}
          title={
            addMode
              ? "Click the map to place, or press again to stop"
              : `Click the map to add a ${kind} spawn`
          }
        >
          <Crosshair className="mr-1.5 h-3 w-3" />
          {addMode ? "Click map to place" : "Place on map"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Drag a pin to move · arrow is yaw (0 = north)
        </span>
        <span
          className="ml-auto h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
      </div>
      <div className={cn("relative min-h-0 flex-1", addMode && "cursor-crosshair")}>
        <MapCanvas
          key={`${active?.id ?? "none"}-${kind}`}
          mapId={mapId}
          onMapClick={onMapClick}
          className={cn("h-full", addMode && "cursor-crosshair")}
        >
          {mapSettings?.imagePath ? (
            <BackgroundImageLayer
              mapId={mapId}
              imagePath={mapSettings.imagePath}
              opacity={mapSettings.imageOpacity}
              offsetX={mapSettings.imageOffsetX}
              offsetY={mapSettings.imageOffsetY}
              scale={mapSettings.imageScale}
            />
          ) : null}
          <PlayerSpawnsLayer
            data={data}
            state={layerState}
            mapId={mapId}
            onChange={onChange}
            selected={selected}
            onSelect={(next) =>
              onSelectIndex(next && next.kind === kind ? next.index : null)
            }
            readOnly={readOnly}
          />
          <FlyToSelected
            pos={selectedPos}
            focusKey={selected ? `${selected.kind}:${selected.index}` : null}
          />
        </MapCanvas>
      </div>
    </div>
  );
}

function FlyToSelected({
  pos,
  focusKey,
}: {
  pos: { x: number; z: number } | null;
  focusKey: string | null;
}) {
  useFlyToSpawnAt(pos, focusKey);
  return null;
}
