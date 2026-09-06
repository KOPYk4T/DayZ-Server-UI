import { useEffect, useMemo, useState } from "react";
import {
  Code,
  ExternalLink,
  Loader2,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  useEventRawXml,
  useEventsUpsert,
} from "@/hooks/useEvents";
import { cn, errorMessage } from "@/lib/utils";
import type {
  DynamicEvent,
  EventChild,
  EventPosition,
  EventSpawnGroup,
} from "@/types/ipc";

import { CHILD_FIELDS, EVENT_FIELDS, POSITION_FIELDS } from "./glossary";

// Event edit is the densest drawer we have: 8-field grid, children
// table with 6 columns, positions table with 5 columns. We grow the
// drawer with viewport width so columns stay legible on 1400px+
// windows while remaining usable on narrow ones.
const DRAWER_WIDTH =
  "w-full sm:w-[48rem] md:w-[54rem] lg:w-[60rem] xl:w-[66rem] max-w-[92vw] !max-w-[92vw]";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  event: DynamicEvent | null;
  spawns: EventSpawnGroup | null;
  knownClassnames: string[];
  /** When true the drawer opens in create-mode — name field is
   *  editable, vanilla banners are skipped, and the initial draft
   *  comes from whatever blank template the caller passed. */
  isNew?: boolean;
}

export function EventDetailDrawer({
  open,
  onOpenChange,
  event,
  spawns,
  knownClassnames,
  isNew = false,
}: Props) {
  const [draftEvent, setDraftEvent] = useState<DynamicEvent | null>(event);
  const [draftSpawns, setDraftSpawns] = useState<EventSpawnGroup | null>(
    spawns ?? null,
  );
  const upsert = useEventsUpsert();
  const rawXml = useEventRawXml(
    open && event && !isNew ? event.name : null,
  );

  useEffect(() => {
    setDraftEvent(event);
    setDraftSpawns(spawns ?? null);
  }, [event?.name, spawns?.eventName, isNew]);

  const dirty = useMemo(() => {
    if (!draftEvent) return false;
    // In create mode any non-empty name counts as "dirty enough to
    // submit" — the user never sees the pristine template as a
    // valid save target because the name is required.
    if (isNew) {
      return draftEvent.name.trim().length > 0;
    }
    if (!event) return false;
    if (JSON.stringify(event) !== JSON.stringify(draftEvent)) return true;
    const a = spawns ?? null;
    const b = draftSpawns ?? null;
    if (a === null && b === null) return false;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, [isNew, event, draftEvent, spawns, draftSpawns]);

  if (!draftEvent) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className={cn(DRAWER_WIDTH, "p-0")}>
          <div className="p-6 text-sm text-muted-foreground">Pick an event.</div>
        </SheetContent>
      </Sheet>
    );
  }

  // Classname validity for new events — matches Bohemia's config
  // ident rules: starts with a letter, no spaces or punctuation
  // beyond `_`. A collision with an existing event name still lets
  // the save through; the backend upsert treats same-name as an
  // edit.
  const nameValid =
    !isNew || /^[A-Za-z][A-Za-z0-9_]*$/.test(draftEvent.name.trim());

  const save = () => {
    const spawnList: EventSpawnGroup[] = [];
    if (draftSpawns && draftSpawns.positions.length > 0) {
      spawnList.push({
        ...draftSpawns,
        eventName: draftEvent.name,
      });
    } else if (spawns && (!draftSpawns || draftSpawns.positions.length === 0)) {
      // User cleared all positions — push an empty group so the override
      // replaces the vanilla positions with nothing.
      spawnList.push({
        eventName: draftEvent.name,
        positions: [],
        source: "custom",
        modId: null,
        file: "",
      });
    }

    upsert.mutate(
      { events: [draftEvent], spawns: spawnList },
      {
        onSuccess: () => {
          toast.success(
            isNew
              ? `created ${draftEvent.name}`
              : `saved ${draftEvent.name}`,
            {
              description: isNew
                ? "written to custom/events_custom.xml — add positions next, then hook into cfgeventspawns."
                : event?.source === "vanilla"
                  ? "override written to custom/events_custom.xml"
                  : undefined,
            },
          );
          if (isNew) onOpenChange(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const isVanilla = !isNew && event?.source === "vanilla";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("flex flex-col gap-0 p-0", DRAWER_WIDTH)}
      >
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2">
            <SheetTitle className="font-mono">
              {isNew ? "New event" : event?.name}
            </SheetTitle>
            <Badge variant="outline" className="uppercase">
              {isNew ? "custom" : event?.source}
            </Badge>
            <Badge variant="outline" className="uppercase">
              {draftEvent.position}
            </Badge>
            {!isNew && event && event.active > 0 ? null : !isNew ? (
              <Badge variant="outline" className="text-muted-foreground">
                disabled
              </Badge>
            ) : null}
          </div>
          <SheetDescription className="text-xs">
            {isNew
              ? "Fill in the name + fields, then press Save. Add children / positions from their tabs before or after the first save."
              : event?.file || "—"}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="fields" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-3 w-fit">
            <TabsTrigger value="fields">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Fields
            </TabsTrigger>
            <TabsTrigger value="children">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Children ({draftEvent.children.length})
            </TabsTrigger>
            <TabsTrigger value="positions">
              <MapPin className="mr-1.5 h-3.5 w-3.5" />
              Positions ({draftSpawns?.positions.length ?? 0})
            </TabsTrigger>
            {isNew ? null : (
              <TabsTrigger value="raw">
                <Code className="mr-1.5 h-3.5 w-3.5" /> Raw XML
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent
            value="fields"
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-4"
          >
            {isVanilla ? (
              <p className="mb-3 rounded-md border border-severity-warning/30 bg-severity-warning/5 p-2 text-xs text-severity-warning">
                Vanilla event — saving writes an override to{" "}
                <code>custom/events_custom.xml</code>.
              </p>
            ) : null}
            {isNew ? (
              <div className="mb-4 space-y-1">
                <Label
                  htmlFor="event-name"
                  className="text-xs font-semibold"
                >
                  Event name *
                </Label>
                <Input
                  id="event-name"
                  value={draftEvent.name}
                  onChange={(e) =>
                    setDraftEvent({
                      ...draftEvent,
                      name: e.target.value,
                    })
                  }
                  placeholder="StaticHeli_SIB"
                  className="font-mono"
                />
                {draftEvent.name && !nameValid ? (
                  <p className="text-[11px] text-severity-error">
                    Must start with a letter; only letters, digits,
                    and underscores.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Convention: prefix with kind — <code>Static*</code>{" "}
                    for world-spawned, <code>VehicleHeli*</code> for
                    paired vehicle events, <code>Animal*</code> for
                    fauna.
                  </p>
                )}
              </div>
            ) : null}
            <EventFieldsForm value={draftEvent} onChange={setDraftEvent} />
          </TabsContent>

          <TabsContent
            value="children"
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-4"
          >
            <ChildrenEditor
              value={draftEvent.children}
              onChange={(next) =>
                setDraftEvent({ ...draftEvent, children: next })
              }
              knownClassnames={knownClassnames}
            />
          </TabsContent>

          <TabsContent
            value="positions"
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-4"
          >
            <PositionsEditor
              eventName={draftEvent.name}
              value={draftSpawns}
              onChange={setDraftSpawns}
              positionKind={draftEvent.position}
              limit={draftEvent.limit}
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

        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-card/60 px-6 py-3">
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || !nameValid || upsert.isPending}
            title={
              isNew && !nameValid
                ? "Fill in a valid event name before saving"
                : undefined
            }
          >
            {upsert.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- Fields form ----------

function EventFieldsForm({
  value,
  onChange,
}: {
  value: DynamicEvent;
  onChange: (next: DynamicEvent) => void;
}) {
  const num = (key: keyof DynamicEvent) => ({
    value: value[key] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = Number(e.target.value);
      onChange({ ...value, [key]: Number.isFinite(n) ? n : 0 });
    },
  });

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-4 gap-3">
        <NumField label="nominal" tagline={EVENT_FIELDS.nominal.tagline} description={EVENT_FIELDS.nominal.description} {...num("nominal")} />
        <NumField label="min" tagline={EVENT_FIELDS.min.tagline} description={EVENT_FIELDS.min.description} {...num("min")} />
        <NumField label="max" tagline={EVENT_FIELDS.max.tagline} description={EVENT_FIELDS.max.description} {...num("max")} />
        <NumField label="lifetime" tagline={EVENT_FIELDS.lifetime.tagline} description={EVENT_FIELDS.lifetime.description} {...num("lifetime")} />
        <NumField label="restock" tagline={EVENT_FIELDS.restock.tagline} description={EVENT_FIELDS.restock.description} {...num("restock")} />
        <NumField label="saferadius" tagline={EVENT_FIELDS.saferadius.tagline} description={EVENT_FIELDS.saferadius.description} {...num("saferadius")} />
        <NumField label="distanceradius" tagline={EVENT_FIELDS.distanceradius.tagline} description={EVENT_FIELDS.distanceradius.description} {...num("distanceradius")} />
        <NumField label="cleanupradius" tagline={EVENT_FIELDS.cleanupradius.tagline} description={EVENT_FIELDS.cleanupradius.description} {...num("cleanupradius")} />
      </section>

      <Separator />

      <section className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <LabelWithHelp label="Position" tagline={EVENT_FIELDS.position.tagline} description={EVENT_FIELDS.position.description} />
          <Select
            value={value.position}
            onValueChange={(v) =>
              onChange({ ...value, position: v as DynamicEvent["position"] })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">fixed</SelectItem>
              <SelectItem value="random">random</SelectItem>
              <SelectItem value="player">player</SelectItem>
              <SelectItem value="uniform">uniform</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <LabelWithHelp label="Limit" tagline={EVENT_FIELDS.limit.tagline} description={EVENT_FIELDS.limit.description} />
          <Select
            value={value.limit}
            onValueChange={(v) =>
              onChange({ ...value, limit: v as DynamicEvent["limit"] })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mixed">mixed</SelectItem>
              <SelectItem value="child">child</SelectItem>
              <SelectItem value="parent">parent</SelectItem>
              <SelectItem value="custom">custom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <LabelWithHelp label="Active" tagline={EVENT_FIELDS.active.tagline} description={EVENT_FIELDS.active.description} />
          <div className="flex h-8 items-center">
            <Switch
              checked={value.active > 0}
              onCheckedChange={(v) =>
                onChange({ ...value, active: v ? 1 : 0 })
              }
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-2">
        <LabelWithHelp label="Flags" tagline={EVENT_FIELDS.flags.tagline} description={EVENT_FIELDS.flags.description} />
        <div className="grid grid-cols-3 gap-3">
          <FlagRow
            label="deletable"
            checked={value.flags.deletable === 1}
            onChange={(v) =>
              onChange({
                ...value,
                flags: { ...value.flags, deletable: v ? 1 : 0 },
              })
            }
          />
          <FlagRow
            label="init_random"
            checked={value.flags.init_random === 1}
            onChange={(v) =>
              onChange({
                ...value,
                flags: { ...value.flags, init_random: v ? 1 : 0 },
              })
            }
          />
          <FlagRow
            label="remove_damaged"
            checked={value.flags.remove_damaged === 1}
            onChange={(v) =>
              onChange({
                ...value,
                flags: { ...value.flags, remove_damaged: v ? 1 : 0 },
              })
            }
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-1.5">
        <LabelWithHelp label="Secondary event" tagline={EVENT_FIELDS.secondary.tagline} description={EVENT_FIELDS.secondary.description} />
        <Input
          value={value.secondary ?? ""}
          onChange={(e) =>
            onChange({ ...value, secondary: e.target.value || null })
          }
          placeholder="(none)"
          className="font-mono"
        />
      </section>
    </div>
  );
}

function NumField({
  label,
  tagline,
  description,
  value,
  onChange,
}: {
  label: string;
  tagline?: string;
  description?: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <LabelWithHelp label={label} tagline={tagline} description={description} />
      <Input
        type="number"
        value={value}
        onChange={onChange}
        className="h-8 tabular-nums"
      />
    </div>
  );
}

function LabelWithHelp({
  label,
  tagline,
  description,
}: {
  label: string;
  tagline?: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs">{label}</Label>
      {description ? (
        <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
      ) : null}
    </div>
  );
}

function ColumnHeader({
  label,
  def,
  align = "start",
}: {
  label: string;
  def?: { tagline?: string; description: string };
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
      {def ? (
        <InfoTooltip tagline={def.tagline} side="top">
          {def.description}
        </InfoTooltip>
      ) : null}
    </span>
  );
}

function FlagRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5">
      <span className="font-mono text-[11px]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

// ---------- Children editor ----------

function ChildrenEditor({
  value,
  onChange,
  knownClassnames,
}: {
  value: EventChild[];
  onChange: (next: EventChild[]) => void;
  knownClassnames: string[];
}) {
  const navigate = useNavigate();
  const getMutedState = useMutedClassnameReason();
  const update = (idx: number, patch: Partial<EventChild>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };
  const add = () =>
    onChange([
      ...value,
      { lootmax: 1, lootmin: 1, max: 1, min: 1, type: "" },
    ]);
  const jumpToSpawnable = (classname: string) => {
    const name = classname.trim();
    if (!name) return;
    navigate(
      `/app/loadouts?tab=spawnables&name=${encodeURIComponent(name)}`,
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <LabelWithHelp
          label="Children (classnames spawned by this event)"
          tagline={EVENT_FIELDS.children.tagline}
          description={EVENT_FIELDS.children.description}
        />
        <Button size="sm" variant="secondary" onClick={add}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add child
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          No children. Add at least one classname for the event to spawn
          something in-world.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_64px_64px_64px_64px_32px_32px] gap-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <ColumnHeader label="classname" def={CHILD_FIELDS.classname} />
            <ColumnHeader
              label="lootmin"
              def={CHILD_FIELDS.lootmin}
              align="end"
            />
            <ColumnHeader
              label="lootmax"
              def={CHILD_FIELDS.lootmax}
              align="end"
            />
            <ColumnHeader label="min" def={CHILD_FIELDS.min} align="end" />
            <ColumnHeader label="max" def={CHILD_FIELDS.max} align="end" />
            <span />
            <span />
          </div>
          {value.map((c, idx) => (
            <div
              key={`${c.type}-${idx}`}
              className="grid grid-cols-[1fr_64px_64px_64px_64px_32px_32px] items-center gap-2"
            >
              <ClassnamePicker
                value={c.type}
                onChange={(v) => update(idx, { type: v })}
                known={knownClassnames}
                getMutedState={getMutedState}
              />
              <Input
                type="number"
                value={c.lootmin}
                onChange={(e) =>
                  update(idx, { lootmin: Number(e.target.value) || 0 })
                }
                className="h-7 tabular-nums"
              />
              <Input
                type="number"
                value={c.lootmax}
                onChange={(e) =>
                  update(idx, { lootmax: Number(e.target.value) || 0 })
                }
                className="h-7 tabular-nums"
              />
              <Input
                type="number"
                value={c.min}
                onChange={(e) =>
                  update(idx, { min: Number(e.target.value) || 0 })
                }
                className="h-7 tabular-nums"
              />
              <Input
                type="number"
                value={c.max}
                onChange={(e) =>
                  update(idx, { max: Number(e.target.value) || 0 })
                }
                className="h-7 tabular-nums"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => jumpToSpawnable(c.type)}
                disabled={c.type.trim() === ""}
                aria-label={`open spawnable loadout for ${c.type || "this child"}`}
                title="Open this child's loadout in the Loadouts page (cfgspawnabletypes entry)"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(idx)}
                aria-label={`remove child ${idx + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Positions editor ----------

function PositionsEditor({
  eventName,
  value,
  onChange,
  positionKind,
  limit,
}: {
  eventName: string;
  value: EventSpawnGroup | null;
  onChange: (next: EventSpawnGroup | null) => void;
  positionKind: DynamicEvent["position"];
  limit: DynamicEvent["limit"];
}) {
  const navigate = useNavigate();
  const positions = value?.positions ?? [];
  const fixed = positionKind === "fixed";
  const scriptPlaced = limit === "custom";

  const update = (idx: number, patch: Partial<EventPosition>) => {
    const next = positions.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    writePositions(next);
  };
  const remove = (idx: number) => {
    writePositions(positions.filter((_, i) => i !== idx));
  };
  const add = () => {
    writePositions([
      ...positions,
      { x: 0, y: 0, z: 0, a: -1, group: null },
    ]);
  };

  function writePositions(next: EventPosition[]) {
    if (value) {
      onChange({ ...value, positions: next });
    } else {
      onChange({
        eventName,
        positions: next,
        source: "custom",
        modId: null,
        file: "",
      });
    }
  }

  return (
    <div className="space-y-3">
      {scriptPlaced ? (
        <p className="rounded-md border border-severity-info/30 bg-severity-info/5 p-2 text-xs text-muted-foreground">
          This event has <strong>limit = custom</strong>, which means a
          script-side spawner decides where to place it — the{" "}
          <em>infected territories</em> system for zombies, the{" "}
          <em>animal zones</em> system for wildlife, or mod-specific
          spawners. CE ignores the positions below for this event even
          though its position mode reads &ldquo;fixed&rdquo; — an empty
          list is normal and doesn't mean the event won't spawn.
        </p>
      ) : !fixed ? (
        <p className="rounded-md border border-severity-info/30 bg-severity-info/5 p-2 text-xs text-muted-foreground">
          This event's position mode is <strong>random</strong>, so
          cfgeventspawns positions aren't used. Switch to{" "}
          <strong>fixed</strong> in the Fields tab to anchor it to
          specific coordinates.
        </p>
      ) : null}
      <div className="flex items-center justify-between">
        <LabelWithHelp
          label="Positions (cfgeventspawns.xml)"
          tagline={EVENT_FIELDS.positions.tagline}
          description={EVENT_FIELDS.positions.description}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              navigate(
                `/app/map?layer=event-positions&name=${encodeURIComponent(eventName)}`,
              )
            }
            disabled={positions.length === 0}
            title={
              positions.length === 0
                ? "No positions to display yet"
                : `Show ${positions.length} position${positions.length === 1 ? "" : "s"} on the map`
            }
          >
            <MapIcon className="mr-1.5 h-3.5 w-3.5" /> Show on map
          </Button>
          <Button size="sm" variant="secondary" onClick={add}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add position
          </Button>
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          {scriptPlaced
            ? "No positions defined. That's normal for custom-limit events — the script-side spawner handles placement."
            : !fixed
              ? "No positions defined. Random-position events don't use cfgeventspawns anyway."
              : "No positions defined. A fixed-position event without entries here will never spawn."}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[90px_90px_72px_1fr_32px] gap-2 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <ColumnHeader label="x" def={POSITION_FIELDS.x} />
            <ColumnHeader label="z" def={POSITION_FIELDS.z} />
            <ColumnHeader label="yaw (a)" def={POSITION_FIELDS.a} />
            <ColumnHeader label="group" def={POSITION_FIELDS.group} />
            <span />
          </div>
          {positions.map((p, idx) => (
            <div
              key={idx}
              className={cn(
                "grid grid-cols-[90px_90px_72px_1fr_32px] items-center gap-2",
              )}
            >
              <Input
                type="number"
                value={p.x}
                onChange={(e) =>
                  update(idx, { x: Number(e.target.value) || 0 })
                }
                className="h-7 tabular-nums"
              />
              <Input
                type="number"
                value={p.z}
                onChange={(e) =>
                  update(idx, { z: Number(e.target.value) || 0 })
                }
                className="h-7 tabular-nums"
              />
              <Input
                type="number"
                value={p.a}
                onChange={(e) =>
                  update(idx, { a: Number(e.target.value) || -1 })
                }
                className="h-7 tabular-nums"
              />
              <Input
                value={p.group ?? ""}
                onChange={(e) =>
                  update(idx, { group: e.target.value || null })
                }
                placeholder="(no group)"
                className="h-7 font-mono"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(idx)}
                aria-label={`remove position ${idx + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
