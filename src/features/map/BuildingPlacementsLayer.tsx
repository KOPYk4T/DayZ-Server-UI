import { useEffect, useMemo, useState } from "react";
import { renderToString } from "react-dom/server";
import L from "leaflet";
import {
  Anchor,
  Building2,
  Circle,
  Cross,
  Factory,
  Flame,
  GraduationCap,
  Home,
  Lock,
  Shield,
  ShieldCheck,
  Trees,
  Wheat,
} from "lucide-react";
import {
  CircleMarker,
  Marker,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

import type {
  BuildingPlacement,
  BuildingPrototype,
} from "@/types/ipc";

import { dayzToLatLng } from "./dayzMap";
import { colorForUsage, dominantUsage } from "./layerColors";
import type { BuildingPlacementsLayerState } from "./types";

interface Props {
  placements: BuildingPlacement[];
  prototypes: BuildingPrototype[];
  state: BuildingPlacementsLayerState;
  // When set, marker/dot clicks fire this with the clicked placement.
  // Used by backdrop calibration so the operator picks a building
  // directly rather than relying on a nearest-neighbour snap from a
  // freeform map click (Leaflet markers swallow map clicks, so without
  // this the click does nothing).
  onPlacementClick?: (p: BuildingPlacement) => void;
}

/** When the user zooms past this level, swap the Canvas dots for
 *  DOM-based SVG icons per placement. Leaflet zoom is logarithmic;
 *  at zoom 0 we're at 1 px per DayZ metre (buildings become visible
 *  as distinct shapes). Below that, dots are more readable than
 *  trying to jam a 16px icon per building. */
const ICON_ZOOM_THRESHOLD = 0;

const USAGE_ICON: Record<
  string,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  Military: Shield,
  Police: ShieldCheck,
  Prison: Lock,
  Firefighter: Flame,
  Medic: Cross,
  School: GraduationCap,
  Industrial: Factory,
  Town: Building2,
  Village: Home,
  Farm: Wheat,
  Hunting: Trees,
  Coast: Anchor,
};

/** Leaflet `DivIcon`s are expensive to construct (each one inlines
 *  SVG markup), so we memoise per `(usage, colour)` pair. With ~12
 *  usage zones × a fixed palette that's about a dozen entries for
 *  the whole app lifetime. */
const ICON_CACHE = new Map<string, L.DivIcon>();

function iconFor(usage: string | null, color: string): L.DivIcon {
  const key = `${usage ?? "__unknown__"}::${color}`;
  const cached = ICON_CACHE.get(key);
  if (cached) return cached;
  const Component = (usage && USAGE_ICON[usage]) || Circle;
  const svg = renderToString(<Component size={14} color={color} />);
  const icon = L.divIcon({
    className: "dzcm-placement-icon",
    html: `<div style="color:${color};display:flex;align-items:center;justify-content:center;width:16px;height:16px;filter:drop-shadow(0 0 1px rgba(0,0,0,0.6));">${svg}</div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  ICON_CACHE.set(key, icon);
  return icon;
}

export function BuildingPlacementsLayer({
  placements,
  prototypes,
  state,
  onPlacementClick,
}: Props) {
  const map = useMap();

  // Shared Canvas renderer for the zoomed-out dot mode. One draw
  // pass for ~11k circles instead of 11k SVG nodes.
  const renderer = useMemo(() => L.canvas({ padding: 0.2 }), []);
  useEffect(() => {
    return () => {
      map.removeLayer(renderer);
    };
  }, [map, renderer]);

  // Track zoom + bounds so we can pick the right render mode and
  // cull offscreen placements when we're in icon mode.
  const [zoom, setZoom] = useState(map.getZoom());
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(map.getBounds());

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
      setBounds(map.getBounds());
    },
    moveend: () => {
      setBounds(map.getBounds());
    },
  });

  const protoByName = useMemo(() => {
    const m = new Map<string, BuildingPrototype>();
    prototypes.forEach((p) => m.set(p.name, p));
    return m;
  }, [prototypes]);

  const iconMode = zoom >= ICON_ZOOM_THRESHOLD;

  const visible = useMemo(() => {
    if (!state.enabled) return [];
    type Vis = {
      p: BuildingPlacement;
      color: string;
      usage: string | null;
      proto: BuildingPrototype | undefined;
      key: string;
    };
    const out: Vis[] = [];
    placements.forEach((p, idx) => {
      const proto = protoByName.get(p.name);
      const usages = proto?.usages ?? [];
      if (state.usageFilter && !usages.includes(state.usageFilter)) return;
      const usage = dominantUsage(usages);
      const color = colorForUsage(usage);

      // In icon mode we cull aggressively to the viewport — SVG
      // divIcons are DOM nodes and we don't want 11k of them
      // sitting in the tree just because they COULD be on-screen.
      if (iconMode && bounds) {
        const ll = dayzToLatLng(p.x, p.z);
        if (!bounds.contains(ll)) return;
      }

      out.push({ p, color, usage, proto, key: `${idx}:${p.name}` });
    });
    return out;
  }, [
    placements,
    protoByName,
    state.enabled,
    state.usageFilter,
    iconMode,
    bounds,
  ]);

  if (!state.enabled) return null;

  if (iconMode) {
    return (
      <>
        {visible.map(({ p, color, usage, proto, key }) => (
          <Marker
            key={key}
            position={dayzToLatLng(p.x, p.z)}
            icon={iconFor(usage, color)}
            keyboard={false}
            eventHandlers={
              onPlacementClick
                ? { click: () => onPlacementClick(p) }
                : undefined
            }
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              <BuildingTooltip
                name={p.name}
                usages={proto?.usages ?? []}
                categories={proto?.categories ?? []}
                tags={proto?.tags ?? []}
                pointCount={proto?.pointCount ?? 0}
                x={p.x}
                z={p.z}
              />
            </Tooltip>
          </Marker>
        ))}
      </>
    );
  }

  return (
    <>
      {visible.map(({ p, color, key }) => (
        <CircleMarker
          key={key}
          center={dayzToLatLng(p.x, p.z)}
          radius={2}
          pathOptions={{
            renderer,
            color,
            fillColor: color,
            fillOpacity: 0.85,
            weight: 0,
          }}
          eventHandlers={
            onPlacementClick
              ? { click: () => onPlacementClick(p) }
              : undefined
          }
        />
      ))}
    </>
  );
}

function BuildingTooltip({
  name,
  usages,
  categories,
  tags,
  pointCount,
  x,
  z,
}: {
  name: string;
  usages: string[];
  categories: string[];
  tags: string[];
  pointCount: number;
  x: number;
  z: number;
}) {
  return (
    <div className="space-y-1 text-[11px] leading-snug">
      <div className="font-mono text-[11px] font-semibold">{name}</div>
      <div className="text-[10px] text-muted-foreground tabular-nums">
        x={x.toFixed(0)} z={z.toFixed(0)} · {pointCount} loot point
        {pointCount === 1 ? "" : "s"}
      </div>
      {usages.length > 0 ? (
        <div>
          <span className="text-[10px] uppercase text-muted-foreground">
            Usage:
          </span>{" "}
          {usages.join(", ")}
        </div>
      ) : null}
      {categories.length > 0 ? (
        <div>
          <span className="text-[10px] uppercase text-muted-foreground">
            Categories:
          </span>{" "}
          {categories.join(", ")}
        </div>
      ) : null}
      {tags.length > 0 ? (
        <div>
          <span className="text-[10px] uppercase text-muted-foreground">
            Tags:
          </span>{" "}
          {tags.join(", ")}
        </div>
      ) : null}
      {usages.length === 0 &&
      categories.length === 0 &&
      tags.length === 0 ? (
        <div className="italic text-muted-foreground">
          No prototype metadata — mod building?
        </div>
      ) : null}
    </div>
  );
}
