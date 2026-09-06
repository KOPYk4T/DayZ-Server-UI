import { useState } from "react";
import { Plus, Trash2, UserRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClassnamePicker } from "@/components/ClassnamePicker";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { cn } from "@/lib/utils";
import type { GearLoadout, SpawnEntry } from "@/types/ipc";

interface Props {
  loadout: GearLoadout;
  index: number;
  knownItems: string[];
  onChange: (next: GearLoadout) => void;
  onRemove: () => void;
}

/** Editable version of `LoadoutCard` (used when edit-mode is on in
 *  GearSetsPage). Exposes add / remove / edit for character types,
 *  attachment-slot entries, and cargo entries. Item pools use the
 *  shared ClassnamePicker with the full Items registry for hints. */
export function EditableLoadoutCard({
  loadout,
  index,
  knownItems,
  onChange,
  onRemove,
}: Props) {
  const [pendingChar, setPendingChar] = useState("");

  const addCharacterType = () => {
    const v = pendingChar.trim();
    if (!v || loadout.characterTypes.includes(v)) return;
    onChange({ ...loadout, characterTypes: [...loadout.characterTypes, v] });
    setPendingChar("");
  };

  const removeCharacterType = (ct: string) => {
    onChange({
      ...loadout,
      characterTypes: loadout.characterTypes.filter((c) => c !== ct),
    });
  };

  const addAttachment = () => {
    const next: SpawnEntry = { label: "Body", chance: 1, items: [] };
    onChange({
      ...loadout,
      attachmentEntries: [...loadout.attachmentEntries, next],
    });
  };

  const updateAttachment = (i: number, patch: Partial<SpawnEntry>) => {
    onChange({
      ...loadout,
      attachmentEntries: loadout.attachmentEntries.map((e, ii) =>
        ii === i ? { ...e, ...patch } : e,
      ),
    });
  };

  const removeAttachment = (i: number) => {
    onChange({
      ...loadout,
      attachmentEntries: loadout.attachmentEntries.filter((_, ii) => ii !== i),
    });
  };

  const addCargo = () => {
    const next: SpawnEntry = { label: "cargo", chance: 1, items: [] };
    onChange({
      ...loadout,
      cargoEntries: [...loadout.cargoEntries, next],
    });
  };

  const updateCargo = (i: number, patch: Partial<SpawnEntry>) => {
    onChange({
      ...loadout,
      cargoEntries: loadout.cargoEntries.map((e, ii) =>
        ii === i ? { ...e, ...patch } : e,
      ),
    });
  };

  const removeCargo = (i: number) => {
    onChange({
      ...loadout,
      cargoEntries: loadout.cargoEntries.filter((_, ii) => ii !== i),
    });
  };

  return (
    <div className="rounded-md border border-primary/30 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/10 px-4 py-2">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold text-muted-foreground">
          Loadout #{index + 1}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove loadout
        </Button>
      </div>

      <div className="space-y-4 p-4">
        <CharacterTypesEditor
          values={loadout.characterTypes}
          pending={pendingChar}
          onPendingChange={setPendingChar}
          onAdd={addCharacterType}
          onRemove={removeCharacterType}
          known={knownItems}
        />

        <EntryListEditor
          title="Attachment slots"
          addLabel="Add slot"
          entries={loadout.attachmentEntries}
          knownItems={knownItems}
          labelEditable
          onAdd={addAttachment}
          onUpdate={updateAttachment}
          onRemove={removeAttachment}
        />

        <EntryListEditor
          title="Cargo"
          addLabel="Add cargo group"
          entries={loadout.cargoEntries}
          knownItems={knownItems}
          labelEditable={false}
          onAdd={addCargo}
          onUpdate={updateCargo}
          onRemove={removeCargo}
        />
      </div>
    </div>
  );
}

// ---------- Character types editor ----------

function CharacterTypesEditor({
  values,
  pending,
  onPendingChange,
  onAdd,
  onRemove,
  known,
}: {
  values: string[];
  pending: string;
  onPendingChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (ct: string) => void;
  known: string[];
}) {
  const getMutedState = useMutedClassnameReason();
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Character types</span>
        <span className="font-normal text-[10px] italic">
          empty = default fallback loadout
        </span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {values.length === 0 ? (
          <Badge variant="outline" className="text-[10px]">
            (default — matches any character)
          </Badge>
        ) : (
          values.map((ct) => (
            <button
              key={ct}
              type="button"
              onClick={() => onRemove(ct)}
              title={`Remove ${ct}`}
              className="group inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] hover:border-destructive/40"
            >
              {ct}
              <X className="h-3 w-3 opacity-40 group-hover:text-destructive group-hover:opacity-100" />
            </button>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <ClassnamePicker
          value={pending}
          onChange={onPendingChange}
          known={known}
          placeholder="SurvivorM_Boris"
          className="max-w-xs"
          getMutedState={getMutedState}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={onAdd}
          disabled={!pending.trim()}
          className="h-7"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </section>
  );
}

// ---------- Attachment / cargo list editor ----------

function EntryListEditor({
  title,
  addLabel,
  entries,
  knownItems,
  labelEditable,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string;
  addLabel: string;
  entries: SpawnEntry[];
  knownItems: string[];
  labelEditable: boolean;
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<SpawnEntry>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span className="ml-auto">
          <Button
            size="sm"
            variant="secondary"
            onClick={onAdd}
            className="h-7 text-[11px]"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {addLabel}
          </Button>
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 p-3 text-center text-[11px] italic text-muted-foreground">
          None defined.
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e, i) => (
            <EntryEditor
              key={i}
              entry={e}
              knownItems={knownItems}
              labelEditable={labelEditable}
              onUpdate={(patch) => onUpdate(i, patch)}
              onRemove={() => onRemove(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EntryEditor({
  entry,
  knownItems,
  labelEditable,
  onUpdate,
  onRemove,
}: {
  entry: SpawnEntry;
  knownItems: string[];
  labelEditable: boolean;
  onUpdate: (patch: Partial<SpawnEntry>) => void;
  onRemove: () => void;
}) {
  const chancePct = Math.round((entry.chance ?? 0) * 100);
  return (
    <div className="rounded-md border border-border/40 bg-muted/10 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {labelEditable ? (
          <>
            <Label className="text-[10px] uppercase text-muted-foreground">
              Slot
            </Label>
            <Input
              value={entry.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Body"
              className="h-7 w-32 font-mono text-xs"
            />
          </>
        ) : (
          <Badge variant="outline" className="font-mono text-[10px]">
            {entry.label}
          </Badge>
        )}
        <Label className="ml-2 text-[10px] uppercase text-muted-foreground">
          Chance
        </Label>
        <Input
          type="number"
          min={0}
          max={100}
          step={1}
          value={chancePct}
          onChange={(e) =>
            onUpdate({
              chance: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100,
            })
          }
          className="h-7 w-20 tabular-nums text-xs"
        />
        <span className="text-[11px] text-muted-foreground">%</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
          title="Remove entry"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ItemPoolEditor
        items={entry.items}
        knownItems={knownItems}
        onChange={(items) => onUpdate({ items })}
      />
    </div>
  );
}

// ---------- Item pool editor ----------

function ItemPoolEditor({
  items,
  knownItems,
  onChange,
}: {
  items: string[];
  knownItems: string[];
  onChange: (items: string[]) => void;
}) {
  const [pending, setPending] = useState("");
  const knownSet = knownItems;
  const getMutedState = useMutedClassnameReason();
  const add = () => {
    const v = pending.trim();
    if (!v) return;
    onChange([...items, v]);
    setPending("");
  };
  const remove = (i: number) => onChange(items.filter((_, ii) => ii !== i));

  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">
        Item pool ({items.length})
      </Label>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">
            (empty — the slot / cargo roll never spawns anything)
          </span>
        ) : (
          items.map((name, i) => {
            const known = knownSet.includes(name);
            return (
              <button
                key={`${name}:${i}`}
                type="button"
                onClick={() => remove(i)}
                title={
                  known
                    ? `Known item · click to remove ${name}`
                    : `Unknown classname (not in Items registry) · click to remove ${name}`
                }
                className={cn(
                  "group inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]",
                  known
                    ? "border-border/60 bg-background hover:border-destructive/40"
                    : "border-severity-warning/40 bg-severity-warning/10 text-severity-warning hover:border-destructive/40",
                )}
              >
                {name}
                <X className="h-3 w-3 opacity-40 group-hover:text-destructive group-hover:opacity-100" />
              </button>
            );
          })
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ClassnamePicker
          value={pending}
          onChange={setPending}
          known={knownItems}
          placeholder="classname"
          className="max-w-sm"
          getMutedState={getMutedState}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={add}
          disabled={!pending.trim()}
          className="h-7"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
