import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { LayersState, MapSectionId } from "@/features/map/types";

/** Per-profile map canvas settings — things that only make sense on
 *  this workstation (a file path on local disk can't travel with the
 *  profile), so they live in localStorage, not in the profile CRUD. */
export interface MapProfileSettings {
  /** Absolute path to a user-supplied backdrop image (Chernarus
   *  satellite / topo render / whatever). `undefined` = no backdrop,
   *  grid only. */
  imagePath?: string;
  /** 0..1. Applied to the Leaflet ImageOverlay so the grid stays
   *  visible through the image. */
  imageOpacity: number;
  /** Metres to shift the image on the Leaflet canvas relative to the
   *  playfield origin (0, 0). Needed because iZurvive / satellite
   *  exports typically include padding (sea, out-of-bounds) so the
   *  playfield doesn't align 1:1 with the image. */
  imageOffsetX: number;
  imageOffsetY: number;
  /** Multiplier on the image bounds size. 1.0 = image stretches over
   *  the full playfield size; >1 zooms the image out, <1 zooms it
   *  in. Typical iZurvive needs ~1.1–1.2 to compensate for padding. */
  imageScale: number;
  /** Last-viewed map viewport (Leaflet CRS.Simple lat/lng + zoom).
   *  Captured on every `moveend` / `zoomend` so leaving the page and
   *  coming back lands the operator back where they were. */
  viewport?: { lat: number; lng: number; zoom: number };
  /** Last-used layer visibility + per-layer filters. `undefined`
   *  falls back to `DEFAULT_LAYERS`. */
  layers?: LayersState;
  /** Which sidebar sections are collapsed. Absent key = expanded
   *  (the default) so new sections show up without a migration. */
  collapsedSections?: Partial<Record<MapSectionId, boolean>>;
}

interface State {
  byProfile: Record<string, MapProfileSettings>;
  get: (profileId: string) => MapProfileSettings;
  setImage: (profileId: string, path: string | undefined) => void;
  setOpacity: (profileId: string, opacity: number) => void;
  setOffset: (profileId: string, x: number, y: number) => void;
  setScale: (profileId: string, scale: number) => void;
  resetAlignment: (profileId: string) => void;
  setViewport: (
    profileId: string,
    viewport: { lat: number; lng: number; zoom: number },
  ) => void;
  setLayers: (profileId: string, layers: LayersState) => void;
  setSectionCollapsed: (
    profileId: string,
    section: MapSectionId,
    collapsed: boolean,
  ) => void;
}

const DEFAULT: MapProfileSettings = {
  imagePath: undefined,
  imageOpacity: 0.7,
  imageOffsetX: 0,
  imageOffsetY: 0,
  imageScale: 1,
};

/** Merge stored settings with defaults so old entries saved before
 *  the alignment fields existed keep working. */
function withDefaults(
  partial: Partial<MapProfileSettings> | undefined,
): MapProfileSettings {
  return { ...DEFAULT, ...(partial ?? {}) };
}

export const useMapSettingsStore = create<State>()(
  persist(
    (set, getState) => ({
      byProfile: {},
      get: (profileId) => withDefaults(getState().byProfile[profileId]),
      setImage: (profileId, path) =>
        set((s) => ({
          byProfile: {
            ...s.byProfile,
            [profileId]: {
              ...withDefaults(s.byProfile[profileId]),
              imagePath: path,
            },
          },
        })),
      setOpacity: (profileId, opacity) =>
        set((s) => ({
          byProfile: {
            ...s.byProfile,
            [profileId]: {
              ...withDefaults(s.byProfile[profileId]),
              imageOpacity: Math.max(0, Math.min(1, opacity)),
            },
          },
        })),
      setOffset: (profileId, x, y) =>
        set((s) => ({
          byProfile: {
            ...s.byProfile,
            [profileId]: {
              ...withDefaults(s.byProfile[profileId]),
              imageOffsetX: x,
              imageOffsetY: y,
            },
          },
        })),
      setScale: (profileId, scale) =>
        set((s) => ({
          byProfile: {
            ...s.byProfile,
            [profileId]: {
              ...withDefaults(s.byProfile[profileId]),
              // Clamp below 0.1 and above 10 to avoid absurd
              // transforms that lock the UI — user can still type
              // sane extremes like 0.5 or 2.0.
              imageScale: Math.max(0.1, Math.min(10, scale)),
            },
          },
        })),
      resetAlignment: (profileId) =>
        set((s) => ({
          byProfile: {
            ...s.byProfile,
            [profileId]: {
              ...withDefaults(s.byProfile[profileId]),
              imageOffsetX: 0,
              imageOffsetY: 0,
              imageScale: 1,
            },
          },
        })),
      setViewport: (profileId, viewport) =>
        set((s) => {
          const prev = withDefaults(s.byProfile[profileId]);
          const pv = prev.viewport;
          // Skip writes when nothing meaningfully changed. Leaflet's
          // moveend fires on hover / resize / tiny pan — debouncing
          // the localStorage writes keeps Redux devtools quiet and
          // the persist cost near zero.
          if (
            pv &&
            Math.abs(pv.lat - viewport.lat) < 0.001 &&
            Math.abs(pv.lng - viewport.lng) < 0.001 &&
            pv.zoom === viewport.zoom
          ) {
            return s;
          }
          return {
            byProfile: {
              ...s.byProfile,
              [profileId]: { ...prev, viewport },
            },
          };
        }),
      setLayers: (profileId, layers) =>
        set((s) => {
          const prev = withDefaults(s.byProfile[profileId]);
          if (JSON.stringify(prev.layers) === JSON.stringify(layers)) {
            return s;
          }
          return {
            byProfile: {
              ...s.byProfile,
              [profileId]: { ...prev, layers },
            },
          };
        }),
      setSectionCollapsed: (profileId, section, collapsed) =>
        set((s) => {
          const prev = withDefaults(s.byProfile[profileId]);
          const curr = prev.collapsedSections ?? {};
          // Skip writes when the state is already what we'd set —
          // avoids spamming localStorage on repeated clicks.
          if ((curr[section] ?? false) === collapsed) return s;
          const nextCollapsed = { ...curr, [section]: collapsed };
          return {
            byProfile: {
              ...s.byProfile,
              [profileId]: {
                ...prev,
                collapsedSections: nextCollapsed,
              },
            },
          };
        }),
    }),
    { name: "dzcm.map-settings" },
  ),
);
