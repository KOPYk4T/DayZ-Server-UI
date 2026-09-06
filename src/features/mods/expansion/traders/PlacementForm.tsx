import { useEffect, useState } from "react";
import { MapPin, Trash2 } from "lucide-react";

import { ClassnamePicker } from "@/components/ClassnamePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TraderPlacement } from "@/types/ipc";

import { ALL_TRADER_ENTITY_CLASSES } from "./traderEntityClasses";
import { GearTokensField } from "./GearTokensField";

interface Props {
  placement: TraderPlacement;
  nearestY: number | null;
  knownTraderFiles: string[];
  /** Called only after blur / Enter / Apply — never on mid-typing
   *  state, so the backend never sees an intermediate invalid
   *  snapshot. */
  onCommit: (patch: Partial<TraderPlacement>) => void;
  onDelete: () => void;
}

/** Side-panel editor for one trader placement. Holds its own local
 *  state so keystrokes don't trip the auto-save path; commits on
 *  blur (numbers) or explicit Apply (dropdowns).
 *
 *  Mount with `key={placementId}` so switching selection gets a
 *  fresh, in-sync draft. */
export function PlacementForm({
  placement,
  nearestY,
  knownTraderFiles,
  onCommit,
  onDelete,
}: Props) {
  const [entityClass, setEntityClass] = useState(placement.entityClass);
  const [traderFile, setTraderFile] = useState(placement.traderFile);
  const [px, setPx] = useState(String(placement.position[0]));
  const [py, setPy] = useState(String(placement.position[1]));
  const [pz, setPz] = useState(String(placement.position[2]));
  const [yaw, setYaw] = useState(String(placement.orientation[0]));
  const [pitch, setPitch] = useState(String(placement.orientation[1]));
  const [roll, setRoll] = useState(String(placement.orientation[2]));

  // Sync the position drafts when the pin is dragged on the map —
  // the `key` prop handles fresh selections; this effect handles
  // in-place mutations caused by the map-side drag handler.
  useEffect(() => {
    setPx(String(placement.position[0]));
    setPy(String(placement.position[1]));
    setPz(String(placement.position[2]));
  }, [placement.position]);

  const commitTriple = (
    key: "position" | "orientation",
    values: [string, string, string],
  ) => {
    const parsed = values.map(Number);
    if (parsed.some((n) => !Number.isFinite(n))) return;
    onCommit({ [key]: parsed as [number, number, number] });
  };

  return (
    <div className="space-y-3 border-t border-border/60 p-3 text-xs">
      <div className="space-y-1.5">
        <Label>NPC prefab (entity class)</Label>
        <ClassnamePicker
          value={entityClass}
          onChange={setEntityClass}
          known={ALL_TRADER_ENTITY_CLASSES}
          placeholder="ExpansionTraderDenis"
        />
        <ApplyRow
          hint="Pick a shipped prefab, or type a custom / mod-added one."
          changed={entityClass !== placement.entityClass}
          onApply={() => {
            if (!entityClass.trim()) {
              setEntityClass(placement.entityClass);
              return;
            }
            onCommit({ entityClass: entityClass.trim() });
          }}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Trader config file</Label>
        <ClassnamePicker
          value={traderFile}
          onChange={setTraderFile}
          known={knownTraderFiles}
          placeholder="Weapons"
        />
        <ApplyRow
          hint={`Matches a JSON stem under ExpansionMod/Traders/${knownTraderFiles.length > 0 ? ` — ${knownTraderFiles.length} found` : ""}.`}
          changed={traderFile !== placement.traderFile}
          onApply={() => {
            if (!traderFile.trim()) {
              setTraderFile(placement.traderFile);
              return;
            }
            onCommit({ traderFile: traderFile.trim() });
          }}
        />
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <AxisInput
          label="X"
          value={px}
          step={1}
          onChange={setPx}
          onCommit={() => commitTriple("position", [px, py, pz])}
        />
        <AxisInput
          label="Y"
          value={py}
          step={0.1}
          onChange={setPy}
          onCommit={() => commitTriple("position", [px, py, pz])}
        />
        <AxisInput
          label="Z"
          value={pz}
          step={1}
          onChange={setPz}
          onCommit={() => commitTriple("position", [px, py, pz])}
        />
      </div>

      {nearestY !== null &&
      Math.abs(nearestY - placement.position[1]) > 0.5 ? (
        <button
          type="button"
          onClick={() => {
            setPy(String(nearestY));
            onCommit({
              position: [
                placement.position[0],
                nearestY,
                placement.position[2],
              ],
            });
          }}
          className="flex items-center gap-1 text-[11px] text-sky-500 hover:underline"
        >
          <MapPin className="h-3 w-3" />
          Snap Y to nearest building ({nearestY.toFixed(2)})
        </button>
      ) : null}

      <div className="grid grid-cols-3 gap-1.5">
        <AxisInput
          label="Yaw"
          value={yaw}
          onChange={setYaw}
          onCommit={() => commitTriple("orientation", [yaw, pitch, roll])}
        />
        <AxisInput
          label="Pitch"
          value={pitch}
          onChange={setPitch}
          onCommit={() => commitTriple("orientation", [yaw, pitch, roll])}
        />
        <AxisInput
          label="Roll"
          value={roll}
          onChange={setRoll}
          onCommit={() => commitTriple("orientation", [yaw, pitch, roll])}
        />
      </div>

      <GearTokensField
        value={placement.gear}
        onChange={(next) => onCommit({ gear: next })}
      />

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete placement
      </Button>
    </div>
  );
}

function ApplyRow({
  hint,
  changed,
  onApply,
}: {
  hint: string;
  changed: boolean;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
      <span>{hint}</span>
      {changed ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px]"
          onClick={onApply}
        >
          Apply
        </Button>
      ) : null}
    </div>
  );
}

export function AxisInput({
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
