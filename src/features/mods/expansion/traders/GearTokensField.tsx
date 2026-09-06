import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassnamePicker } from "@/components/ClassnamePicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FactionPicker } from "@/features/mods/expansion/pickers/FactionPicker";
import { LoadoutPicker } from "@/features/mods/expansion/pickers/LoadoutPicker";
import { useItemsSnapshot } from "@/hooks/useItems";

import {
  parseGearTokens,
  serializeGearTokens,
  type GearTokens,
} from "./gearTokens";

interface Props {
  /** Raw token list as stored in the `.map` file. */
  value: string[];
  /** Fires with the full rewritten token list when any sub-field
   *  commits. Caller stores `next` back onto `placement.gear`. */
  onChange: (next: string[]) => void;
}

/**
 * Typed editor for the per-placement gear-token list.
 *
 * Surfaces `name:` / `loadout:` / `faction:` as dedicated pickers;
 * the remaining `items[]` render as per-row `ClassnamePicker`s with
 * attachment chains kept as-is (`+` joined). Unknown `key:value`
 * tokens round-trip untouched via the `other[]` bucket in the
 * underlying shape — a warning row surfaces that they exist so the
 * operator knows the raw file has something the UI doesn't model.
 */
export function GearTokensField({ value, onChange }: Props) {
  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );

  const parsed = useMemo(() => parseGearTokens(value), [value]);

  const commit = (patch: Partial<GearTokens>) => {
    onChange(serializeGearTokens({ ...parsed, ...patch }));
  };

  // Local draft for the `name:` input so keystrokes don't spray
  // commits through the caller's onCommit on every character.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const nameValue = nameDraft ?? parsed.name;

  const updateItem = (idx: number, next: string) => {
    const items = [...parsed.items];
    items[idx] = next;
    commit({ items });
  };
  const removeItem = (idx: number) => {
    commit({ items: parsed.items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    commit({ items: [...parsed.items, ""] });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Display name</Label>
        <Input
          value={nameValue}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft !== null && nameDraft !== parsed.name) {
              commit({ name: nameDraft });
            }
            setNameDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="(optional) — overrides the trader file default"
          className="h-7 font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Loadout</Label>
        <LoadoutPicker
          value={parsed.loadout}
          onChange={(v) => commit({ loadout: v })}
          placeholder="(optional) — loadout file stem"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Faction</Label>
        <FactionPicker
          value={parsed.faction}
          onChange={(v) => commit({ faction: v })}
          treatEmptyAsAny
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Items</Label>
          <span className="text-[10px] text-muted-foreground">
            Attachments joined with <code>+</code>
          </span>
        </div>
        {parsed.items.length === 0 ? (
          <p className="rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
            No extra items. Add a classname below — the trader
            config's defaults still apply.
          </p>
        ) : (
          <ul className="space-y-1">
            {parsed.items.map((it, i) => (
              <li key={i} className="flex items-center gap-1">
                <ClassnamePicker
                  value={it}
                  onChange={(v) => updateItem(i, v)}
                  known={knownClassnames}
                  placeholder="AKM+Mag_AKM_30Rnd+KobraOptic"
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeItem(i)}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-severity-error"
                  aria-label="remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addItem}
          className="h-7 text-xs"
        >
          <Plus className="mr-1 h-3 w-3" /> Add item
        </Button>
      </div>

      {parsed.other.length > 0 ? (
        <div className="space-y-1 rounded-md border border-severity-warning/40 bg-severity-warning/5 p-2">
          <div className="flex items-center gap-1 text-[10px] text-severity-warning">
            <AlertTriangle className="h-3 w-3" />
            {parsed.other.length} token
            {parsed.other.length === 1 ? "" : "s"} preserved but not
            surfaced here:
          </div>
          <ul className="flex flex-wrap gap-1">
            {parsed.other.map((t, i) => (
              <li key={i}>
                <Badge
                  variant="outline"
                  className="font-mono text-[10px]"
                  title="Unrecognised key:value — likely added by a script mod. Kept in the file on save."
                >
                  {t}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
