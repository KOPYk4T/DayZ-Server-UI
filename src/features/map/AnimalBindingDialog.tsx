import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  EnvAgent,
  EnvItemKv,
  TerritoryBinding,
} from "@/types/ipc";

/** GroupBehavior classes shipped by vanilla DayZ. The Select offers
 *  these by default; the operator can still type any string (for a
 *  modded behaviour) via the "custom…" option. */
const KNOWN_BEHAVIORS = [
  "DZDeerGroupBeh",
  "DZdomesticGroupBeh",
  "DZSheepGroupBeh",
  "DZWolfGroupBeh",
  "BlissBearGroupBeh",
  "DZAmbientLifeGroupBeh",
] as const;

const TERRITORY_TYPES = ["Herd", "Ambient"] as const;

/** Common `<item>` keys that live at territory level. We don't block
 *  arbitrary keys — the operator can type a custom name — but these
 *  show up as quick-add presets so the usual tuning is one click
 *  away. */
const COMMON_TERRITORY_ITEM_NAMES = [
  "globalCountMax",
  "zoneCountMin",
  "zoneCountMax",
  "herdsCount",
  "playerSpawnRadiusNear",
  "playerSpawnRadiusFar",
  "zoneTouchDisableEditPeriodSec",
];

/** Agent-scoped item keys — per-zone counts for this agent class. */
const COMMON_AGENT_ITEM_NAMES = ["countMin", "countMax"];

export interface AnimalBindingDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** `null` → create mode. Otherwise edit the existing binding. */
  existing?: { binding: TerritoryBinding; filename: string } | null;
  /** Filenames already present in `env/` — we reject dup create
   *  attempts and warn on suspicious matches. */
  existingFilenames: string[];
  /** Bindings already in cfgenvironment — used as presets for the
   *  "Start from existing" dropdown in create mode so operators
   *  don't have to hand-build a Super-Bear from scratch. */
  availablePresets?: TerritoryBinding[];
  /** Called in create mode with the chosen filename + binding. */
  onCreate?: (filename: string, binding: TerritoryBinding) => Promise<void>;
  /** Called in edit mode with the mutated binding (same filename). */
  onEdit?: (binding: TerritoryBinding) => void;
}

export function AnimalBindingDialog({
  open,
  onOpenChange,
  existing,
  existingFilenames,
  availablePresets,
  onCreate,
  onEdit,
}: AnimalBindingDialogProps) {
  const isEdit = !!existing;

  // Create-mode slug drives both the filename and the `file usable`
  // attribute. Keeps the two in lockstep so the game can match
  // them. `slug + "_territories"` is the conventional stem.
  const [slug, setSlug] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [binding, setBinding] = useState<TerritoryBinding>({
    type: "Herd",
    name: "",
    behavior: "DZDeerGroupBeh",
    fileUsable: "",
    agents: [],
    items: [],
  });
  const [behaviorMode, setBehaviorMode] = useState<"known" | "custom">(
    "known",
  );

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setBinding(existing.binding);
      setBehaviorMode(
        KNOWN_BEHAVIORS.includes(
          existing.binding.behavior as (typeof KNOWN_BEHAVIORS)[number],
        )
          ? "known"
          : "custom",
      );
      setSlug("");
      setDisplayName(existing.binding.name);
    } else {
      setBinding({
        type: "Herd",
        name: "",
        behavior: "DZDeerGroupBeh",
        fileUsable: "",
        agents: [],
        items: [],
      });
      setBehaviorMode("known");
      setSlug("");
      setDisplayName("");
    }
  }, [open, existing]);

  const targetFilename = isEdit
    ? existing!.filename
    : slug
      ? `${slug}_territories.xml`
      : "";
  const filenameConflict =
    !isEdit && !!slug && existingFilenames.includes(targetFilename);

  const canSubmit = useMemo(() => {
    if (!binding.name.trim()) return false;
    if (!binding.type.trim()) return false;
    if (!binding.behavior.trim()) return false;
    if (!isEdit) {
      if (!slug) return false;
      if (!/^[a-z0-9_]+$/.test(slug)) return false;
      if (filenameConflict) return false;
    }
    return true;
  }, [binding, isEdit, slug, filenameConflict]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const stem = isEdit
      ? existing!.filename.replace(/\.xml$/, "")
      : `${slug}_territories`;
    const final: TerritoryBinding = {
      ...binding,
      fileUsable: stem,
    };
    if (isEdit) {
      onEdit?.(final);
      onOpenChange(false);
    } else {
      try {
        await onCreate?.(targetFilename, final);
        onOpenChange(false);
      } catch (err) {
        // onCreate is expected to surface its own toast on failure.
        // We swallow here so the dialog stays open for retry.
        void err;
      }
    }
  };

  const updateAgent = (idx: number, next: EnvAgent) => {
    setBinding((b) => ({
      ...b,
      agents: b.agents.map((a, i) => (i === idx ? next : a)),
    }));
  };
  const addAgent = () => {
    setBinding((b) => ({
      ...b,
      agents: [
        ...b.agents,
        { type: "Male", chance: "1", spawns: [], items: [] },
      ],
    }));
  };
  const removeAgent = (idx: number) => {
    setBinding((b) => ({
      ...b,
      agents: b.agents.filter((_, i) => i !== idx),
    }));
  };
  const updateItem = (idx: number, next: EnvItemKv) => {
    setBinding((b) => ({
      ...b,
      items: b.items.map((it, i) => (i === idx ? next : it)),
    }));
  };
  const addItem = (name = "") => {
    setBinding((b) => ({
      ...b,
      items: [...b.items, { name, val: "0" }],
    }));
  };
  const removeItem = (idx: number) => {
    setBinding((b) => ({
      ...b,
      items: b.items.filter((_, i) => i !== idx),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? `Edit binding — ${existing!.binding.name}`
              : "Add custom animal / infected category"}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? (
              <>
                Changes go into the in-memory draft. Press Save in the
                page header to commit to <code>cfgenvironment.xml</code>.
              </>
            ) : (
              <>
                Creates a new <code>_territories.xml</code> geometry
                file, registers it in <code>cfgenvironment.xml</code>,
                and commits both in one go. Drop zones with the map
                afterwards.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!isEdit ? (
            <>
              {availablePresets && availablePresets.length > 0 ? (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <Label className="text-[11px] font-semibold">
                    Start from an existing binding (optional)
                  </Label>
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (!v) return;
                      const src = availablePresets.find(
                        (b) => b.name === v,
                      );
                      if (!src) return;
                      // Deep-clone so the operator's edits don't
                      // bleed back into the preset's in-store copy.
                      setBinding({
                        type: src.type,
                        name: src.name,
                        behavior: src.behavior,
                        fileUsable: "",
                        agents: src.agents.map((a) => ({
                          type: a.type,
                          chance: a.chance ?? null,
                          spawns: a.spawns.map((s) => ({ ...s })),
                          items: a.items.map((i) => ({ ...i })),
                        })),
                        items: src.items.map((i) => ({ ...i })),
                      });
                      setBehaviorMode(
                        KNOWN_BEHAVIORS.includes(
                          src.behavior as (typeof KNOWN_BEHAVIORS)[number],
                        )
                          ? "known"
                          : "custom",
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— pick a template to copy from —" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePresets.map((b) => (
                        <SelectItem key={b.name} value={b.name}>
                          {b.name} — {b.type} · {b.behavior}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Copies agents + items from the chosen binding as a
                    starting point — e.g. pick <strong>Bear</strong>,
                    then tweak counts / radii below to build a
                    "Super-Bear" territory that spawns the same bear
                    class with denser packs or a bigger player radius.
                  </p>
                </div>
              ) : null}
              <div className="rounded-md border border-dashed border-border/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="mb-1 font-semibold text-foreground">
                  What you can change here
                </p>
                <p>
                  Territory / agent <em>stats</em> are CE-level knobs —
                  how many spawn per zone, how far from players, which
                  existing entity classname to spawn, chance weights.
                  The entity's own stats (HP, damage, speed) come from
                  the mod / game config that defines the class, not
                  from CE. For a truly "stronger" Super-Bear you'd
                  need a mod that provides a beefier bear class —
                  then point the spawn <code>configName</code> at it.
                </p>
              </div>
            </>
          ) : null}
          {!isEdit ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="slug">
                  Filename slug{" "}
                  <span className="text-xs text-muted-foreground">
                    (lowercase, underscores only)
                  </span>
                </Label>
                <Input
                  id="slug"
                  placeholder="unicorn"
                  value={slug}
                  onChange={(e) => {
                    const next = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, "_");
                    setSlug(next);
                    // Keep the binding name in sync with the slug
                    // until the operator explicitly types a name —
                    // the two are independent fields but the vast
                    // majority of the time the name is just the
                    // Title-Cased slug.
                    if (!displayName) {
                      const guess = next
                        .split("_")
                        .filter(Boolean)
                        .map((w) => w[0].toUpperCase() + w.slice(1))
                        .join("");
                      setBinding((b) => ({ ...b, name: guess }));
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Saves to{" "}
                  <code>
                    env/{targetFilename || "<slug>_territories.xml"}
                  </code>
                </p>
                {filenameConflict ? (
                  <p className="text-[11px] text-severity-error">
                    A territory file with this name already exists.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  placeholder="Unicorn"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setBinding((b) => ({ ...b, name: e.target.value }));
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Used as the <code>name</code> attribute on the
                  binding. The game uses it as an internal key — must
                  be unique within cfgenvironment.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            {isEdit ? (
              <div className="space-y-1">
                <Label htmlFor="name">Binding name</Label>
                <Input
                  id="name"
                  value={binding.name}
                  onChange={(e) =>
                    setBinding((b) => ({ ...b, name: e.target.value }))
                  }
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={
                  TERRITORY_TYPES.includes(
                    binding.type as (typeof TERRITORY_TYPES)[number],
                  )
                    ? binding.type
                    : "__custom__"
                }
                onValueChange={(v) => {
                  if (v === "__custom__") return;
                  setBinding((b) => ({ ...b, type: v }));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TERRITORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                  {!TERRITORY_TYPES.includes(
                    binding.type as (typeof TERRITORY_TYPES)[number],
                  ) ? (
                    <SelectItem value="__custom__" disabled>
                      {binding.type} (custom)
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                <strong>Herd</strong> for packed fauna / infected,{" "}
                <strong>Ambient</strong> for hen / hare / fox scatter.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Behaviour class</Label>
            <div className="flex gap-2">
              <Select
                value={behaviorMode === "known" ? binding.behavior : "__custom"}
                onValueChange={(v) => {
                  if (v === "__custom") {
                    setBehaviorMode("custom");
                  } else {
                    setBehaviorMode("known");
                    setBinding((b) => ({ ...b, behavior: v }));
                  }
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_BEHAVIORS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom">custom…</SelectItem>
                </SelectContent>
              </Select>
              {behaviorMode === "custom" ? (
                <Input
                  className="flex-1"
                  placeholder="ModAuthorGroupBeh"
                  value={binding.behavior}
                  onChange={(e) =>
                    setBinding((b) => ({ ...b, behavior: e.target.value }))
                  }
                />
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              GroupBehavior script class that drives flocking / aggression
              / movement. Authored in scripts — the tool treats it as an
              opaque string.
            </p>
          </div>

          {/* Agents */}
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Agents ({binding.agents.length})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={addAgent}
                className="h-7 px-2 text-[11px]"
              >
                <Plus className="mr-1 h-3 w-3" /> Add agent
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Each agent block picks one entity class (or one of a weighted
              set). Omit agents entirely for a pure geometry binding —
              vanilla does this for the four-legged herds which inherit
              defaults from the GroupBehavior.
            </p>
            {binding.agents.map((agent, idx) => (
              <AgentEditor
                key={idx}
                agent={agent}
                onChange={(next) => updateAgent(idx, next)}
                onRemove={() => removeAgent(idx)}
              />
            ))}
          </div>

          {/* Territory-level items */}
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">
                Territory parameters ({binding.items.length})
              </Label>
              <div className="flex gap-1">
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!v) return;
                    if (binding.items.some((i) => i.name === v)) {
                      toast.message(`${v} is already set`);
                      return;
                    }
                    addItem(v);
                  }}
                >
                  <SelectTrigger className="h-7 w-36 px-2 text-[11px]">
                    <SelectValue placeholder="Quick-add" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TERRITORY_ITEM_NAMES.map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => addItem()}
                  className="h-7 px-2 text-[11px]"
                  title="Add custom item"
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {binding.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Input
                  className="flex-1 font-mono text-[11px]"
                  placeholder="name"
                  value={it.name}
                  onChange={(e) =>
                    updateItem(idx, { ...it, name: e.target.value })
                  }
                />
                <Input
                  className="flex-1 font-mono text-[11px]"
                  placeholder="value"
                  value={it.val}
                  onChange={(e) =>
                    updateItem(idx, { ...it, val: e.target.value })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeItem(idx)}
                  className="h-7 w-7 text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? "Apply" : "Create animal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AgentEditor({
  agent,
  onChange,
  onRemove,
}: {
  agent: EnvAgent;
  onChange: (next: EnvAgent) => void;
  onRemove: () => void;
}) {
  const addSpawn = () => {
    onChange({
      ...agent,
      spawns: [...agent.spawns, { configName: "", chance: "1" }],
    });
  };
  const addItem = (name = "") => {
    onChange({
      ...agent,
      items: [...agent.items, { name, val: "0" }],
    });
  };
  return (
    <div className="space-y-2 rounded-md bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <Input
          className="flex-1 text-[11px]"
          placeholder="Male / Female / AgentType:…"
          value={agent.type}
          onChange={(e) => onChange({ ...agent, type: e.target.value })}
        />
        <Input
          className="w-20 font-mono text-[11px]"
          placeholder="chance"
          value={agent.chance ?? ""}
          onChange={(e) =>
            onChange({
              ...agent,
              chance: e.target.value.trim() ? e.target.value : null,
            })
          }
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onRemove}
          className="h-7 w-7 text-destructive"
          title="Remove agent"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="pl-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Spawns
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={addSpawn}
            className="h-6 px-2 text-[10px]"
          >
            <Plus className="mr-0.5 h-3 w-3" /> Spawn
          </Button>
        </div>
        {agent.spawns.map((s, i) => (
          <div key={i} className="mb-1 flex items-center gap-2">
            <Input
              className="flex-1 font-mono text-[11px]"
              placeholder="Animal_ClassName"
              value={s.configName}
              onChange={(e) =>
                onChange({
                  ...agent,
                  spawns: agent.spawns.map((x, j) =>
                    j === i ? { ...x, configName: e.target.value } : x,
                  ),
                })
              }
            />
            <Input
              className="w-20 font-mono text-[11px]"
              placeholder="chance"
              value={s.chance ?? ""}
              onChange={(e) =>
                onChange({
                  ...agent,
                  spawns: agent.spawns.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          chance: e.target.value.trim()
                            ? e.target.value
                            : null,
                        }
                      : x,
                  ),
                })
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...agent,
                  spawns: agent.spawns.filter((_, j) => j !== i),
                })
              }
              className="h-6 w-6 text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <div className="pl-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Per-agent items
          </span>
          <div className="flex gap-1">
            <Select
              value=""
              onValueChange={(v) => v && addItem(v)}
            >
              <SelectTrigger className="h-6 w-24 px-2 text-[10px]">
                <SelectValue placeholder="Preset" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_AGENT_ITEM_NAMES.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {agent.items.map((it, i) => (
          <div key={i} className="mb-1 flex items-center gap-2">
            <Input
              className="flex-1 font-mono text-[11px]"
              placeholder="name"
              value={it.name}
              onChange={(e) =>
                onChange({
                  ...agent,
                  items: agent.items.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  ),
                })
              }
            />
            <Input
              className="flex-1 font-mono text-[11px]"
              placeholder="value"
              value={it.val}
              onChange={(e) =>
                onChange({
                  ...agent,
                  items: agent.items.map((x, j) =>
                    j === i ? { ...x, val: e.target.value } : x,
                  ),
                })
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...agent,
                  items: agent.items.filter((_, j) => j !== i),
                })
              }
              className="h-6 w-6 text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
