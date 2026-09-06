import type { BuildingPlacement } from "@/types/ipc";

export interface PointY {
  x: number;
  y: number;
  z: number;
}

/** Find the elevation (`y`) of the building placement nearest to a
 *  given `(x, z)`. Used by the Expansion placement editors so that
 *  dropping a pin auto-suggests a sensible height — the operator can
 *  always nudge it by hand. Returns `null` when there are no
 *  placements loaded for the current profile (e.g. `mapgrouppos.xml`
 *  isn't in the workspace yet). Linear scan: ~11k placements on
 *  Chernarus is ~0.3 ms, well under a frame. */
export function nearestBuildingY(
  placements: BuildingPlacement[] | null | undefined,
  x: number,
  z: number,
): PointY | null {
  if (!placements || placements.length === 0) return null;
  let best: PointY | null = null;
  let bestSq = Infinity;
  for (const p of placements) {
    const dx = p.x - x;
    const dz = p.z - z;
    const sq = dx * dx + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      best = { x: p.x, y: p.y, z: p.z };
    }
  }
  return best;
}

/** Generic "nearest y from a sibling point cloud". Used by event-
 *  spawn click-to-add: when the user adds a new vehicle spawn to an
 *  event, prefer the y of the nearest existing position in the same
 *  event (already vetted by Bohemia / prior operator edits) over a
 *  generic building elevation. Returns `null` when the cloud is
 *  empty so the caller can fall back to the building scan. */
export function nearestPositionY(
  points: ReadonlyArray<{ x: number; y: number; z: number }> | null | undefined,
  x: number,
  z: number,
): number | null {
  if (!points || points.length === 0) return null;
  let bestY: number | null = null;
  let bestSq = Infinity;
  for (const p of points) {
    const dx = p.x - x;
    const dz = p.z - z;
    const sq = dx * dx + dz * dz;
    if (sq < bestSq) {
      bestSq = sq;
      bestY = p.y;
    }
  }
  return bestY;
}
