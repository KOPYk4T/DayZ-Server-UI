import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Code,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ClassnamePicker } from "@/components/ClassnamePicker";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { InfoTooltip } from "@/components/InfoTooltip";
import { MonacoXmlViewer } from "@/components/MonacoXmlViewer";
import {
  useSpawnableRawXml,
  useSpawnablesDelete,
  useSpawnablesUpsert,
} from "@/hooks/useLoadouts";
import { cn, errorMessage } from "@/lib/utils";
import type {
  AttachmentGroup,
  CargoGroup,
  SpawnableItem,
  SpawnableType,
} from "@/types/ipc";

import {
  effectiveProbability,
  formatProbability,
  LOADOUT_FIELDS,
  SPAWNABLE_EMPTY_HINT,
} from "./glossary";

const DRAWER_WIDTH =
  "w-full sm:w-[48rem] md:w-[54rem] lg:w-[60rem] xl:w-[66rem] !max-w-[92vw]";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  spawnable: SpawnableType | null;
  knownClassnames: string[];
  presetNamesAttachments: string[];
  presetNamesCargo: string[];
}

export function SpawnableDetailDrawer({
  open,
  onOpenChange,
  spawnable,
  knownClassnames,
  presetNamesAttachments,
  presetNamesCargo,
}: Props) {
  const [draft, setDraft] = useState<SpawnableType | null>(spawnable);
  const upsert = useSpawnablesUpsert();
  const del = useSpawnablesDelete();
  const rawXml = useSpawnableRawXml(open && spawnable ? spawnable.name : null);

  useEffect(() => {
    setDraft(spawnable);
  }, [spawnable?.name]);

  const dirty = useMemo(() => {
    if (!spawnable || !draft) return false;
    return JSON.stringify(spawnable) !== JSON.stringify(draft);
  }, [spawnable, draft]);

  if (!spawnable || !draft) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn(DRAWER_WIDTH, "p-0")}>
          <div className="p-6 text-sm text-muted-foreground">
            Pick a spawnable.
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const isVanilla = spawnable.source === "vanilla";
  const isCustom = spawnable.source === "custom";

  const save = () => {
    upsert.mutate([draft], {
      onSuccess: () =>
        toast.success(`saved ${draft.name}`, {
          description: isVanilla
            ? "override written to custom/spawnabletypes_custom.xml"
            : undefined,
        }),
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const removeOverride = () => {
    del.mutate([spawnable.name], {
      onSuccess: () => {
        toast.success(`removed override for ${spawnable.name}`);
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("flex flex-col gap-0 p-0", DRAWER_WIDTH)}
      >
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="font-mono">{spawnable.name}</SheetTitle>
            <Badge variant="outline" className="uppercase">
              {spawnable.source}
            </Badge>
            <Badge variant="outline">
              {spawnable.attachments.length} atch ·{" "}
              {spawnable.cargo.length} cargo
            </Badge>
          </div>
          <SheetDescription className="text-xs">
            {spawnable.file || "—"}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="editor" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-3 w-fit">
            <TabsTrigger value="editor">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Groups
            </TabsTrigger>
            <TabsTrigger value="raw">
              <Code className="mr-1.5 h-3.5 w-3.5" /> Raw XML
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="editor"
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-4"
          >
            {isVanilla ? (
              <p className="mb-3 rounded-md border border-severity-warning/30 bg-severity-warning/5 p-2 text-xs text-severity-warning">
                Vanilla spawnable — saving writes an override to{" "}
                <code>custom/spawnabletypes_custom.xml</code>.
              </p>
            ) : null}

            <AboutThisLoadout spawnable={draft} />

            <div className="mb-4 flex items-center gap-3">
              <Label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={draft.hoarder}
                  onCheckedChange={(v) => setDraft({ ...draft, hoarder: v })}
                />
                hoarder
              </Label>
              <InfoTooltip tagline={LOADOUT_FIELDS.hoarder.tagline}>
                {LOADOUT_FIELDS.hoarder.description}
              </InfoTooltip>
            </div>

            <GroupsEditor
              label="Attachments"
              icon={<Layers className="h-3.5 w-3.5 text-severity-info" />}
              tagline={LOADOUT_FIELDS.attachmentsGroup.tagline}
              description={LOADOUT_FIELDS.attachmentsGroup.description}
              groups={draft.attachments}
              onChange={(next) => setDraft({ ...draft, attachments: next })}
              kind="attachments"
              knownClassnames={knownClassnames}
              presetNames={presetNamesAttachments}
              slotNameEditable
            />

            <Separator className="my-4" />

            <GroupsEditor
              label="Cargo"
              icon={<Box className="h-3.5 w-3.5 text-primary" />}
              tagline={LOADOUT_FIELDS.cargoGroup.tagline}
              description={LOADOUT_FIELDS.cargoGroup.description}
              groups={draft.cargo}
              onChange={(next) => setDraft({ ...draft, cargo: next })}
              kind="cargo"
              knownClassnames={knownClassnames}
              presetNames={presetNamesCargo}
              slotNameEditable={false}
            />
          </TabsContent>

          <TabsContent value="raw" className="min-h-0 flex-1 px-0 pb-16">
            <div className="h-full min-h-[300px] border-t border-border/60">
              <MonacoXmlViewer
                value={rawXml.data ?? ""}
                readOnly
                language="xml"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border/60 bg-card/60 px-6 py-3">
          <div className="flex flex-wrap gap-2">
            {isCustom ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={removeOverride}
                disabled={del.isPending}
                className="text-severity-error"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove override
              </Button>
            ) : null}
          </div>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || upsert.isPending}
            className="ml-auto"
          >
            {upsert.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Group editor ----------

interface GroupsEditorProps {
  label: string;
  icon: React.ReactNode;
  tagline?: string;
  description: string;
  groups: AttachmentGroup[] | CargoGroup[];
  onChange: (next: AttachmentGroup[] | CargoGroup[]) => void;
  kind: "attachments" | "cargo";
  knownClassnames: string[];
  presetNames: string[];
  slotNameEditable: boolean;
}

function GroupsEditor({
  label,
  icon,
  tagline,
  description,
  groups,
  onChange,
  kind,
  knownClassnames,
  presetNames,
  slotNameEditable,
}: GroupsEditorProps) {
  const addGroup = () => {
    if (kind === "attachments") {
      const next: AttachmentGroup[] = [
        ...(groups as AttachmentGroup[]),
        { chance: 1.0, slotName: null, items: [] },
      ];
      onChange(next);
    } else {
      const next: CargoGroup[] = [
        ...(groups as CargoGroup[]),
        { chance: 1.0, items: [] },
      ];
      onChange(next);
    }
  };

  const updateGroup = (idx: number, patch: Partial<AttachmentGroup>) => {
    const next = (groups as AttachmentGroup[]).map((g, i) =>
      i === idx ? { ...g, ...patch } : g,
    );
    onChange(next);
  };

  const removeGroup = (idx: number) => {
    onChange(groups.filter((_, i) => i !== idx));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label} ({groups.length})
          </h4>
          <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
        </div>
        <Button size="sm" variant="secondary" onClick={addGroup}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add group
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          No {label.toLowerCase()} groups. Add one to give this spawnable
          something to put in its {kind === "attachments" ? "slots" : "cargo"}.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-md border border-border/60 bg-card/50 p-3"
            >
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[11px] uppercase text-muted-foreground">
                    chance
                  </Label>
                  <InfoTooltip tagline={LOADOUT_FIELDS.groupChance.tagline}>
                    {LOADOUT_FIELDS.groupChance.description}
                  </InfoTooltip>
                </div>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={g.chance}
                  onChange={(e) =>
                    updateGroup(idx, { chance: Number(e.target.value) || 0 })
                  }
                  className="h-7 w-20 tabular-nums"
                />
                {slotNameEditable ? (
                  <>
                    <div className="flex items-center gap-1.5 pl-3">
                      <Label className="text-[11px] uppercase text-muted-foreground">
                        slot
                      </Label>
                      <InfoTooltip tagline={LOADOUT_FIELDS.slotName.tagline}>
                        {LOADOUT_FIELDS.slotName.description}
                      </InfoTooltip>
                    </div>
                    <Input
                      value={(g as AttachmentGroup).slotName ?? ""}
                      onChange={(e) =>
                        updateGroup(idx, {
                          slotName: e.target.value || null,
                        })
                      }
                      placeholder="(e.g. optic, mag)"
                      className="h-7 w-40 font-mono"
                    />
                  </>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeGroup(idx)}
                  className="ml-auto"
                  aria-label={`remove ${label} group ${idx + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <GroupSummary
                chance={g.chance}
                items={g.items}
                kind={kind}
                slotName={
                  slotNameEditable
                    ? (g as AttachmentGroup).slotName ?? null
                    : null
                }
              />

              <ItemsEditor
                items={g.items}
                onChange={(next) => updateGroup(idx, { items: next })}
                knownClassnames={knownClassnames}
                presetNames={presetNames}
                kind={kind}
                groupChance={g.chance}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function GroupSummary({
  chance,
  items,
  kind,
  slotName,
}: {
  chance: number;
  items: SpawnableItem[];
  kind: "attachments" | "cargo";
  slotName: string | null;
}) {
  const pct = formatProbability(chance);
  const total = items.reduce((n, it) => n + Math.max(it.chance, 0), 0);
  const topItem = [...items]
    .filter((it) => it.chance > 0 || !!it.preset)
    .sort((a, b) => b.chance - a.chance)[0];
  const topPct =
    topItem && total > 0
      ? formatProbability(effectiveProbability(chance, topItem.chance, total))
      : null;
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{pct}</span> chance this
      {slotName ? ` "${slotName}"` : ""} {kind} group fires per spawn ·
      {" "}
      {items.length} item{items.length === 1 ? "" : "s"} in pool
      {topItem && topPct ? (
        <>
          {" "}
          · most likely:{" "}
          <span className="font-mono text-foreground">
            {topItem.preset ? `preset: ${topItem.preset}` : topItem.name || "(unnamed)"}
          </span>{" "}
          at <span className="text-foreground">{topPct}</span> effective
        </>
      ) : null}
    </div>
  );
}

interface ItemsEditorProps {
  items: SpawnableItem[];
  onChange: (next: SpawnableItem[]) => void;
  knownClassnames: string[];
  presetNames: string[];
  kind: "attachments" | "cargo";
  /** Outer group chance — used to compute effective spawn probabilities. */
  groupChance: number;
}

function ItemsEditor({
  items,
  onChange,
  knownClassnames,
  presetNames,
  groupChance,
}: ItemsEditorProps) {
  const getMutedState = useMutedClassnameReason();
  const totalItemChance = items.reduce(
    (n, it) => n + Math.max(it.chance, 0),
    0,
  );
  const update = (idx: number, patch: Partial<SpawnableItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const add = () =>
    onChange([...items, { name: "", chance: 1.0, preset: null }]);

  const [presetMode, setPresetMode] = useState<Set<number>>(
    new Set(
      items.map((it, i) => (it.preset ? i : -1)).filter((i) => i >= 0),
    ),
  );
  const togglePresetMode = (idx: number, asPreset: boolean) => {
    const next = new Set(presetMode);
    if (asPreset) {
      next.add(idx);
      update(idx, { preset: "", name: "" });
    } else {
      next.delete(idx);
      update(idx, { preset: null });
    }
    setPresetMode(next);
  };

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[auto_1fr_80px_64px_32px] gap-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>src</span>
        <ColumnHeader
          label="name / preset"
          tagline={LOADOUT_FIELDS.itemName.tagline}
          description={LOADOUT_FIELDS.itemName.description}
        />
        <ColumnHeader
          label="chance"
          tagline={LOADOUT_FIELDS.itemChance.tagline}
          description={LOADOUT_FIELDS.itemChance.description}
          align="end"
        />
        <ColumnHeader
          label="effective"
          tagline="Per-spawn probability (group × item weight)"
          description="The final per-spawn probability of this item landing on the parent. Equals the group chance multiplied by this item's share of the pool (item chance ÷ sum of item chances in the group). Changes live as you tweak numbers."
          align="end"
        />
        <span />
      </div>
      {items.map((it, idx) => {
        const isPreset = presetMode.has(idx) || !!it.preset;
        const eff = effectiveProbability(
          groupChance,
          Math.max(it.chance, 0),
          totalItemChance,
        );
        return (
          <div
            key={idx}
            className="grid grid-cols-[auto_1fr_80px_64px_32px] items-center gap-2"
          >
            <label className="flex items-center gap-1 text-[10px]">
              <input
                type="checkbox"
                checked={isPreset}
                onChange={(e) => togglePresetMode(idx, e.target.checked)}
                className="h-3 w-3"
                title="Use a random preset instead of a concrete classname"
              />
              preset
            </label>
            {isPreset ? (
              <Select
                value={it.preset ?? ""}
                onValueChange={(v) => update(idx, { preset: v, name: "" })}
              >
                <SelectTrigger className="h-7 font-mono text-xs">
                  <SelectValue placeholder="(pick a preset)" />
                </SelectTrigger>
                <SelectContent>
                  {presetNames.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      no matching presets loaded
                    </SelectItem>
                  ) : (
                    presetNames.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            ) : (
              <ClassnamePicker
                value={it.name}
                onChange={(v) => update(idx, { name: v, preset: null })}
                known={knownClassnames}
                getMutedState={getMutedState}
              />
            )}
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={it.chance}
              onChange={(e) =>
                update(idx, { chance: Number(e.target.value) || 0 })
              }
              className="h-7 tabular-nums"
            />
            <span
              className="text-right text-[11px] tabular-nums text-muted-foreground"
              title={`group ${formatProbability(groupChance)} × item ${
                totalItemChance > 0
                  ? `${Math.round((Math.max(it.chance, 0) / totalItemChance) * 100)}%`
                  : "—"
              } share`}
            >
              {formatProbability(eff)}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => remove(idx)}
              aria-label={`remove item ${idx + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      })}
      <Button
        size="sm"
        variant="ghost"
        onClick={add}
        className="h-7 text-xs"
      >
        <Plus className="mr-1.5 h-3 w-3" /> Add item
      </Button>
    </div>
  );
}

function ColumnHeader({
  label,
  tagline,
  description,
  align = "start",
}: {
  label: string;
  tagline?: string;
  description: string;
  align?: "start" | "end";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        align === "end" && "justify-end",
      )}
    >
      {label}
      <InfoTooltip tagline={tagline} side="top">
        {description}
      </InfoTooltip>
    </span>
  );
}

/**
 * Plain-English summary of what CE will do with this loadout. Changes
 * live as the user edits, so they see the impact of each change in
 * context rather than just a number in a field.
 */
function AboutThisLoadout({ spawnable }: { spawnable: SpawnableType }) {
  const atch = spawnable.attachments.length;
  const cargo = spawnable.cargo.length;
  const noGroups = atch === 0 && cargo === 0;

  if (noGroups) {
    return (
      <div className="mb-4 rounded-md border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        {SPAWNABLE_EMPTY_HINT}
      </div>
    );
  }

  const atchRolls = spawnable.attachments.map((g) =>
    formatProbability(g.chance),
  );
  const cargoRolls = spawnable.cargo.map((g) => formatProbability(g.chance));

  return (
    <div className="mb-4 space-y-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
      <p>
        When CE spawns{" "}
        <code className="font-mono">{spawnable.name || "(unnamed)"}</code>, it
        runs these rules:
      </p>
      <ul className="ml-3 list-disc space-y-0.5 text-muted-foreground">
        {atch > 0 ? (
          <li>
            <strong className="text-foreground">{atch}</strong>{" "}
            attachments group{atch === 1 ? "" : "s"} — each rolls
            independently to add a slot item at{" "}
            <span className="font-mono text-foreground">
              {atchRolls.join(", ")}
            </span>
            .
          </li>
        ) : (
          <li>No attachments groups — no slot items will be added.</li>
        )}
        {cargo > 0 ? (
          <li>
            <strong className="text-foreground">{cargo}</strong> cargo group
            {cargo === 1 ? "" : "s"} — each rolls independently to drop an
            item into the parent's inventory at{" "}
            <span className="font-mono text-foreground">
              {cargoRolls.join(", ")}
            </span>
            .
          </li>
        ) : (
          <li>No cargo groups — no items will be placed inside it.</li>
        )}
        <li>
          Each group picks ONE item from its pool, weighted by per-item
          chance. The <span className="font-mono">effective</span> column
          next to each item shows the resulting per-spawn probability.
        </li>
      </ul>
    </div>
  );
}
