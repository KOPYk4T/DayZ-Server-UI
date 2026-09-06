import { sizeFor } from "./dayzMap";
import type { MapId } from "@/types/ipc";

/** One landmark pair captured during calibration. `picked` is the
 *  (x, z) the user clicked on the current (possibly wrong) transform.
 *  `real` is the coordinate the user believes that landmark really
 *  has — typically looked up on iZurvive. */
export interface LandmarkPair {
  picked: { x: number; z: number };
  real: { x: number; z: number };
}

export interface AlignmentFit {
  offsetX: number;
  offsetY: number;
  scale: number;
  /** Approximate error in metres between the two X scales and Z
   *  scales we solved for. Low = square image, safely uniform. High
   *  = the image is stretched non-uniformly, the uniform-scale fit
   *  won't be perfect. Used by the UI to warn the user. */
  asymmetryMetres: number;
}

/**
 * Given two landmark pairs + the previous image transform the clicks
 * were captured under, solve for a new translation + uniform scale
 * that maps the image pixels (mapped via the old transform) to the
 * user's declared real coordinates.
 *
 * Math:
 *
 * The current image transform is
 *   d_clicked = image_fraction * (size * scale_old) + offset_old
 * so
 *   image_fraction = (d_clicked - offset_old) / (size * scale_old)
 *
 * The desired new transform is
 *   d_real = image_fraction * (size * scale_new) + offset_new
 *
 * Sub in image_fraction, and for two pairs we get a 2x2 system
 * solvable for (offset_new, size * scale_new). Solve independently
 * on X and Z then average the scales.
 */
export function fitTwoPoints(
  mapId: MapId,
  pair1: LandmarkPair,
  pair2: LandmarkPair,
  prev: { offsetX: number; offsetY: number; scale: number },
): AlignmentFit | null {
  const size = sizeFor(mapId);
  const sOld = size * prev.scale;

  if (sOld <= 0) return null;

  const f1x = (pair1.picked.x - prev.offsetX) / sOld;
  const f1z = (pair1.picked.z - prev.offsetY) / sOld;
  const f2x = (pair2.picked.x - prev.offsetX) / sOld;
  const f2z = (pair2.picked.z - prev.offsetY) / sOld;

  const dfx = f2x - f1x;
  const dfz = f2z - f1z;

  // Need enough separation between the two landmarks in BOTH axes
  // to solve reliably. If the user picked two points on the same
  // latitude / longitude, one axis's scale is undetermined — bail
  // with a signal the caller can translate into a user error.
  if (Math.abs(dfx) < 1e-4 || Math.abs(dfz) < 1e-4) return null;

  const sNewX = (pair2.real.x - pair1.real.x) / dfx;
  const sNewZ = (pair2.real.z - pair1.real.z) / dfz;

  // Uniform scale: average the two axes. Track asymmetry so the UI
  // can warn if the image is non-square.
  const sNew = (sNewX + sNewZ) / 2;
  const asymmetryMetres = Math.abs(sNewX - sNewZ);

  const newOffsetX = pair1.real.x - f1x * sNew;
  const newOffsetZ = pair1.real.z - f1z * sNew;
  const newScale = sNew / size;

  // Sanity: ignore absurd results (scale < 0.1x or > 10x).
  if (newScale < 0.1 || newScale > 10) return null;
  if (!Number.isFinite(newOffsetX) || !Number.isFinite(newOffsetZ))
    return null;

  return {
    offsetX: newOffsetX,
    offsetY: newOffsetZ,
    scale: newScale,
    asymmetryMetres,
  };
}
