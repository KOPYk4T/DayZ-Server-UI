import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { cn } from "@/lib/utils";
import type { MapId } from "@/types/ipc";

import {
  MAP_LABEL,
  sizeFor,
  dayzToLatLng,
  latLngToDayz,
  mapBounds,
  mapCenter,
} from "./dayzMap";

import "leaflet/dist/leaflet.css";
import "./map.css";

interface MapCanvasProps {
  mapId: MapId;
  /** Invoked when the user left-clicks on empty map. Coordinates are
   *  DayZ (x, z) and clamped to the map extent. */
  onMapClick?: (pos: { x: number; z: number }) => void;
  /** Starting centre. When omitted, `mapCenter(mapId)` is used.
   *  Consumed only on first render — Leaflet doesn't re-centre from
   *  prop changes, so use this to restore a persisted viewport. */
  initialCenter?: L.LatLngExpression;
  /** Starting zoom. Defaults to -3 (roughly one-screen view of a
   *  12–15km map on a 1080p screen). */
  initialZoom?: number;
  /** Fires on `moveend` / `zoomend` so callers can persist the
   *  viewport. Coordinates are raw Leaflet lat/lng in CRS.Simple
   *  space. */
  onViewportChange?: (view: { lat: number; lng: number; zoom: number }) => void;
  /** Render-prop for layers. Children receive the map instance
   *  implicitly via the react-leaflet context — no prop needed. */
  children?: React.ReactNode;
  className?: string;
}

export function MapCanvas({
  mapId,
  onMapClick,
  initialCenter,
  initialZoom,
  onViewportChange,
  children,
  className,
}: MapCanvasProps) {
  const size = sizeFor(mapId);
  const bounds = useMemo(() => mapBounds(mapId), [mapId]);
  const defaultCenter = useMemo(() => mapCenter(mapId), [mapId]);

  // Pick a minZoom that fits the whole playfield in a reasonable-sized
  // viewport. Simple CRS scales by `2^zoom` pixels per DayZ-metre, so
  // at zoom=-4 one pixel covers 16 metres — Chernarus fills ~960px
  // which is small but workable. Users can zoom back in.
  const minZoom = -4;
  const maxZoom = 3;

  return (
    <MapContainer
      className={cn("h-full w-full bg-muted/30", className)}
      crs={L.CRS.Simple}
      center={initialCenter ?? defaultCenter}
      zoom={initialZoom ?? -3}
      minZoom={minZoom}
      maxZoom={maxZoom}
      maxBounds={bounds}
      maxBoundsViscosity={1.0}
      attributionControl={false}
      zoomControl={true}
    >
      <GridOverlay size={size} />
      <CoordReadout mapId={mapId} />
      <ClickHandler onMapClick={onMapClick} mapId={mapId} />
      {onViewportChange ? (
        <ViewportReporter onChange={onViewportChange} />
      ) : null}
      {children}
    </MapContainer>
  );
}

/** Subscribes to Leaflet move/zoom end events and forwards the new
 *  viewport to the parent. Lives inside `<MapContainer>` because
 *  `useMapEvents` needs the react-leaflet context. */
function ViewportReporter({
  onChange,
}: {
  onChange: (view: { lat: number; lng: number; zoom: number }) => void;
}) {
  useMapEvents({
    moveend: (e) => {
      const c = e.target.getCenter();
      onChange({ lat: c.lat, lng: c.lng, zoom: e.target.getZoom() });
    },
    zoomend: (e) => {
      const c = e.target.getCenter();
      onChange({ lat: c.lat, lng: c.lng, zoom: e.target.getZoom() });
    },
  });
  return null;
}

// ---------- Grid overlay ----------

/** Draws a 1000m grid always, and a 100m grid at higher zoom levels.
 *  Labels in the margin every 1000m for quick mental mapping. */
function GridOverlay({ size }: { size: number }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const handler = () => setZoom(map.getZoom());
    map.on("zoomend", handler);
    return () => {
      map.off("zoomend", handler);
    };
  }, [map]);

  const majorLines = useMemo(() => {
    const out: { id: string; coords: [number, number][] }[] = [];
    for (let v = 0; v <= size; v += 1000) {
      out.push({
        id: `v-${v}`,
        coords: [
          [0, v],
          [size, v],
        ],
      });
      out.push({
        id: `h-${v}`,
        coords: [
          [v, 0],
          [v, size],
        ],
      });
    }
    return out;
  }, [size]);

  const minorLines = useMemo(() => {
    if (zoom < 0) return [];
    const out: { id: string; coords: [number, number][] }[] = [];
    for (let v = 0; v <= size; v += 100) {
      if (v % 1000 === 0) continue;
      out.push({
        id: `v-${v}`,
        coords: [
          [0, v],
          [size, v],
        ],
      });
      out.push({
        id: `h-${v}`,
        coords: [
          [v, 0],
          [v, size],
        ],
      });
    }
    return out;
  }, [size, zoom]);

  const labelIcon = (text: string) =>
    L.divIcon({
      className: "dayz-grid-label",
      html: `<span>${text}</span>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    });

  // Labels as divIcon markers at the southern edge every 1000m.
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    for (let v = 0; v <= size; v += 1000) {
      L.marker(dayzToLatLng(v, 0), {
        icon: labelIcon(`${v}`),
        interactive: false,
        keyboard: false,
      }).addTo(group);
      L.marker(dayzToLatLng(0, v), {
        icon: labelIcon(`${v}`),
        interactive: false,
        keyboard: false,
      }).addTo(group);
    }
    return () => {
      map.removeLayer(group);
    };
  }, [map, size]);

  return (
    <>
      {minorLines.map((l) => (
        <Polyline
          key={l.id}
          positions={l.coords}
          pathOptions={{
            color: "#64748b",
            weight: 0.4,
            opacity: 0.3,
          }}
          interactive={false}
        />
      ))}
      {majorLines.map((l) => (
        <Polyline
          key={l.id}
          positions={l.coords}
          pathOptions={{
            color: "#64748b",
            weight: 0.8,
            opacity: 0.55,
          }}
          interactive={false}
        />
      ))}
    </>
  );
}

// ---------- Coordinate readout ----------

function CoordReadout({ mapId }: { mapId: MapId }) {
  const [pos, setPos] = useState<{ x: number; z: number } | null>(null);
  useMapEvents({
    mousemove: (e) => {
      setPos(latLngToDayz(e.latlng));
    },
    mouseout: () => setPos(null),
  });
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded-md bg-background/85 px-2 py-1 text-[11px] font-mono tabular-nums shadow-sm">
      <span className="text-muted-foreground">{MAP_LABEL[mapId]}</span>
      {" · "}
      {pos ? (
        <>
          x={pos.x.toFixed(0)} z={pos.z.toFixed(0)}
        </>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}

// ---------- Click handler ----------

function ClickHandler({
  onMapClick,
  mapId,
}: {
  onMapClick?: (pos: { x: number; z: number }) => void;
  mapId: MapId;
}) {
  useMapEvents({
    click: (e) => {
      if (!onMapClick) return;
      const { x, z } = latLngToDayz(e.latlng);
      const size = sizeFor(mapId);
      if (x < 0 || z < 0 || x > size || z > size) return;
      onMapClick({ x, z });
    },
  });
  return null;
}
