import { useMemo, useState } from "react";
import { Backpack, Plus, Shirt, Trash2 } from "lucide-react";

import { ClassnamePicker } from "@/components/ClassnamePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { cn } from "@/lib/utils";
import type {
  ItemType,
  SpawnKit,
  SpawnKitItem,
  SpawnKitPocket,
  SpawnKitSlot,
} from "@/types/ipc";

const WORN_SLOTS = [
  "Headgear",
  "Mask",
  "Eyewear",
  "Body",
  "Vest",
  "Back",
  "Hips",
  "Legs",
  "Feet",
  "Gloves",
  "Armband",
  "Melee",
  "Shoulder",
] as const;

function freshItem(itemType = ""): SpawnKitItem {
  return {
    itemType,
    spawnWeight: 1,
    healthMin: 1,
    healthMax: 1,
    quantityMin: 1,
    quantityMax: 1,
    quickBarSlot: -1,
  };
}

function slotWeightTotal(items: SpawnKitItem[]) {
  return items.reduce((a, i) => a + Math.max(0, i.spawnWeight), 0);
}

function pct(item: SpawnKitItem, total: number) {
  if (total <= 0) return 0;
  return Math.round((Math.max(0, item.spawnWeight) / total) * 100);
}

const WEAPON_SLOTS = new Set(["Melee", "Shoulder"]);

function isCategory(item: ItemType, name: string) {
  return (item.category ?? "").toLowerCase() === name;
}

function hpPercent(n: number) {
  return Math.round(n * 100);
}

function fromHpPercent(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n / 100));
}

interface Props {
  kits: SpawnKit[];
  items: ItemType[];
  onChange: (kits: SpawnKit[]) => void;
  onOpenItem: (name: string) => void;
}

export function GearKitBoard({ kits, items, onChange, onOpenItem }: Props) {
  const getMuted = useMutedClassnameReason();
  const allNames = useMemo(() => items.map((i) => i.name), [items]);
  const clothesNames = useMemo(
    () => items.filter((i) => isCategory(i, "clothes")).map((i) => i.name),
    [items],
  );
  const weaponNames = useMemo(
    () => items.filter((i) => isCategory(i, "weapons")).map((i) => i.name),
    [items],
  );

  const patchKit = (index: number, next: SpawnKit) => {
    onChange(kits.map((k, i) => (i === index ? next : k)));
  };

  return (
    <div className="space-y-6">
      {kits.map((kit, kitIdx) => (
        <KitCard
          key={kit.relPath}
          kit={kit}
          allNames={allNames}
          clothesNames={clothesNames}
          weaponNames={weaponNames}
          clothesCount={clothesNames.length}
          getMuted={getMuted}
          onChange={(next) => patchKit(kitIdx, next)}
          onOpenItem={onOpenItem}
        />
      ))}
    </div>
  );
}

function KitCard({
  kit,
  allNames,
  clothesNames,
  weaponNames,
  clothesCount,
  getMuted,
  onChange,
  onOpenItem,
}: {
  kit: SpawnKit;
  allNames: string[];
  clothesNames: string[];
  weaponNames: string[];
  clothesCount: number;
  getMuted: (name: string) => { muted: boolean; reason?: string };
  onChange: (next: SpawnKit) => void;
  onOpenItem: (name: string) => void;
}) {
  const [wornShowAll, setWornShowAll] = useState(false);
  const knownForSlot = (slotName: string) => {
    if (wornShowAll) return allNames;
    if (WEAPON_SLOTS.has(slotName)) {
      return weaponNames.length > 0 ? weaponNames : allNames;
    }
    return clothesNames;
  };
  const hintForSlot = (slotName: string) => {
    if (wornShowAll) return "any item";
    if (WEAPON_SLOTS.has(slotName)) return "weapons";
    return "clothes";
  };
  const wornCount = kit.worn.reduce((a, s) => a + s.items.length, 0);
  const pocketCount = kit.pockets.reduce((a, s) => a + s.items.length, 0);
  const usedSlots = new Set(kit.worn.map((s) => s.slotName));
  const addableSlots = WORN_SLOTS.filter((s) => !usedSlots.has(s));

  const patchWorn = (i: number, slot: SpawnKitSlot) => {
    onChange({
      ...kit,
      worn: kit.worn.map((s, ii) => (ii === i ? slot : s)),
    });
  };
  const removeWorn = (i: number) => {
    onChange({ ...kit, worn: kit.worn.filter((_, ii) => ii !== i) });
  };
  const addWorn = (slotName: string) => {
    onChange({
      ...kit,
      worn: [...kit.worn, { slotName, items: [] }],
    });
  };
  const patchPocket = (i: number, pocket: SpawnKitPocket) => {
    onChange({
      ...kit,
      pockets: kit.pockets.map((p, ii) => (ii === i ? pocket : p)),
    });
  };
  const addPocket = () => {
    onChange({
      ...kit,
      pockets: [
        ...kit.pockets,
        { name: `Cargo${kit.pockets.length + 1}`, spawnWeight: 1, items: [] },
      ],
    });
  };

  return (
    <article className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/50 bg-muted/20 px-5 py-4">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Starting kit
          </p>
          <h2 className="truncate font-mono text-lg tracking-tight text-foreground">
            {kit.name || "SurvivorPreset"}
          </h2>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {kit.relPath}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <Badge variant="outline" className="font-mono text-[10px]">
            {kit.characterTypes.length === 0
              ? "any character"
              : kit.characterTypes.join(", ")}
          </Badge>
          <span className="text-muted-foreground">
            {wornCount} worn · {pocketCount} in pockets
          </span>
        </div>
      </header>

      <div className="grid gap-0 lg:grid-cols-2">
        <section className="space-y-3 border-b border-border/50 p-5 lg:border-r lg:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Shirt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold">Worn</h3>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  One roll per slot. Clothes slots list the{" "}
                  <code>types.xml</code> <code>clothes</code> category
                  ({clothesCount.toLocaleString()} items). Melee /
                  Shoulder list weapons. P: is not required.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWornShowAll((v) => !v)}
              className="shrink-0 text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {wornShowAll ? "Category filter" : "Show all items"}
            </button>
          </div>
          <div className="space-y-3">
            {kit.worn.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                No clothing slots yet.
              </p>
            ) : (
              kit.worn.map((slot, i) => (
                <SlotPool
                  key={`${slot.slotName}:${i}`}
                  slot={slot}
                  knownItems={knownForSlot(slot.slotName)}
                  pickerHint={hintForSlot(slot.slotName)}
                  getMuted={getMuted}
                  onChange={(next) => patchWorn(i, next)}
                  onRemove={() => removeWorn(i)}
                  onOpenItem={onOpenItem}
                />
              ))
            )}
          </div>
          {addableSlots.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {addableSlots.map((name) => (
                <Button
                  key={name}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 font-mono text-[11px]"
                  onClick={() => addWorn(name)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {name}
                </Button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Backpack className="h-4 w-4 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-semibold">Pockets</h3>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Every item here is given. Quantity −1 means “full
                  stack / not used”. Quickbar 0–9 puts it on the bar.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2 text-[11px]"
              onClick={addPocket}
            >
              <Plus className="mr-1 h-3 w-3" />
              Pocket
            </Button>
          </div>
          <div className="space-y-3">
            {kit.pockets.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">
                No pocket pile yet — they spawn empty-handed besides
                clothes.
              </p>
            ) : (
              kit.pockets.map((pocket, i) => (
                <PocketPool
                  key={`${pocket.name}:${i}`}
                  pocket={pocket}
                  knownItems={allNames}
                  getMuted={getMuted}
                  onChange={(next) => patchPocket(i, next)}
                  onRemove={() =>
                    onChange({
                      ...kit,
                      pockets: kit.pockets.filter((_, ii) => ii !== i),
                    })
                  }
                  onOpenItem={onOpenItem}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </article>
  );
}

function SlotPool({
  slot,
  knownItems,
  pickerHint,
  getMuted,
  onChange,
  onRemove,
  onOpenItem,
}: {
  slot: SpawnKitSlot;
  knownItems: string[];
  pickerHint: string;
  getMuted: (name: string) => { muted: boolean; reason?: string };
  onChange: (next: SpawnKitSlot) => void;
  onRemove: () => void;
  onOpenItem: (name: string) => void;
}) {
  const total = slotWeightTotal(slot.items);
  return (
    <div className="rounded-md border border-border/50 bg-background/40">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <span className="font-mono text-xs font-semibold">{slot.slotName}</span>
        <span className="text-[10px] text-muted-foreground">
          {slot.items.length} option{slot.items.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-muted-foreground hover:text-severity-error"
          title="Remove this slot"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="divide-y divide-border/30">
        {slot.items.map((item, i) => (
          <ItemRow
            key={`${item.itemType}:${i}`}
            item={item}
            weightHint={`${pct(item, total)}%`}
            knownItems={knownItems}
            pickerHint={pickerHint}
            getMuted={getMuted}
            onChange={(next) =>
              onChange({
                ...slot,
                items: slot.items.map((it, ii) => (ii === i ? next : it)),
              })
            }
            onRemove={() =>
              onChange({
                ...slot,
                items: slot.items.filter((_, ii) => ii !== i),
              })
            }
            onOpenItem={onOpenItem}
          />
        ))}
      </div>
      <div className="px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() =>
            onChange({ ...slot, items: [...slot.items, freshItem()] })
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          Add option
        </Button>
      </div>
    </div>
  );
}

function PocketPool({
  pocket,
  knownItems,
  getMuted,
  onChange,
  onRemove,
  onOpenItem,
}: {
  pocket: SpawnKitPocket;
  knownItems: string[];
  getMuted: (name: string) => { muted: boolean; reason?: string };
  onChange: (next: SpawnKitPocket) => void;
  onRemove: () => void;
  onOpenItem: (name: string) => void;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        <Input
          value={pocket.name}
          onChange={(e) => onChange({ ...pocket, name: e.target.value })}
          className="h-7 w-36 font-mono text-xs"
        />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-muted-foreground hover:text-severity-error"
          title="Remove this pocket pile"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="divide-y divide-border/30">
        {pocket.items.map((item, i) => (
          <ItemRow
            key={`${item.itemType}:${i}`}
            item={item}
            knownItems={knownItems}
            getMuted={getMuted}
            showQuantity
            showQuickbar
            onChange={(next) =>
              onChange({
                ...pocket,
                items: pocket.items.map((it, ii) => (ii === i ? next : it)),
              })
            }
            onRemove={() =>
              onChange({
                ...pocket,
                items: pocket.items.filter((_, ii) => ii !== i),
              })
            }
            onOpenItem={onOpenItem}
          />
        ))}
      </div>
      <div className="px-3 py-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px]"
          onClick={() =>
            onChange({ ...pocket, items: [...pocket.items, freshItem()] })
          }
        >
          <Plus className="mr-1 h-3 w-3" />
          Add item
        </Button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  weightHint,
  knownItems,
  pickerHint,
  getMuted,
  showQuantity,
  showQuickbar,
  onChange,
  onRemove,
  onOpenItem,
}: {
  item: SpawnKitItem;
  weightHint?: string;
  knownItems: string[];
  pickerHint?: string;
  getMuted: (name: string) => { muted: boolean; reason?: string };
  showQuantity?: boolean;
  showQuickbar?: boolean;
  onChange: (next: SpawnKitItem) => void;
  onRemove: () => void;
  onOpenItem: (name: string) => void;
}) {
  const placeholder =
    pickerHint === "clothes"
      ? "clothes…"
      : pickerHint === "weapons"
        ? "weapons…"
        : "classname";

  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <ClassnamePicker
            value={item.itemType}
            onChange={(itemType) => onChange({ ...item, itemType })}
            known={knownItems}
            getMutedState={getMuted}
            placeholder={placeholder}
          />
          {item.itemType ? (
            <button
              type="button"
              onClick={() => onOpenItem(item.itemType)}
              className="mt-0.5 text-[10px] text-muted-foreground hover:text-primary"
            >
              Open in Items
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1.5 text-muted-foreground hover:text-severity-error"
          title="Remove item"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <NumField
          label="Weight"
          hint={weightHint}
          value={item.spawnWeight}
          min={0}
          className="w-20"
          onChange={(spawnWeight) => onChange({ ...item, spawnWeight })}
        />
        <HpField
          min={item.healthMin}
          max={item.healthMax}
          onChange={(healthMin, healthMax) =>
            onChange({ ...item, healthMin, healthMax })
          }
        />
        {showQuantity ? (
          <RangeField
            label="Qty"
            min={item.quantityMin}
            max={item.quantityMax}
            allowNegative
            onChange={(quantityMin, quantityMax) =>
              onChange({ ...item, quantityMin, quantityMax })
            }
          />
        ) : null}
        {showQuickbar ? (
          <NumField
            label="QB"
            value={item.quickBarSlot}
            min={-1}
            max={9}
            className="w-16"
            onChange={(quickBarSlot) => onChange({ ...item, quickBarSlot })}
          />
        ) : null}
      </div>
    </div>
  );
}

function NumField({
  label,
  hint,
  value,
  min,
  max,
  className,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  className?: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
        {hint ? <span className="ml-1 normal-case">{hint}</span> : null}
      </Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 font-mono text-xs"
      />
    </div>
  );
}

function HpField({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
        HP
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={hpPercent(min)}
          min={0}
          max={100}
          step={1}
          onChange={(e) =>
            onChange(fromHpPercent(Number(e.target.value)), max)
          }
          className="h-7 w-16 px-2 font-mono text-xs"
        />
        <span className="text-[10px] text-muted-foreground">–</span>
        <Input
          type="number"
          value={hpPercent(max)}
          min={0}
          max={100}
          step={1}
          onChange={(e) =>
            onChange(min, fromHpPercent(Number(e.target.value)))
          }
          className="h-7 w-16 px-2 font-mono text-xs"
        />
        <span className="text-[10px] text-muted-foreground">%</span>
      </div>
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  allowNegative,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  allowNegative?: boolean;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={min}
          min={allowNegative ? undefined : 0}
          max={allowNegative ? undefined : 1}
          step={0.1}
          onChange={(e) => onChange(Number(e.target.value), max)}
          className="h-7 px-1 font-mono text-xs"
        />
        <span className="text-[10px] text-muted-foreground">–</span>
        <Input
          type="number"
          value={max}
          min={allowNegative ? undefined : 0}
          max={allowNegative ? undefined : 1}
          step={0.1}
          onChange={(e) => onChange(min, Number(e.target.value))}
          className="h-7 px-1 font-mono text-xs"
        />
      </div>
    </div>
  );
}
