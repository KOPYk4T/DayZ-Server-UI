import { useMemo, useRef } from "react";
import L from "leaflet";
import { Marker } from "react-leaflet";

import type { PlayerSpawnPoints, SpawnPosition } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import { PLAYER_SPAWN_COLORS } from "./layerColors";
import type { PlayerSpawnsLayerState, PlayerSpawnKind } from "./types";

interface PlayerSpawnsLayerProps {
  data: PlayerSpawnPoints;
  state: PlayerSpawnsLayerState;
  mapId: import("@/types/ipc").MapId;
  /** Called with the new data after a user edit (drag / delete). The
   *  page-level component owns the draft state and decides when to
   *  save. */
  onChange: (next: PlayerSpawnPoints) => void;
  /** Locks editing — useful while the save mutation is in flight or
   *  when the user hasn't unlocked edit mode. */
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
  };

  return (
    <>
      {visible.map((h) => (
        <SpawnMarker
          key={`${h.kind}:${h.index}`}
          handle={h}
          mapId={mapId}
          readOnly={readOnly}
          onMove={(np) => updatePos(h, np)}
          onDelete={() => removePos(h)}
        />
      ))}
    </>
  );
}

function SpawnMarker({
  handle,
  mapId,
  readOnly,
  onMove,
  onDelete,
}: {
  handle: MarkerHandle;
  mapId: import("@/types/ipc").MapId;
  readOnly?: boolean;
  onMove: (p: SpawnPosition) => void;
  onDelete: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const color = PLAYER_SPAWN_COLORS[handle.kind];

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:10px;height:10px;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    [color],
  );

  // Wire popup content — label, coords, remove button. The remove
  // button uses a DOM handler because the popup content is rendered
  // outside React's tree.
  const bindPopup = (m: L.Marker) => {
    const container = document.createElement("div");
    container.className = "text-xs space-y-1";
    container.innerHTML = `
      <div><strong style="color:${color}">${handle.kind}</strong> · #${handle.index + 1}</div>
      <div class="font-mono">x=${handle.pos.x.toFixed(0)} z=${handle.pos.z.toFixed(0)} a=${handle.pos.a.toFixed(0)}</div>
    `;
    if (!readOnly) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mt-1 rounded border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => {
        m.closePopup();
        onDelete();
      });
      container.appendChild(btn);
    }
    m.bindPopup(container);
  };

  return (
    <Marker
      position={dayzToLatLng(handle.pos.x, handle.pos.z)}
      icon={icon}
      draggable={!readOnly}
      eventHandlers={{
        add: (e) => {
          const m = e.target as L.Marker;
          markerRef.current = m;
          bindPopup(m);
        },
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
    />
  );
}

