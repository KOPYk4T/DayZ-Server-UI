import { useMemo } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type L from "leaflet";
import { ImageOverlay } from "react-leaflet";

import type { MapId } from "@/types/ipc";

import { sizeFor } from "./dayzMap";

/** Single-image backdrop for the DayZ map canvas. User-supplied —
 *  the app deliberately doesn't bundle any imagery. Expected input:
 *  a roughly-square PNG/JPG (2k–8k resolution is fine). By default
 *  the image stretches to cover the full `0..size` playfield; the
 *  `offsetX` / `offsetY` / `scale` props let users fine-tune
 *  alignment because iZurvive / satellite exports usually include
 *  padding (sea, out-of-bounds) that doesn't line up 1:1. */
interface Props {
  mapId: MapId;
  imagePath: string;
  opacity: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export function BackgroundImageLayer({
  mapId,
  imagePath,
  opacity,
  offsetX,
  offsetY,
  scale,
}: Props) {
  // Tauri's asset protocol — `convertFileSrc` turns an absolute path
  // into a URL the webview can load under the sandbox.
  const url = useMemo(() => convertFileSrc(imagePath), [imagePath]);

  const bounds = useMemo<L.LatLngBoundsExpression>(() => {
    const size = sizeFor(mapId);
    // Scale applies around the origin (0, 0). Offset shifts the
    // stretched image by raw metres. Combining both lets the user
    // pan + zoom the image independently of the playfield.
    const stretched = size * scale;
    return [
      [offsetY, offsetX],
      [offsetY + stretched, offsetX + stretched],
    ];
  }, [mapId, offsetX, offsetY, scale]);

  // ImageOverlay's `bounds` prop reruns the stretch whenever bounds
  // change — key'd on the combined transform so React reconciles a
  // fresh overlay instance if needed.
  return (
    <ImageOverlay
      key={`${offsetX}:${offsetY}:${scale}`}
      url={url}
      bounds={bounds}
      opacity={opacity}
    />
  );
}
