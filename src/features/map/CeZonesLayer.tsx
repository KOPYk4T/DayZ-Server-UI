import { useMemo } from "react";
import { ImageOverlay } from "react-leaflet";

import type { CeZoneOverlay, MapId } from "@/types/ipc";

import { mapBounds } from "./dayzMap";

interface Props {
  overlays: CeZoneOverlay[];
  /** Set of zone names currently enabled. Missing → hidden. */
  enabled: Set<string>;
  /** Shared across all enabled layers, 0..1. */
  opacity: number;
  mapId: MapId;
}

/** Renders CE tier / usage overlays as semi-transparent raster
 *  layers on the Leaflet canvas. The backend parses `areaflags.map`
 *  and hands us one pre-tinted PNG per mask as a base64 data URL —
 *  we just stack the ones currently enabled.
 *
 *  `interactive={false}` lets clicks fall through to the markers
 *  underneath. These overlays are a display-only aid; they should
 *  never steal a drag or a selection click. */
export function CeZonesLayer({ overlays, enabled, opacity, mapId }: Props) {
  const bounds = useMemo(() => mapBounds(mapId), [mapId]);
  return (
    <>
      {overlays
        .filter((o) => enabled.has(o.name))
        .map((o) => (
          <ImageOverlay
            key={o.name}
            url={o.pngDataUrl}
            bounds={bounds}
            opacity={opacity}
            zIndex={150}
            interactive={false}
          />
        ))}
    </>
  );
}
