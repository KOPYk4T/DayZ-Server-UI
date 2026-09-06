import { useMemo, useRef } from "react";
import L from "leaflet";
import { Marker } from "react-leaflet";

import type { EventPosition, EventSpawnGroup, MapId } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import { EVENT_SPAWN_COLOR } from "./layerColors";
import type { EventPositionsLayerState } from "./types";

interface EventPositionsLayerProps {
  spawns: EventSpawnGroup[];
  state: EventPositionsLayerState;
  mapId: MapId;
  /** When provided, markers are draggable and click-popups include a
   *  Remove button. `null` / undefined keeps the layer read-only. */
  onChange?: (next: EventSpawnGroup[]) => void;
  /** Drag-to-move is only enabled on markers whose event name matches
   *  this — lets the user lock editing to one event at a time so
   *  stray drags on crowded layers don't happen. `null` unlocks all
   *  when onChange is also provided. */
  editEventName?: string | null;
}

interface PointHandle {
  eventName: string;
  groupIndex: number;
  positionIndex: number;
  pos: EventPosition;
}

export function EventPositionsLayer({
  spawns,
  state,
  mapId,
  onChange,
  editEventName,
}: EventPositionsLayerProps) {
  const points: PointHandle[] = useMemo(() => {
    if (!state.enabled) return [];
    const out: PointHandle[] = [];
    spawns.forEach((g, groupIndex) => {
      if (state.eventName && g.eventName !== state.eventName) return;
      g.positions.forEach((pos, positionIndex) => {
        out.push({ eventName: g.eventName, groupIndex, positionIndex, pos });
      });
    });
    return out;
  }, [spawns, state.enabled, state.eventName]);

  if (!state.enabled) return null;

  const updatePos = (h: PointHandle, patch: Partial<EventPosition>) => {
    if (!onChange) return;
    const next = spawns.map((g, gi) => {
      if (gi !== h.groupIndex) return g;
      return {
        ...g,
        positions: g.positions.map((p, pi) =>
          pi === h.positionIndex ? { ...p, ...patch } : p,
        ),
      };
    });
    onChange(next);
  };

  const deletePos = (h: PointHandle) => {
    if (!onChange) return;
    const next = spawns.map((g, gi) => {
      if (gi !== h.groupIndex) return g;
      return {
        ...g,
        positions: g.positions.filter((_, pi) => pi !== h.positionIndex),
      };
    });
    onChange(next);
  };

  return (
    <>
      {points.map((h) => (
        <EventMarker
          key={`${h.eventName}:${h.groupIndex}:${h.positionIndex}`}
          handle={h}
          mapId={mapId}
          editable={
            !!onChange &&
            (editEventName == null || editEventName === h.eventName)
          }
          onMove={(np) => updatePos(h, np)}
          onDelete={() => deletePos(h)}
        />
      ))}
    </>
  );
}

function EventMarker({
  handle,
  mapId,
  editable,
  onMove,
  onDelete,
}: {
  handle: PointHandle;
  mapId: MapId;
  editable: boolean;
  onMove: (p: Partial<EventPosition>) => void;
  onDelete: () => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const { eventName, pos } = handle;
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${EVENT_SPAWN_COLOR};width:8px;height:8px;"></div>`,
        iconSize: [8, 8],
        iconAnchor: [4, 4],
      }),
    [],
  );
  return (
    <Marker
      position={dayzToLatLng(pos.x, pos.z)}
      icon={icon}
      draggable={editable}
      eventHandlers={{
        add: (e) => {
          const m = e.target as L.Marker;
          markerRef.current = m;
          bindPopup(m, handle, editable, onDelete);
        },
        dragend: (e) => {
          if (!editable) return;
          const m = e.target as L.Marker;
          const clamped = clampToMap(
            mapId,
            m.getLatLng().lng,
            m.getLatLng().lat,
          );
          m.setLatLng(dayzToLatLng(clamped.x, clamped.z));
          onMove({ x: clamped.x, z: clamped.z });
        },
      }}
    />
  );

  // Helper kept out-of-render to avoid recreating it every commit.
  function bindPopup(
    m: L.Marker,
    h: PointHandle,
    ed: boolean,
    del: () => void,
  ) {
    const container = document.createElement("div");
    container.className = "text-xs space-y-1";
    container.innerHTML = `
      <div><strong style="color:${EVENT_SPAWN_COLOR}">${escapeHtml(eventName)}</strong></div>
      <div class="font-mono">x=${h.pos.x.toFixed(0)} z=${h.pos.z.toFixed(0)} a=${h.pos.a.toFixed(0)}</div>
      ${h.pos.group ? `<div class="text-muted-foreground">group: <span class="font-mono">${escapeHtml(h.pos.group)}</span></div>` : ""}
    `;
    if (ed) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "mt-1 rounded border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => {
        m.closePopup();
        del();
      });
      container.appendChild(btn);
    }
    m.bindPopup(container);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
