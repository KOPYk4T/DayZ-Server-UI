import { useMemo, useRef } from "react";
import L from "leaflet";
import { Marker, Tooltip } from "react-leaflet";

import type { MapId } from "@/types/ipc";

import { clampToMap, dayzToLatLng } from "./dayzMap";
import { QUEST_NPC_COLOR, QUEST_NPC_COLOR_SELECTED } from "./layerColors";

export interface QuestNpcHandle {
  /** Workspace-relative path to the NPC JSON — used by callers to
   *  map a drag back to the right file. */
  path: string;
  /** The NPC's integer ID field; rendered in the tooltip so
   *  operators cross-reference quest giver / turn-in IDs at a
   *  glance. */
  id: number;
  name: string;
  /** `[X, Y, Z]` world metres; Y isn't painted on the flat map but
   *  round-trips through drag-end so altitude doesn't clobber. */
  position: [number, number, number];
  /** Active on boot. Inactive NPCs render at half opacity. */
  active: boolean;
}

interface Props {
  handles: QuestNpcHandle[];
  mapId: MapId;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onMove: (
    path: string,
    next: { x: number; y: number; z: number },
  ) => void;
}

/** Pin layer for Quest NPCs. One purple pin per NPC, labelled with
 *  its name. Draggable — drag-end hands the new `(x, z)` back to
 *  the caller which is expected to snap Y from nearest building. */
export function QuestNpcsLayer({
  handles,
  mapId,
  selectedPath,
  onSelect,
  onMove,
}: Props) {
  return (
    <>
      {handles.map((h) => (
        <NpcMarker
          key={h.path}
          handle={h}
          mapId={mapId}
          selected={h.path === selectedPath}
          onSelect={() => onSelect(h.path)}
          onMove={(next) => onMove(h.path, next)}
        />
      ))}
    </>
  );
}

function NpcMarker({
  handle,
  mapId,
  selected,
  onSelect,
  onMove,
}: {
  handle: QuestNpcHandle;
  mapId: MapId;
  selected: boolean;
  onSelect: () => void;
  onMove: (next: { x: number; y: number; z: number }) => void;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const color = selected ? QUEST_NPC_COLOR_SELECTED : QUEST_NPC_COLOR;
  const size = selected ? 14 : 10;
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: `<div class="dayz-marker" style="background:${color};width:${size}px;height:${size}px;border:2px solid ${selected ? "#ffffff" : "rgba(255,255,255,0.6)"};box-shadow:0 0 0 1px ${color};${handle.active ? "" : "opacity:0.5;"}"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    [color, size, selected, handle.active],
  );
  return (
    <Marker
      position={dayzToLatLng(handle.position[0], handle.position[2])}
      icon={icon}
      draggable
      eventHandlers={{
        add: (e) => {
          markerRef.current = e.target as L.Marker;
        },
        click: onSelect,
        dragstart: onSelect,
        dragend: (e) => {
          const m = e.target as L.Marker;
          const clamped = clampToMap(
            mapId,
            m.getLatLng().lng,
            m.getLatLng().lat,
          );
          m.setLatLng(dayzToLatLng(clamped.x, clamped.z));
          onMove({ x: clamped.x, y: handle.position[1], z: clamped.z });
        },
      }}
    >
      <Tooltip
        direction="top"
        offset={[0, -4]}
        opacity={0.9}
        permanent={selected}
      >
        #{handle.id} {handle.name || "(unnamed)"}
      </Tooltip>
    </Marker>
  );
}
