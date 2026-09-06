import { useMemo, useRef } from "react";
import L from "leaflet";
import { Marker } from "react-leaflet";

import type { MapId, TraderPlacement } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import { TRADER_AI_COLOR, TRADER_NPC_COLOR } from "./layerColors";

export interface TraderPinHandle {
  /** Index into the top-level `lines` array — lets the caller patch
   *  the correct line when a drag resolves. */
  lineIndex: number;
  placement: TraderPlacement;
}

interface TraderPlacementsLayerProps {
  handles: TraderPinHandle[];
  mapId: MapId;
  /** Which handle (lineIndex) is currently selected — gets a larger,
   *  highlighted marker so it's easy to find in a crowded zone. */
  selectedLineIndex: number | null;
  onSelect: (lineIndex: number) => void;
  /** Return the next `(x, y, z)` to persist — caller decides whether
   *  to look up `y` from nearest-building or keep the old value. */
  onMove: (
    lineIndex: number,
    next: { x: number; y: number; z: number },
  ) => void;
}

export function TraderPlacementsLayer({
  handles,
  mapId,
  selectedLineIndex,
  onSelect,
  onMove,
}: TraderPlacementsLayerProps) {
  return (
    <>
      {handles.map((h) => (
        <TraderMarker
          key={h.lineIndex}
          handle={h}
          mapId={mapId}
          selected={h.lineIndex === selectedLineIndex}
          onSelect={() => onSelect(h.lineIndex)}
          onMove={(next) => onMove(h.lineIndex, next)}
        />
      ))}
    </>
  );
}

function TraderMarker({
  handle,
  mapId,
  selected,
  onSelect,
  onMove,
}: {
  handle: TraderPinHandle;
  mapId: MapId;
  selected: boolean;
  onSelect: () => void;
  onMove: (next: { x: number; y: number; z: number }) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const { placement } = handle;
  const isAi = placement.entityClass.includes("AI");
  const color = isAi ? TRADER_AI_COLOR : TRADER_NPC_COLOR;
  const size = selected ? 14 : 10;
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:${size}px;height:${size}px;border:2px solid ${selected ? "#ffffff" : "rgba(255,255,255,0.6)"};box-shadow:0 0 0 1px ${color};"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    [color, size, selected],
  );
  return (
    <Marker
      position={dayzToLatLng(placement.position[0], placement.position[2])}
      icon={icon}
      draggable
      eventHandlers={{
        add: (e) => {
          markerRef.current = e.target as L.Marker;
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
          onMove({ x: clamped.x, y: placement.position[1], z: clamped.z });
        },
      }}
    />
  );
}
