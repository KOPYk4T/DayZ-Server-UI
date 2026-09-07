import { useEffect } from "react";
import { useMap } from "react-leaflet";

import type { EventSpawnGroup, PlayerSpawnPoints } from "@/types/ipc";

import { dayzToLatLng } from "./dayzMap";
import type { PlayerSpawnKind } from "./types";

/** Re-centres on a specific spawn when `focusKey` changes (kind+index).
 *  Ignores later x/z updates so dragging the same pin doesn't fight
 *  the camera. */
export function useFlyToSpawnAt(
  pos: { x: number; z: number } | null,
  focusKey: string | null,
  zoom = 0,
) {
  const map = useMap();
  useEffect(() => {
    if (!pos || !focusKey) return;
    map.flyTo(dayzToLatLng(pos.x, pos.z), Math.max(map.getZoom(), zoom), {
      duration: 0.35,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
}

/** Re-centres the Leaflet map on the first marker of the requested
 *  kind. Used when the user lands on the map via a "show on map"
 *  deep-link. Split into its own file so it lives next to components
 *  but doesn't break react-refresh (which wants components-only
 *  files). */
export function useFlyToSpawn(
  data: PlayerSpawnPoints | null,
  kind: PlayerSpawnKind | null,
  zoom = 0,
) {
  const map = useMap();
  useEffect(() => {
    if (!data || !kind) return;
    const list = data[kind];
    if (list.length === 0) return;
    const first = list[0];
    map.flyTo(dayzToLatLng(first.x, first.z), zoom, { duration: 0.4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, kind]);
}

/** Flies to the centroid of positions for a given event name. Used
 *  by the "Show on map" deep-link from the Events drawer. */
export function useFlyToEvent(
  spawns: EventSpawnGroup[],
  eventName: string | null,
  zoom = -1,
) {
  const map = useMap();
  useEffect(() => {
    if (!eventName) return;
    const group = spawns.find((g) => g.eventName === eventName);
    if (!group || group.positions.length === 0) return;
    const sumX =
      group.positions.reduce((acc, p) => acc + p.x, 0) / group.positions.length;
    const sumZ =
      group.positions.reduce((acc, p) => acc + p.z, 0) / group.positions.length;
    map.flyTo(dayzToLatLng(sumX, sumZ), zoom, { duration: 0.4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawns, eventName]);
}
