import { useMemo, useRef } from "react";
import L from "leaflet";
import {
  Circle,
  Marker,
  Polygon,
  Polyline,
  Tooltip,
} from "react-leaflet";

import type { MapId } from "@/types/ipc";
import type {
  SafezoneHandleRef,
  UnifiedSafezone,
  Vec3,
} from "@/features/mods/expansion/safezones/safezoneTypes";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import { SAFEZONE_COLOR, SAFEZONE_COLOR_SELECTED } from "./layerColors";

interface Props {
  zones: UnifiedSafezone[];
  mapId: MapId;
  selected: SafezoneHandleRef | null;
  onSelect: (ref: SafezoneHandleRef) => void;
  onMoveCenter: (ref: SafezoneHandleRef, next: { x: number; z: number }) => void;
  onResize: (ref: SafezoneHandleRef, radius: number) => void;
  /** In-progress polygon vertices — rendered as numbered markers plus
   *  a dashed connecting polyline so the operator sees the shape
   *  taking form before hitting Finish. */
  draft?: Vec3[];
}

/** Renders circles, cylinders and polygons in one layer. Circles +
 *  cylinders share the same visual (flat-map circle) — they differ
 *  only in the Height field, which is 3D and not paintable here.
 *  Polygons are read-only outlines for now; editing polygon vertices
 *  visually needs per-vertex handles (next iteration). */
export function SafezonesLayer({
  zones,
  mapId,
  selected,
  onSelect,
  onMoveCenter,
  onResize,
  draft,
}: Props) {
  return (
    <>
      {draft && draft.length > 0 ? (
        <PolygonDraftPreview vertices={draft} />
      ) : null}
      {zones.map((z) => {
        const isSelected =
          selected?.kind === z.kind && selected.index === z.index;
        if (z.kind === "polygon") {
          return (
            <PolygonShape
              key={`polygon:${z.index}`}
              zone={z}
              selected={isSelected}
              onSelect={() => onSelect({ kind: "polygon", index: z.index })}
            />
          );
        }
        return (
          <CircleShape
            key={`${z.kind}:${z.index}`}
            zone={z}
            mapId={mapId}
            selected={isSelected}
            onSelect={() => onSelect({ kind: z.kind, index: z.index })}
            onMoveCenter={(p) =>
              onMoveCenter({ kind: z.kind, index: z.index }, p)
            }
            onResize={(r) => onResize({ kind: z.kind, index: z.index }, r)}
          />
        );
      })}
    </>
  );
}

function CircleShape({
  zone,
  mapId,
  selected,
  onSelect,
  onMoveCenter,
  onResize,
}: {
  zone: UnifiedSafezone;
  mapId: MapId;
  selected: boolean;
  onSelect: () => void;
  onMoveCenter: (p: { x: number; z: number }) => void;
  onResize: (radius: number) => void;
}) {
  const color = selected ? SAFEZONE_COLOR_SELECTED : SAFEZONE_COLOR;
  const centerLatLng = dayzToLatLng(zone.center[0], zone.center[2]);
  const centerRef = useRef<L.Marker | null>(null);
  const edgePos = useMemo(
    () =>
      dayzToLatLng(
        clampToMap(mapId, zone.center[0] + zone.radius, zone.center[2]).x,
        zone.center[2],
      ),
    [mapId, zone.center, zone.radius],
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
  const label =
    zone.kind === "cylinder"
      ? `Cylinder · r=${Math.round(zone.radius)}m · h=${Math.round(zone.height)}m`
      : `Circle · r=${Math.round(zone.radius)}m`;
  return (
    <>
      <Circle
        center={centerLatLng}
        radius={zone.radius}
        pathOptions={{
          color,
          weight: selected ? 2.5 : 1.5,
          fillColor: color,
          fillOpacity: selected ? 0.18 : 0.08,
        }}
        eventHandlers={{ click: onSelect }}
      >
        <Tooltip direction="top" offset={[0, -4]} opacity={0.9} sticky>
          {label}
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
      />
      {selected ? (
        <Marker
          position={edgePos}
          icon={edgeIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const m = e.target as L.Marker;
              const dx = m.getLatLng().lng - zone.center[0];
              const dz = m.getLatLng().lat - zone.center[2];
              const dist = Math.sqrt(dx * dx + dz * dz);
              const next = Math.max(10, Math.round(dist));
              m.setLatLng(
                dayzToLatLng(zone.center[0] + next, zone.center[2]),
              );
              onResize(next);
            },
          }}
        />
      ) : null}
    </>
  );
}

function PolygonDraftPreview({ vertices }: { vertices: Vec3[] }) {
  const latlngs: L.LatLngExpression[] = vertices.map(
    (p) => [p[2], p[0]] as [number, number],
  );
  return (
    <>
      <Polyline
        positions={latlngs}
        pathOptions={{
          color: SAFEZONE_COLOR_SELECTED,
          weight: 2,
          dashArray: "4 4",
        }}
      />
      {vertices.map((p, i) => (
        <Marker
          key={i}
          position={dayzToLatLng(p[0], p[2])}
          icon={L.divIcon({
            className: "",
            html: `<div class="dayz-marker" style="background:${SAFEZONE_COLOR_SELECTED};color:white;width:14px;height:14px;border:2px solid white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold;line-height:1;">${i + 1}</div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  );
}

function PolygonShape({
  zone,
  selected,
  onSelect,
}: {
  zone: UnifiedSafezone;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = selected ? SAFEZONE_COLOR_SELECTED : SAFEZONE_COLOR;
  const latlngs: L.LatLngExpression[] = zone.positions.map(
    (p: Vec3) => [p[2], p[0]],
  );
  return (
    <Polygon
      positions={latlngs}
      pathOptions={{
        color,
        weight: selected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: selected ? 0.18 : 0.08,
      }}
      eventHandlers={{ click: onSelect }}
    >
      <Tooltip direction="top" offset={[0, -4]} opacity={0.9} sticky>
        Polygon · {zone.positions.length} vertices
      </Tooltip>
    </Polygon>
  );
}
