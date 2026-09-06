/**
 * DayZ ↔ Leaflet coordinate helpers.
 *
 * DayZ uses `(x, z)` in world metres where `x` is east-west and `z` is
 * north-south, with `(0, 0)` at the south-west corner of the map.
 * Leaflet's `CRS.Simple` lets us use arbitrary y,x pixel-like
 * coordinates — we treat DayZ's `z` as the Leaflet latitude (so a
 * player at z=15000 sits near the top of the screen on Chernarus) and
 * DayZ's `x` as the Leaflet longitude.
 */
import L from "leaflet";

import type { MapId } from "@/types/ipc";

/** World-metre extent of vanilla DayZ maps. Custom is a best-guess
 *  fallback — the authoritative custom-map size comes from the
 *  profile via `setCustomMapSize()` before the map renders. */
export const MAP_SIZE_M: Record<MapId, number> = {
  chernarusplus: 15360,
  enoch: 12800,
  sakhal: 12800,
  custom: 15360,
};

/** Runtime override for the "custom" map's size. Set from
 *  `ServerProfile.customMapSizeM` whenever a profile loads. Every
 *  helper below consults this via `sizeFor()` — don't read
 *  `MAP_SIZE_M.custom` directly. */
let customSizeOverride: number | null = null;

export function setCustomMapSize(size: number | null | undefined): void {
  customSizeOverride = size != null && size > 0 ? size : null;
}

export function sizeFor(map: MapId): number {
  if (map === "custom" && customSizeOverride != null) {
    return customSizeOverride;
  }
  return MAP_SIZE_M[map];
}

export const MAP_LABEL: Record<MapId, string> = {
  chernarusplus: "Chernarus +",
  enoch: "Livonia (Enoch)",
  sakhal: "Sakhal",
  custom: "Custom",
};

/** Convert DayZ world (x, z) → Leaflet LatLng. */
export function dayzToLatLng(x: number, z: number): L.LatLng {
  return L.latLng(z, x);
}

/** Convert Leaflet LatLng → DayZ world (x, z). */
export function latLngToDayz(ll: L.LatLng): { x: number; z: number } {
  return { x: ll.lng, z: ll.lat };
}

/** Returns `[[0,0], [size,size]]` bounds for a given map. */
export function mapBounds(map: MapId): L.LatLngBoundsExpression {
  const size = sizeFor(map);
  return [
    [0, 0],
    [size, size],
  ];
}

/** Nice default initial view: centre of the map, zoom that shows
 *  roughly the whole playfield. */
export function mapCenter(map: MapId): L.LatLngExpression {
  const size = sizeFor(map);
  return [size / 2, size / 2];
}

/** Clamp an (x, z) to the map bounds so drags / clicks never land
 *  outside the playfield. */
export function clampToMap(
  map: MapId,
  x: number,
  z: number,
): { x: number; z: number } {
  const size = sizeFor(map);
  return {
    x: Math.max(0, Math.min(size, x)),
    z: Math.max(0, Math.min(size, z)),
  };
}
