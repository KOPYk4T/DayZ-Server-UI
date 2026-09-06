/**
 * DayZ-Expansion safezone config. One file per mission at
 * `mpmissions/<map>/expansion/settings/SafeZoneSettings.json` — all
 * three shape kinds (circle, cylinder, polygon) live inside it.
 *
 * Reference: `[Server-Hosting]-SafeZoneSettings.md` in the wiki.
 *
 * Unknown fields round-trip via `[extra: string]: unknown` so
 * mod-added keys survive a save.
 */

export type Vec3 = [number, number, number];

export interface CircleSafezone {
  Center: Vec3;
  Radius: number;
  [extra: string]: unknown;
}

export interface CylinderSafezone {
  Center: Vec3;
  Radius: number;
  Height: number;
  [extra: string]: unknown;
}

export interface PolygonSafezone {
  Positions: Vec3[];
  [extra: string]: unknown;
}

export interface SafezoneSettings {
  m_Version: number;
  Enabled: 0 | 1;
  FrameRateCheckSafeZoneInMs: number;
  CircleZones: CircleSafezone[];
  CylinderZones: CylinderSafezone[];
  PolygonZones: PolygonSafezone[];
  ActorsPerTick: number;
  DisableVehicleDamageInSafeZone: 0 | 1;
  EnableForceSZCleanup: 0 | 1;
  ItemLifetimeInSafeZone: number;
  EnableForceSZCleanupVehicles: 0 | 1;
  VehicleLifetimeInSafeZone: number;
  ForceSZCleanup_ExcludedItems: string[];
  [extra: string]: unknown;
}

export const DEFAULT_SAFEZONE_SETTINGS: SafezoneSettings = {
  m_Version: 6,
  Enabled: 1,
  FrameRateCheckSafeZoneInMs: 0,
  CircleZones: [],
  CylinderZones: [],
  PolygonZones: [],
  ActorsPerTick: 100,
  DisableVehicleDamageInSafeZone: 1,
  EnableForceSZCleanup: 0,
  ItemLifetimeInSafeZone: 3600,
  EnableForceSZCleanupVehicles: 0,
  VehicleLifetimeInSafeZone: 3600,
  ForceSZCleanup_ExcludedItems: [],
};

/** Unified shape the UI lists + renders. Keeps the source array and
 *  original index so edits project back to the right slot without
 *  ambiguity even when two zones have the same centre. */
export type SafezoneKind = "circle" | "cylinder" | "polygon";

export interface SafezoneHandleRef {
  kind: SafezoneKind;
  index: number;
}

export interface UnifiedSafezone extends SafezoneHandleRef {
  /** `[X, Y, Z]` of the visual centre — for polygons this is the
   *  centroid of the `Positions`. */
  center: Vec3;
  /** Only meaningful for circle/cylinder — polygon uses 0. */
  radius: number;
  /** Cylinder only, otherwise 0. */
  height: number;
  /** Polygon only. */
  positions: Vec3[];
}

export function unifySafezones(s: SafezoneSettings): UnifiedSafezone[] {
  const out: UnifiedSafezone[] = [];
  s.CircleZones.forEach((z, i) =>
    out.push({
      kind: "circle",
      index: i,
      center: z.Center,
      radius: z.Radius,
      height: 0,
      positions: [],
    }),
  );
  s.CylinderZones.forEach((z, i) =>
    out.push({
      kind: "cylinder",
      index: i,
      center: z.Center,
      radius: z.Radius,
      height: z.Height,
      positions: [],
    }),
  );
  s.PolygonZones.forEach((z, i) =>
    out.push({
      kind: "polygon",
      index: i,
      center: centroid(z.Positions),
      radius: 0,
      height: 0,
      positions: z.Positions,
    }),
  );
  return out;
}

function centroid(points: Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of points) {
    sx += p[0];
    sy += p[1];
    sz += p[2];
  }
  const n = points.length;
  return [sx / n, sy / n, sz / n];
}

export function parseSafezoneSettings(raw: string): SafezoneSettings {
  const parsed = JSON.parse(raw) as Partial<SafezoneSettings>;
  return {
    ...DEFAULT_SAFEZONE_SETTINGS,
    ...parsed,
    CircleZones: parsed.CircleZones ?? [],
    CylinderZones: parsed.CylinderZones ?? [],
    PolygonZones: parsed.PolygonZones ?? [],
    ForceSZCleanup_ExcludedItems: parsed.ForceSZCleanup_ExcludedItems ?? [],
  } as SafezoneSettings;
}

export function serializeSafezoneSettings(s: SafezoneSettings): string {
  return JSON.stringify(s, null, 4);
}
