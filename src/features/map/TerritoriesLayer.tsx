import { useMemo } from "react";
import L from "leaflet";
import { Circle, Marker, Tooltip } from "react-leaflet";

import type { MapId, TerritoryFileEntry } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import {
  colorForTerritoryCategory,
  TERRITORY_COLOR_SELECTED,
} from "./layerColors";

/** Stable reference to one zone inside one territory inside one file.
 *  All editing operations (move, resize, delete) take a ref so the
 *  layer and the side panel stay in sync without passing raw indices. */
export interface TerritoryZoneRef {
  filename: string;
  territoryIdx: number;
  zoneIdx: number;
}

export function refsEqual(
  a: TerritoryZoneRef | null,
  b: TerritoryZoneRef | null,
): boolean {
  if (!a || !b) return a === b;
  return (
    a.filename === b.filename &&
    a.territoryIdx === b.territoryIdx &&
    a.zoneIdx === b.zoneIdx
  );
}

interface Props {
  entries: TerritoryFileEntry[];
  /** Categories the operator has hidden via the panel. Absent /
   *  `false` keys count as visible. */
  hiddenCategories: Record<string, boolean>;
  mapId: MapId;
  selected: TerritoryZoneRef | null;
  onSelect: (ref: TerritoryZoneRef) => void;
  onMoveCenter: (ref: TerritoryZoneRef, next: { x: number; z: number }) => void;
  onResize: (ref: TerritoryZoneRef, radius: number) => void;
}

export function TerritoriesLayer({
  entries,
  hiddenCategories,
  mapId,
  selected,
  onSelect,
  onMoveCenter,
  onResize,
}: Props) {
  return (
    <>
      {entries.flatMap((entry) => {
        if (hiddenCategories[entry.category]) return [];
        const color = colorForTerritoryCategory(entry.category);
        return entry.data.territories.flatMap((t, tIdx) =>
          t.zones.map((z, zIdx) => {
            const ref: TerritoryZoneRef = {
              filename: entry.filename,
              territoryIdx: tIdx,
              zoneIdx: zIdx,
            };
            return (
              <ZoneShape
                key={`${entry.filename}:${tIdx}:${zIdx}`}
                mapId={mapId}
                category={entry.displayName}
                x={z.x}
                z={z.z}
                r={z.r}
                name={z.name}
                dmin={z.dmin}
                dmax={z.dmax}
                color={color}
                selected={refsEqual(selected, ref)}
                onSelect={() => onSelect(ref)}
                onMoveCenter={(p) => onMoveCenter(ref, p)}
                onResize={(r) => onResize(ref, r)}
              />
            );
          }),
        );
      })}
    </>
  );
}

function ZoneShape({
  mapId,
  category,
  x,
  z,
  r,
  name,
  dmin,
  dmax,
  color,
  selected,
  onSelect,
  onMoveCenter,
  onResize,
}: {
  mapId: MapId;
  category: string;
  x: number;
  z: number;
  r: number;
  name: string;
  dmin: number;
  dmax: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onMoveCenter: (p: { x: number; z: number }) => void;
  onResize: (radius: number) => void;
}) {
  const centerLatLng = dayzToLatLng(x, z);
  const edgePos = useMemo(
    () => dayzToLatLng(clampToMap(mapId, x + r, z).x, z),
    [mapId, x, z, r],
  );
  const centerIcon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:${selected ? 12 : 10}px;height:${selected ? 12 : 10}px;border:2px solid ${selected ? TERRITORY_COLOR_SELECTED : "rgba(255,255,255,0.7)"};border-radius:50%;"></div>`,
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
  const density =
    dmin > 0 || dmax > 0 ? ` · density ${dmin}–${dmax}` : "";
  const label = `${category} · ${name} · r=${Math.round(r)}m${density}`;
  return (
    <>
      <Circle
        center={centerLatLng}
        radius={r}
        pathOptions={{
          color,
          weight: selected ? 2.5 : 1.25,
          fillColor: color,
          fillOpacity: selected ? 0.22 : 0.1,
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
              const dx = m.getLatLng().lng - x;
              const dz = m.getLatLng().lat - z;
              const dist = Math.sqrt(dx * dx + dz * dz);
              const next = Math.max(10, Math.round(dist));
              m.setLatLng(dayzToLatLng(x + next, z));
              onResize(next);
            },
          }}
        />
      ) : null}
    </>
  );
}
