import { useMapEvents } from "react-leaflet";

import type { BuildingPlacement } from "@/types/ipc";

import { latLngToDayz } from "./dayzMap";
import { nearestBuildingY } from "./nearestY";

/** Rendered inside MapCanvas while calibration mode is on. Every
 *  click (anywhere — no map-bound clamp) fires the callback with
 *  DayZ coordinates.
 *
 *  When `snapPlacements` is provided, the click snaps to the nearest
 *  `mapgrouppos.xml` placement — used for the "pick real coord from
 *  a known building" step of backdrop calibration: the operator
 *  doesn't need to type numbers, just clicks near a recognisable
 *  structure. Raw click position is used otherwise (and as fallback
 *  when no placements are loaded). */
export function CalibrationClicker({
  onClick,
  snapPlacements,
}: {
  onClick: (pos: { x: number; z: number }) => void;
  snapPlacements?: BuildingPlacement[];
}) {
  useMapEvents({
    click: (e) => {
      const raw = latLngToDayz(e.latlng);
      if (snapPlacements && snapPlacements.length > 0) {
        const snapped = nearestBuildingY(snapPlacements, raw.x, raw.z);
        if (snapped) {
          onClick({ x: snapped.x, z: snapped.z });
          return;
        }
      }
      onClick(raw);
    },
  });
  return null;
}
