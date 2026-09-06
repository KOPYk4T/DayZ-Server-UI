import { useMemo, useRef } from "react";
import L from "leaflet";
import { Circle, Marker, Tooltip } from "react-leaflet";

import type { MapId } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";

export interface TraderZoneHandle {
  /** Stable identity — file path works well. Used by the caller to
   *  map a drag back to the right zone. */
  id: string;
  name: string;
  /** `[X, Y, Z]` world metres. Y isn't rendered on the flat map but
   *  is kept so a resize / reposition doesn't clobber it. */
  position: [number, number, number];
  radius: number;
}

interface TraderZonesLayerProps {
  zones: TraderZoneHandle[];
  mapId: MapId;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveCenter: (
    id: string,
    next: { x: number; z: number },
  ) => void;
  onResize: (id: string, radius: number) => void;
}

const ZONE_COLOR = "#14b8a6"; // teal-500 — distinct from trader pins (cyan)
const ZONE_COLOR_SELECTED = "#0d9488"; // teal-600

export function TraderZonesLayer({
  zones,
  mapId,
  selectedId,
  onSelect,
  onMoveCenter,
  onResize,
}: TraderZonesLayerProps) {
  return (
    <>
      {zones.map((z) => (
        <ZoneShape
          key={z.id}
          zone={z}
          mapId={mapId}
          selected={z.id === selectedId}
          onSelect={() => onSelect(z.id)}
          onMoveCenter={(p) => onMoveCenter(z.id, p)}
          onResize={(r) => onResize(z.id, r)}
        />
      ))}
    </>
  );
}

function ZoneShape({
  zone,
  mapId,
  selected,
  onSelect,
  onMoveCenter,
  onResize,
}: {
  zone: TraderZoneHandle;
  mapId: MapId;
  selected: boolean;
  onSelect: () => void;
  onMoveCenter: (p: { x: number; z: number }) => void;
  onResize: (radius: number) => void;
}) {
  const centerLatLng = dayzToLatLng(zone.position[0], zone.position[2]);
  const color = selected ? ZONE_COLOR_SELECTED : ZONE_COLOR;
  const centerRef = useRef<L.Marker | null>(null);

  // Edge handle sits `radius` metres due east of centre. Dragging it
  // adjusts the radius — diff from center projected on the X axis,
  // clamped to a minimum so the circle doesn't collapse.
  const edgePos = useMemo(
    () =>
      dayzToLatLng(
        clampToMap(mapId, zone.position[0] + zone.radius, zone.position[2]).x,
        zone.position[2],
      ),
    [mapId, zone.position, zone.radius],
  );

  const centerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:${selected ? 12 : 10}px;height:${selected ? 12 : 10}px;border:2px solid ${selected ? "#ffffff" : "rgba(255,255,255,0.7)"};"></div>`,
        iconSize: [selected ? 12 : 10, selected ? 12 : 10],
        iconAnchor: [selected ? 6 : 5, selected ? 6 : 5],
      }),
    [color, selected],
  );

  const edgeIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:transparent;border:2px solid ${color};width:10px;height:10px;border-radius:50%;"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      }),
    [color],
  );

  return (
    <>
      <Circle
        center={centerLatLng}
        radius={zone.radius}
        pathOptions={{
          color,
          weight: selected ? 2.5 : 1.5,
          fillColor: color,
          fillOpacity: selected ? 0.2 : 0.1,
        }}
        eventHandlers={{ click: onSelect }}
      >
        <Tooltip direction="top" offset={[0, -4]} opacity={0.9} sticky>
          {zone.name} · r={Math.round(zone.radius)}m
        </Tooltip>
      </Circle>
      <Marker
        position={centerLatLng}
        icon={centerIcon}
        draggable={selected}
        eventHandlers={{
          add: (e) => {
            centerRef.current = e.target as L.Marker;
          },
          click: onSelect,
          dragend: (e) => {
            const m = e.target as L.Marker;
            const clamped = clampToMap(
              mapId,
              m.getLatLng().lng,
              m.getLatLng().lat,
            );
            m.setLatLng(dayzToLatLng(clamped.x, clamped.z));
            onMoveCenter({ x: clamped.x, z: clamped.z });
          },
        }}
      >
        <Tooltip direction="right" offset={[6, 0]} opacity={0.9} permanent>
          {zone.name}
        </Tooltip>
      </Marker>
      {selected ? (
        <Marker
          position={edgePos}
          icon={edgeIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const dx = m.getLatLng().lng - zone.position[0];
              const dz = m.getLatLng().lat - zone.position[2];
              const dist = Math.sqrt(dx * dx + dz * dz);
              const next = Math.max(10, Math.round(dist));
              m.setLatLng(
                dayzToLatLng(zone.position[0] + next, zone.position[2]),
              );
              onResize(next);
            },
          }}
        />
      ) : null}
    </>
  );
}
