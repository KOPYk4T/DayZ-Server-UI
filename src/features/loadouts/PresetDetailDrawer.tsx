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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  usePresetRawXml,
  usePresetsDelete,
  usePresetsUpsert,
} from "@/hooks/useLoadouts";
import { cn, errorMessage } from "@/lib/utils";
import type { RandomPreset } from "@/types/ipc";

import {
  formatProbability,
  LOADOUT_FIELDS,
  PRESET_EMPTY_HINT,
} from "./glossary";

const DRAWER_WIDTH =
  "w-full sm:w-[44rem] md:w-[50rem] lg:w-[56rem] xl:w-[60rem] !max-w-[92vw]";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  preset: RandomPreset | null;
  knownClassnames: string[];
}

export function PresetDetailDrawer({
  open,
  onOpenChange,
  preset,
  knownClassnames,
}: Props) {
  const [draft, setDraft] = useState<RandomPreset | null>(preset);
  const upsert = usePresetsUpsert();
  const del = usePresetsDelete();
  const rawXml = usePresetRawXml(open && preset ? preset.name : null);

  useEffect(() => {
    setDraft(preset);
  }, [preset?.name]);

  const dirty = useMemo(() => {
    if (!preset || !draft) return false;
    return JSON.stringify(preset) !== JSON.stringify(draft);
  }, [preset, draft]);

  if (!preset || !draft) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn(DRAWER_WIDTH, "p-0")}>
          <div className="p-6 text-sm text-muted-foreground">
            Pick a preset.
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const isVanilla = preset.source === "vanilla";
  const isCustom = preset.source === "custom";

  const save = () => {
    upsert.mutate([draft], {
      onSuccess: () =>
        toast.success(`saved ${draft.name}`, {
          description: isVanilla
            ? "override written to custom/cfgrandompresets_custom.xml"
            : undefined,
        }),
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const removeOverride = () => {
    del.mutate([preset.name], {
      onSuccess: () => {
        toast.success(`removed override for ${preset.name}`);
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
            <SheetTitle className="font-mono">{preset.name}</SheetTitle>
            <Badge variant="outline" className="uppercase">
              {preset.source}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "uppercase",
                preset.kind === "attachments"
                  ? "text-severity-info"
                  : "text-primary",
              )}
            >
              {preset.kind === "attachments" ? (
                <Layers className="mr-1 h-3 w-3" />
              ) : (
                <Box className="mr-1 h-3 w-3" />
              )}
              {preset.kind}
            </Badge>
          </div>
          <SheetDescription className="text-xs">
            {preset.file || "—"}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="editor" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-3 w-fit">
            <TabsTrigger value="editor">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editor
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
                Vanilla preset — saving writes an override to{" "}
                <code>custom/cfgrandompresets_custom.xml</code>.
              </p>
            ) : null}

            <AboutThisPreset preset={draft} />

            <div className="mb-4 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs">Base chance</Label>
                <InfoTooltip tagline={LOADOUT_FIELDS.presetChance.tagline}>
                  {LOADOUT_FIELDS.presetChance.description}
                </InfoTooltip>
              </div>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={draft.chance}
                onChange={(e) =>
                  setDraft({ ...draft, chance: Number(e.target.value) || 0 })
                }
                className="h-7 w-24 tabular-nums"
              />
            </div>

            <ItemsEditor
              items={draft.items}
              onChange={(next) => setDraft({ ...draft, items: next })}
              knownClassnames={knownClassnames}
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

function ItemsEditor({
  items,
  onChange,
  knownClassnames,
}: {
  items: RandomPreset["items"];
  onChange: (next: RandomPreset["items"]) => void;
  knownClassnames: string[];
}) {
  const update = (idx: number, patch: Partial<RandomPreset["items"][0]>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const getMutedState = useMutedClassnameReason();
  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };
  const add = () => onChange([...items, { name: "", chance: 1.0 }]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Item pool ({items.length})
          </h4>
        </div>
        <Button size="sm" variant="secondary" onClick={add}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add item
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          No items. Add classnames for CE to roll between.
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1fr_80px_64px_32px] gap-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>classname</span>
            <span className="text-right">chance</span>
            <span className="text-right">share</span>
            <span />
          </div>
          {(() => {
            const total = items.reduce(
              (n, it) => n + Math.max(it.chance, 0),
              0,
            );
            return items.map((it, idx) => {
              const share = total > 0 ? Math.max(it.chance, 0) / total : 0;
              return (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_80px_64px_32px] items-center gap-2"
                >
                  <ClassnamePicker
                    value={it.name}
                    onChange={(v) => update(idx, { name: v })}
                    known={knownClassnames}
                    getMutedState={getMutedState}
                  />
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
                    title={`${formatProbability(share)} of the preset roll when the preset fires`}
                  >
                    {formatProbability(share)}
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
            });
          })()}
        </div>
      )}
    </section>
  );
}

function AboutThisPreset({ preset }: { preset: RandomPreset }) {
  if (preset.items.length === 0) {
    return (
      <div className="mb-4 rounded-md border border-dashed border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        {PRESET_EMPTY_HINT}
      </div>
    );
  }
  const total = preset.items.reduce(
    (n, it) => n + Math.max(it.chance, 0),
    0,
  );
  const ranked = [...preset.items]
    .filter((it) => it.chance > 0)
    .sort((a, b) => b.chance - a.chance)
    .slice(0, 3);
  return (
    <div className="mb-4 space-y-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
      <p>
        When a spawnable{" "}
        <code className="font-mono">
          {preset.kind === "attachments" ? "attachments" : "cargo"}
        </code>{" "}
        group references{" "}
        <code className="font-mono">{preset.name || "(unnamed)"}</code>, CE
        rolls this pool at base chance{" "}
        <span className="font-mono text-foreground">
          {formatProbability(preset.chance)}
        </span>{" "}
        (multiplied by the referring group's chance). When it fires, one
        item is picked weighted by these shares:
      </p>
      <ul className="ml-3 list-disc space-y-0.5 text-muted-foreground">
        {ranked.map((it) => (
          <li key={it.name}>
            <code className="font-mono text-foreground">
              {it.name || "(unnamed)"}
            </code>{" "}
            — {formatProbability(total > 0 ? it.chance / total : 0)} of the
            roll
          </li>
        ))}
        {preset.items.length > ranked.length ? (
          <li>
            …and {preset.items.length - ranked.length} more item
            {preset.items.length - ranked.length === 1 ? "" : "s"}.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
