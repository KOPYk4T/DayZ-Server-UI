import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { ClassnamePicker } from "@/components/ClassnamePicker";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useItemsSnapshot } from "@/hooks/useItems";

import type { TraderZone } from "./traderZoneTypes";

interface Props {
  zone: TraderZone;
  onCommit: (patch: Partial<TraderZone>) => void;
}

/** Side-panel editor for a selected trader zone. Same
 *  local-state-then-commit pattern as `PlacementForm`. Mount with a
 *  unique `key` so switching selection gets a fresh draft. */
export function ZoneForm({ zone, onCommit }: Props) {
  const [name, setName] = useState(zone.m_DisplayName);
  const [x, setX] = useState(String(zone.Position[0]));
  const [y, setY] = useState(String(zone.Position[1]));
  const [z, setZ] = useState(String(zone.Position[2]));
  const [radius, setRadius] = useState(String(zone.Radius));
  const [buy, setBuy] = useState(String(zone.BuyPricePercent));
  const [sell, setSell] = useState(String(zone.SellPricePercent));

  useEffect(() => {
    setX(String(zone.Position[0]));
    setY(String(zone.Position[1]));
    setZ(String(zone.Position[2]));
    setRadius(String(zone.Radius));
  }, [zone.Position, zone.Radius]);

  const commitTriple = (vals: [string, string, string]) => {
    const parsed = vals.map(Number);
    if (parsed.some((n) => !Number.isFinite(n))) return;
    onCommit({ Position: parsed as [number, number, number] });
  };

  return (
    <div className="space-y-3 border-t border-border/60 p-3 text-xs">
      <div className="space-y-1.5">
        <Label>Display name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed) onCommit({ m_DisplayName: trimmed });
            else setName(zone.m_DisplayName);
          }}
          className="h-7 text-xs"
        />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <NumberInput
          label="X"
          value={x}
          onChange={setX}
          onCommit={() => commitTriple([x, y, z])}
        />
        <NumberInput
          label="Y"
          value={y}
          step={0.1}
          onChange={setY}
          onCommit={() => commitTriple([x, y, z])}
        />
        <NumberInput
          label="Z"
          value={z}
          onChange={setZ}
          onCommit={() => commitTriple([x, y, z])}
        />
      </div>
      <NumberInput
        label="Radius (m)"
        value={radius}
        onChange={setRadius}
        onCommit={() => {
          const n = Number(radius);
          if (Number.isFinite(n) && n > 0) onCommit({ Radius: n });
          else setRadius(String(zone.Radius));
        }}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput
          label="Buy %"
          value={buy}
          onChange={setBuy}
          onCommit={() => {
            const n = Number(buy);
            if (Number.isFinite(n)) onCommit({ BuyPricePercent: n });
            else setBuy(String(zone.BuyPricePercent));
          }}
        />
        <NumberInput
          label="Sell %"
          value={sell}
          onChange={setSell}
          onCommit={() => {
            const n = Number(sell);
            if (Number.isFinite(n)) onCommit({ SellPricePercent: n });
            else setSell(String(zone.SellPricePercent));
          }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        <code>-1</code> = inherit from MarketSettings (global default).
      </p>
      <StockEditor
        stock={zone.Stock}
        onCommit={(next) => onCommit({ Stock: next })}
      />
    </div>
  );
}

function NumberInput({
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

function StockEditor({
  stock,
  onCommit,
}: {
  stock: Record<string, number>;
  onCommit: (next: Record<string, number>) => void;
}) {
  const [draftKey, setDraftKey] = useState("");
  const getMutedState = useMutedClassnameReason();
  const [draftQty, setDraftQty] = useState("");
  const items = useItemsSnapshot();
  const known = useMemo(
    () => (items.data?.items ?? []).map((i) => i.name).sort(),
    [items.data?.items],
  );
  const entries = Object.entries(stock);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Initial stock</Label>
        <span className="text-[10px] text-muted-foreground">
          {entries.length} item{entries.length === 1 ? "" : "s"}
        </span>
      </div>
      {entries.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-border/40 bg-muted/20 p-1">
          {entries.map(([cls, qty]) => (
            <li
              key={cls}
              className="flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5"
            >
              <code className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {cls}
              </code>
              <Input
                type="number"
                value={qty}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  onCommit({ ...stock, [cls]: n });
                }}
                className="h-6 w-20 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={() => {
                  const next = { ...stock };
                  delete next[cls];
                  onCommit(next);
                }}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                title="remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <ClassnamePicker
            value={draftKey}
            onChange={setDraftKey}
            known={known}
            placeholder="classname"
            getMutedState={getMutedState}
          />
        </div>
        <Input
          type="number"
          value={draftQty}
          onChange={(e) => setDraftQty(e.target.value)}
          placeholder="qty"
          className="h-7 w-20 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!draftKey.trim() || !draftQty.trim()}
          onClick={() => {
            const cls = draftKey.trim();
            const n = Number(draftQty);
            if (!cls || !Number.isFinite(n)) return;
            onCommit({ ...stock, [cls]: n });
            setDraftKey("");
            setDraftQty("");
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
