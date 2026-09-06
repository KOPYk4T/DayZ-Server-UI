import { useMemo, useRef } from "react";
import L from "leaflet";
import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";

import type { MapId } from "@/types/ipc";
import type { AIPatrol } from "@/features/mods/expansion/aipatrols/types";

import { clampToMap, dayzToLatLng } from "./dayzMap";

export interface AiPatrolHandle {
  /** Array index inside `AIPatrolSettings.Patrols[]`. That's the
   *  handle callers get back on drag / select — we patch the
   *  settings in-place. */
  index: number;
  patrol: AIPatrol;
}

const PATROL_COLOR = "#f97316"; // orange-500 — visually distinct from
// cyan/teal/green/purple used by the other layers.
const PATROL_COLOR_SELECTED = "#ea580c"; // orange-600

interface Props {
  handles: AiPatrolHandle[];
  mapId: MapId;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Drag the spawn pin (first waypoint). Caller should shift ALL
   *  waypoints by the delta so the patrol route moves as a unit —
   *  per-vertex editing comes in a later slice. */
  onMoveSpawn: (index: number, next: { x: number; z: number }) => void;
}

/** One polyline per patrol + a pin at the first waypoint (= spawn
 *  location). Patrols without waypoints render as a standalone pin
 *  at origin — an edge case that shouldn't happen in practice but
 *  keeps the layer well-defined. */
export function AiPatrolsLayer({
  handles,
  mapId,
  selectedIndex,
  onSelect,
  onMoveSpawn,
}: Props) {
  return (
    <>
      {handles.map((h) => (
        <PatrolShape
          key={h.index}
          handle={h}
          mapId={mapId}
          selected={h.index === selectedIndex}
          onSelect={() => onSelect(h.index)}
          onMoveSpawn={(p) => onMoveSpawn(h.index, p)}
        />
      ))}
    </>
  );
}

function PatrolShape({
  handle,
  mapId,
  selected,
  onSelect,
  onMoveSpawn,
}: {
  handle: AiPatrolHandle;
  mapId: MapId;
  selected: boolean;
  onSelect: () => void;
  onMoveSpawn: (p: { x: number; z: number }) => void;
}) {
  const { patrol } = handle;
  const color = selected ? PATROL_COLOR_SELECTED : PATROL_COLOR;

  const waypoints = patrol.Waypoints;
  const latlngs: L.LatLngExpression[] = useMemo(
    () => waypoints.map((w) => [w[2], w[0]] as [number, number]),
    [waypoints],
  );
  const spawn = waypoints[0];

  const pinRef = useRef<L.Marker | null>(null);
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:${selected ? 14 : 10}px;height:${selected ? 14 : 10}px;border:2px solid ${selected ? "#ffffff" : "rgba(255,255,255,0.6)"};box-shadow:0 0 0 1px ${color};"></div>`,
        iconSize: [selected ? 14 : 10, selected ? 14 : 10],
        iconAnchor: [selected ? 7 : 5, selected ? 7 : 5],
      }),
    [color, selected],
  );

  return (
    <>
      {waypoints.length >= 2 ? (
        <Polyline
          positions={latlngs}
          pathOptions={{
            color,
            weight: selected ? 3 : 2,
            dashArray: "6 4",
            opacity: selected ? 0.9 : 0.7,
          }}
          eventHandlers={{ click: onSelect }}
        />
      ) : null}
      {/* Per-vertex dot for every waypoint AFTER the spawn so the
          operator can see the path's individual vertices while
          drawing or reviewing. The spawn (index 0) gets the
          draggable Marker below — no need to render it twice. */}
      {waypoints.slice(1).map((w, i) => (
        <CircleMarker
          key={`wp-${i}`}
          center={dayzToLatLng(w[0], w[2])}
          radius={selected ? 4 : 3}
          pathOptions={{
            color,
            fillColor: color,
            fillOpacity: selected ? 0.9 : 0.7,
            weight: 1.5,
          }}
          eventHandlers={{ click: onSelect }}
        >
          <Tooltip direction="top" offset={[0, -2]} opacity={0.85}>
            #{i + 1} · {w[0].toFixed(0)}, {w[2].toFixed(0)}
          </Tooltip>
        </CircleMarker>
      ))}
      {spawn ? (
        <Marker
          position={dayzToLatLng(spawn[0], spawn[2])}
          icon={icon}
          draggable
          eventHandlers={{
            add: (e) => {
              pinRef.current = e.target as L.Marker;
            },
            click: onSelect,
            dragstart: onSelect,
            dragend: (e) => {
              const m = e.target as L.Marker;
              const clamped = clampToMap(
                mapId,
                m.getLatLng().lng,
                m.getLatLng().lat,
              );
              m.setLatLng(dayzToLatLng(clamped.x, clamped.z));
              onMoveSpawn({ x: clamped.x, z: clamped.z });
            },
          }}
        >
          <Tooltip
            direction="top"
            offset={[0, -4]}
            opacity={0.9}
            permanent={selected}
          >
            {patrol.Name || "(unnamed)"}
            {waypoints.length > 1
              ? ` · ${waypoints.length} waypoints`
              : ""}
          </Tooltip>
        </Marker>
      ) : null}
    </>
  );
}
