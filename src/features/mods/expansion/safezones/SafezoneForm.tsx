import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type {
  SafezoneKind,
  UnifiedSafezone,
  Vec3,
} from "./safezoneTypes";

interface CirclePatch {
  center?: Vec3;
  radius?: number;
  height?: number; // only for cylinder
}

interface Props {
  zone: UnifiedSafezone;
  onCommit: (patch: CirclePatch) => void;
  /** Parent performs the lossy-ish move between CircleZones[] and
   *  CylinderZones[] arrays; the form only asks for the target kind.
   *  Polygons can't be converted here — they'd need geometric re-
   *  interpretation. */
  onConvertKind: (nextKind: SafezoneKind) => void;
  onDelete: () => void;
}

/** Selected-safezone editor. Circle/cylinder support center + radius
 *  (+ height for cylinder). Polygons are read-only in the form — the
 *  `Positions` list is shown so operators can at least see + delete
 *  them while the visual vertex editor is still a follow-up. */
export function SafezoneForm({
  zone,
  onCommit,
  onConvertKind,
  onDelete,
}: Props) {
  const [x, setX] = useState(String(zone.center[0]));
  const [y, setY] = useState(String(zone.center[1]));
  const [z, setZ] = useState(String(zone.center[2]));
  const [radius, setRadius] = useState(String(zone.radius));
  const [height, setHeight] = useState(String(zone.height));

  useEffect(() => {
    setX(String(zone.center[0]));
    setY(String(zone.center[1]));
    setZ(String(zone.center[2]));
    setRadius(String(zone.radius));
    setHeight(String(zone.height));
  }, [zone.center, zone.radius, zone.height]);

  const commitTriple = (vals: [string, string, string]) => {
    const parsed = vals.map(Number);
    if (parsed.some((n) => !Number.isFinite(n))) return;
    onCommit({ center: parsed as Vec3 });
  };

  const isPolygon = zone.kind === "polygon";

  return (
    <div className="space-y-3 border-t border-border/60 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Type
        </Label>
        <span className="font-medium capitalize">{zone.kind}</span>
        {zone.kind === "circle" ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[10px]"
            onClick={() => onConvertKind("cylinder")}
            title="Preserves centre + radius; adds default 120 m height."
          >
            Convert to cylinder
          </Button>
        ) : null}
        {zone.kind === "cylinder" ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[10px]"
            onClick={() => onConvertKind("circle")}
            title="Preserves centre + radius; drops the height field."
          >
            Convert to circle
          </Button>
        ) : null}
      </div>

      {!isPolygon ? (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            <Axis
              label="X"
              value={x}
              onChange={setX}
              onCommit={() => commitTriple([x, y, z])}
            />
            <Axis
              label="Y"
              value={y}
              step={0.1}
              onChange={setY}
              onCommit={() => commitTriple([x, y, z])}
            />
            <Axis
              label="Z"
              value={z}
              onChange={setZ}
              onCommit={() => commitTriple([x, y, z])}
            />
          </div>
          <Axis
            label="Radius (m)"
            value={radius}
            onChange={setRadius}
            onCommit={() => {
              const n = Number(radius);
              if (Number.isFinite(n) && n > 0) onCommit({ radius: n });
              else setRadius(String(zone.radius));
            }}
          />
          {zone.kind === "cylinder" ? (
            <Axis
              label="Height (m)"
              value={height}
              onChange={setHeight}
              onCommit={() => {
                const n = Number(height);
                if (Number.isFinite(n) && n > 0) onCommit({ height: n });
                else setHeight(String(zone.height));
              }}
            />
          ) : null}
        </>
      ) : (
        <div className="space-y-1.5">
          <Label className="text-[10px]">
            {zone.positions.length} vertices
          </Label>
          <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border/40 bg-muted/20 p-1 font-mono text-[10px]">
            {zone.positions.map((p, i) => (
              <li key={i} className="rounded bg-background/60 px-1.5 py-0.5">
                [{p[0].toFixed(1)}, {p[1].toFixed(1)}, {p[2].toFixed(1)}]
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            Vertex dragging isn't wired yet — delete and redraw the
            polygon to change its shape.
          </p>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete safezone
      </Button>
    </div>
  );
}

function Axis({
  label,
  value,
  step,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  step?: number;
  onChange: (next: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px]">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step ?? 1}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="h-7 font-mono text-xs"
      />
    </div>
  );
}
