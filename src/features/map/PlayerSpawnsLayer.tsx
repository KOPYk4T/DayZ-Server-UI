import { useMemo } from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import type { PlayerSpawnPoints, SpawnPosition } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import { PLAYER_SPAWN_COLORS } from "./layerColors";
import type {
  PlayerSpawnKind,
  PlayerSpawnsLayerState,
  SpawnSelection,
} from "./types";

interface PlayerSpawnsLayerProps {
  data: PlayerSpawnPoints;
  state: PlayerSpawnsLayerState;
  mapId: import("@/types/ipc").MapId;
  /** Called with the new data after a user edit (drag / yaw / delete).
   *  The page-level component owns the draft and decides when to save. */
  onChange: (next: PlayerSpawnPoints) => void;
  selected?: SpawnSelection | null;
  onSelect?: (next: SpawnSelection | null) => void;
  /** Locks editing — useful while the save mutation is in flight. */
  readOnly?: boolean;
}

interface MarkerHandle {
  kind: PlayerSpawnKind;
  index: number;
  pos: SpawnPosition;
}

export function PlayerSpawnsLayer({
  data,
  state,
  mapId,
  onChange,
  selected,
  onSelect,
  readOnly,
}: PlayerSpawnsLayerProps) {
  const visible: MarkerHandle[] = useMemo(() => {
    if (!state.enabled) return [];
    const out: MarkerHandle[] = [];
    (Object.keys(state.kinds) as PlayerSpawnKind[]).forEach((kind) => {
      if (!state.kinds[kind]) return;
      data[kind].forEach((pos, index) => {
        out.push({ kind, index, pos });
      });
    });
    return out;
  }, [data, state.kinds, state.enabled]);

  if (!state.enabled) return null;

  const updatePos = (handle: MarkerHandle, newPos: SpawnPosition) => {
    const list = data[handle.kind].slice();
    list[handle.index] = newPos;
    onChange({ ...data, [handle.kind]: list });
  };

  const removePos = (handle: MarkerHandle) => {
    const list = data[handle.kind].filter((_, i) => i !== handle.index);
    onChange({ ...data, [handle.kind]: list });
    if (
      selected &&
      selected.kind === handle.kind &&
      selected.index === handle.index
    ) {
      onSelect?.(null);
    } else if (
      selected &&
      selected.kind === handle.kind &&
      selected.index > handle.index
    ) {
      onSelect?.({ kind: handle.kind, index: selected.index - 1 });
    }
  };

  return (
    <>
      {visible.map((h) => {
        const isSelected =
          selected?.kind === h.kind && selected.index === h.index;
        return (
          <SpawnMarker
            key={`${h.kind}:${h.index}`}
            handle={h}
            mapId={mapId}
            selected={isSelected}
            readOnly={readOnly}
            onSelect={() => onSelect?.({ kind: h.kind, index: h.index })}
            onMove={(np) => updatePos(h, np)}
            onDelete={() => removePos(h)}
          />
        );
      })}
    </>
  );
}

function SpawnMarker({
  handle,
  mapId,
  selected,
  readOnly,
  onSelect,
  onMove,
  onDelete,
}: {
  handle: MarkerHandle;
  mapId: import("@/types/ipc").MapId;
  selected: boolean;
  readOnly?: boolean;
  onSelect: () => void;
  onMove: (p: SpawnPosition) => void;
  onDelete: () => void;
}) {
  const color = PLAYER_SPAWN_COLORS[handle.kind];
  const yaw = ((handle.pos.a % 360) + 360) % 360;

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-spawn-marker${selected ? " is-selected" : ""}" style="--spawn-color:${color}">
          <div class="dayz-spawn-rotator" style="transform:rotate(${yaw}deg)">
            <div class="dayz-spawn-arrow"></div>
          </div>
          <div class="dayz-spawn-dot"></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    [color, selected, yaw],
  );

  return (
    <Marker
      position={dayzToLatLng(handle.pos.x, handle.pos.z)}
      icon={icon}
      draggable={!readOnly}
      zIndexOffset={selected ? 1000 : 0}
      eventHandlers={{
        click: () => onSelect(),
        dragend: (e) => {
          const m = e.target as L.Marker;
          const clamped = clampToMap(
            mapId,
            m.getLatLng().lng,
            m.getLatLng().lat,
          );
          m.setLatLng(dayzToLatLng(clamped.x, clamped.z));
          onMove({ x: clamped.x, z: clamped.z, a: handle.pos.a });
        },
      }}
    >
      <Popup>
        <div className="space-y-1.5 text-xs">
          <div>
            <strong style={{ color }}>{handle.kind}</strong>
            {" · #"}
            {handle.index + 1}
          </div>
          <div className="font-mono">
            x={handle.pos.x.toFixed(0)} z={handle.pos.z.toFixed(0)}
          </div>
          <label className="block space-y-0.5">
            <span className="text-[11px] text-muted-foreground">
              Yaw {yaw.toFixed(0)}° (0 = north)
            </span>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              value={yaw}
              disabled={readOnly}
              onChange={(e) =>
                onMove({
                  ...handle.pos,
                  a: Number(e.target.value),
                })
              }
              className="w-full accent-current"
            />
          </label>
          {!readOnly ? (
            <button
              type="button"
              className="rounded border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              Remove
            </button>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}
