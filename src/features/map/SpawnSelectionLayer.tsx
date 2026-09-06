import { useMemo, useRef } from "react";
import L from "leaflet";
import { Marker, Polyline, Tooltip } from "react-leaflet";

import type { MapId } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import {
  SPAWN_SELECTION_COLOR,
  SPAWN_SELECTION_COLOR_SELECTED,
} from "./layerColors";

export interface SpawnLocationHandle {
  /** Index into `SpawnSettings.SpawnLocations[]`. */
  index: number;
  name: string;
  /** `[x, y, z]` per candidate position. Index 0 is the "anchor"
   *  that renders the name label + drives the 2D marker in the
   *  player's spawn-selection menu. */
  positions: [number, number, number][];
}

interface Props {
  handles: SpawnLocationHandle[];
  mapId: MapId;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Drag a specific position (identified by its index inside
   *  `positions[]`). Y is handed back unchanged so caller can snap
   *  to nearest building. */
  onMovePosition: (
    locationIndex: number,
    positionIndex: number,
    next: { x: number; z: number },
  ) => void;
}

/** Pin cluster per SpawnLocation:
 *  - Index 0 ("anchor") renders with the Name label + a larger pin.
 *  - Other positions render as smaller pins with dotted polylines
 *    tying them visually to the anchor so clusters read at a
 *    glance when many locations are on-screen.
 *  - Every pin is draggable; drag-end fires `onMovePosition` with
 *    the position's index so caller can patch the right entry. */
export function SpawnSelectionLayer({
  handles,
  mapId,
  selectedIndex,
  onSelect,
  onMovePosition,
}: Props) {
  return (
    <>
      {handles.map((h) => (
        <LocationCluster
          key={h.index}
          handle={h}
          mapId={mapId}
          selected={h.index === selectedIndex}
          onSelect={() => onSelect(h.index)}
          onMovePosition={(pi, next) => onMovePosition(h.index, pi, next)}
        />
      ))}
    </>
  );
}

function LocationCluster({
  handle,
  mapId,
  selected,
  onSelect,
  onMovePosition,
}: {
  handle: SpawnLocationHandle;
  mapId: MapId;
  selected: boolean;
  onSelect: () => void;
  onMovePosition: (
    positionIndex: number,
    next: { x: number; z: number },
  ) => void;
}) {
  const color = selected
    ? SPAWN_SELECTION_COLOR_SELECTED
    : SPAWN_SELECTION_COLOR;

  const { positions } = handle;
  const anchor = positions[0];

  // Dotted lines from the anchor to each extra position so a
  // cluster reads as a single location even when positions drift
  // far apart.
  const clusterLines: L.LatLngExpression[][] = useMemo(
    () =>
      anchor
        ? positions.slice(1).map((p) => [
            [anchor[2], anchor[0]] as [number, number],
            [p[2], p[0]] as [number, number],
          ])
        : [],
    [positions, anchor],
  );

  if (!anchor) return null;

  return (
    <>
      {selected
        ? clusterLines.map((line, i) => (
            <Polyline
              key={i}
              positions={line}
              pathOptions={{
                color,
                weight: 1.5,
                dashArray: "3 4",
                opacity: 0.6,
              }}
              interactive={false}
            />
          ))
        : null}
      {positions.map((pos, pi) => (
        <PositionPin
          key={pi}
          pos={pos}
          color={color}
          selected={selected}
          isAnchor={pi === 0}
          label={pi === 0 ? handle.name : null}
          onSelect={onSelect}
          onMove={(next) => onMovePosition(pi, next)}
          mapId={mapId}
        />
      ))}
    </>
  );
}

function PositionPin({
  pos,
  color,
  selected,
  isAnchor,
  label,
  mapId,
  onSelect,
  onMove,
}: {
  pos: [number, number, number];
  color: string;
  selected: boolean;
  isAnchor: boolean;
  label: string | null;
  mapId: MapId;
  onSelect: () => void;
  onMove: (next: { x: number; z: number }) => void;
}) {
  const pinRef = useRef<L.Marker | null>(null);
  const size = isAnchor ? (selected ? 14 : 11) : selected ? 9 : 7;
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:${size}px;height:${size}px;border:${isAnchor ? 2 : 1}px solid ${selected ? "#ffffff" : "rgba(255,255,255,0.6)"};box-shadow:0 0 0 1px ${color};"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    [color, size, selected, isAnchor],
  );
  return (
    <Marker
      position={dayzToLatLng(pos[0], pos[2])}
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
          onMove({ x: clamped.x, z: clamped.z });
        },
      }}
    >
      {label ? (
        <Tooltip
          direction="top"
          offset={[0, -4]}
          opacity={0.9}
          permanent={selected}
        >
          {label}
        </Tooltip>
      ) : null}
    </Marker>
  );
}
