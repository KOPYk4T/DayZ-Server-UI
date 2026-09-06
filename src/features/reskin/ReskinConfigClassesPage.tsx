import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileCode,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import * as tauri from "@/lib/tauri";
import { errorMessage, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  ConfigClassEntry,
  ConfigClassKind,
  ItemType,
  ReskinRegistry,
} from "@/types/ipc";

/** Build a minimal types.xml entry for a freshly-created New config
 *  class. Shape mirrors how VANILLA Chernarus registers the
 *  equivalent class — look at any Animal_X, ZmbM_X, or standard
 *  item in db/types.xml and you'll see these exact fields. The
 *  operator tunes category / usage / value / nominal in the Items
 *  page later; this is the minimum that makes the classname
 *  addressable from events / loadouts / cfgeventspawns.
 *
 *  Shape per kind:
 *  - Animals (Animal_X parent): nominal=0, min=0, lifetime=1800.
 *    Matches vanilla UrsusArctos / VulpesVulpes / etc. exactly.
 *  - Infected (Zmb-prefixed parent): nominal=0, min=1,
 *    lifetime=1800. Matches vanilla ZmbM_X and ZmbF_X which use
 *    min=1 (CE always keeps at least one available to the infected
 *    manager).
 *  - Items (anything else): nominal=0, min=0, lifetime=14400 —
 *    4hr world persist, default for most loot items. */
function makeTypesStub(
  classname: string,
  kind: "animal" | "infected" | "item",
): ItemType {
  const lifetime = kind === "item" ? 14_400 : 1_800;
  const min = kind === "infected" ? 1 : 0;
  return {
    name: classname,
    nominal: 0,
    lifetime,
    restock: 0,
    min,
    quantmin: -1,
    quantmax: -1,
    cost: 100,
    flags: {
      count_in_cargo: 0,
      count_in_hoarder: 0,
      count_in_map: 1,
      count_in_player: 0,
      crafted: 0,
      deloot: 0,
    },
    category: null,
    tags: [],
    usage: [],
    value: [],
    source: "custom",
    modId: null,
    file: "",
  };
}

/** Back-fill helper that matches the Rust-side
 *  `ConfigClassEntry::effective_kind` — an explicit `kind` wins,
 *  otherwise infer from the parent shape so pre-kind registry data
 *  still renders sensibly. */
function effectiveKind(entry: ConfigClassEntry): ConfigClassKind {
  if (entry.kind) return entry.kind;
  const p = (entry.parent ?? "").trim();
  if (p === "" || p.toLowerCase() === entry.classname.toLowerCase()) {
    return "override";
  }
  return "new";
}

/** Classify a config class's entity kind from its parent so the
 *  types.xml stub can match vanilla's per-kind shape. Vanilla
 *  Chernarus registers animals with `min=0, lifetime=1800`, infected
 *  with `min=1, lifetime=1800`, and items (weapons / clothing / food
 *  / containers) with `lifetime=14400` — we generate stubs in the
 *  same shape so CE reads them consistently with the surrounding
 *  vanilla entries.
 *
 *  Detection is purposefully permissive on the parent-name match —
 *  a false-negative here means the operator gets an item-shaped
 *  stub for their custom bear (30-minute lifetime would be wrong;
 *  they'll tune it from the Items page anyway). */
function entityKindFromParent(
  entry: ConfigClassEntry,
): "animal" | "infected" | "item" {
  const p = (entry.parent ?? "").trim().toLowerCase();
  if (!p) return "item";
  if (
    p.startsWith("animal_") ||
    p === "animal_base" ||
    p === "dayzanimal"
  ) {
    return "animal";
  }
  if (
    p.startsWith("zmb") || // ZmbM_* / ZmbF_* / ZmbM_SoldierNormal / etc.
    p === "dayzinfected" ||
    p === "zombiebase"
  ) {
    return "infected";
  }
  return "item";
}

const CONTAINERS = [
  "CfgVehicles",
  "CfgWeapons",
  "CfgAmmo",
  "CfgMagazines",
  "CfgNonAIVehicles",
] as const;

/** Starter templates that drop into the body field when a user picks
 *  one. Each template can also preset the `parent` and `container`
 *  dropdowns so the operator only has to pick a classname to ship.
 *
 *  Conventions: `scope = 2;` makes the class visible to the spawn
 *  system (vanilla base classes are usually `scope = 0`, hidden). The
 *  hiddenSelections / hiddenSelectionsTextures pair is the standard
 *  Enfusion shortcut for recolouring an entity without re-shipping
 *  the .p3d — the procedural-colour syntax `#(argb,8,8,3)color(...)`
 *  is Bohemia's built-in shader. */
const TEMPLATES: {
  label: string;
  parent: string;
  container?: string;
  body: string;
}[] = [
  // ---------- Animals ----------
  {
    label: "Animal: Stronger bear (doubled HP)",
    parent: "Animal_UrsusArctos",
    container: "CfgVehicles",
    body: `scope = 2;
displayName = "Super Bear";
// Health bump — everything else inherits from the parent.
class DamageSystem {
    class GlobalHealth {
        class Health {
            hitpoints = 2000;
        };
    };
};`,
  },
  {
    label: "Animal: Stronger bear variant",
    parent: "Animal_UrsusArctos",
    container: "CfgVehicles",
    body: `scope = 2;
displayName = "Super Bear";

// Quadrupled HP so a single well-placed shot doesn't drop it. Base
// DamageSystem / GlobalHealth / Health.hitpoints is the knob CE
// config can reach without modding the .p3d.
class DamageSystem {
    class GlobalHealth {
        class Health {
            hitpoints = 4000;
        };
    };
};

// Things that look tempting but DON'T work on CfgVehicles animals:
//   - scale = 2.0;        // ignored — animal size lives in the .p3d
//   - hiddenSelections[]  // bears have no selection slots in vanilla
//                         // config, so texture overrides don't bind
// Both require actually shipping a modified model — full mod-
// authoring territory, not CE config.
//
// IMPORTANT — for AI behaviour (patrol, aggro) to kick in on this
// class, you ALSO need to register a Territory binding in
// cfgenvironment.xml:
//   Map editor → Territories panel → "+ Add custom animal"
//   slug: super_bear, behavior: BlishBearGroupBeh,
//   agent spawn configName: SuperBear
// Dynamic events spawn the entity; the Territory binding is what
// attaches the scripted AI. Without it your SuperBear just stands
// in idle.`,
  },
  {
    label: "Animal: Fast dire wolf",
    parent: "Animal_CanisLupus_Grey",
    container: "CfgVehicles",
    body: `scope = 2;
displayName = "Dire Wolf";
class AnimMovementInfo {
    class Flags {
        sprint = 1;
    };
};
class DamageSystem {
    class GlobalHealth {
        class Health {
            hitpoints = 600;
        };
    };
};`,
  },

  // ---------- Infected ----------
  {
    label: "Infected: Tanky zombie (triple HP)",
    parent: "ZmbM_SoldierNormal",
    container: "CfgVehicles",
    body: `scope = 2;
displayName = "Hardened Soldier";
// Parent is a concrete zombie class (no _Base suffix) so the AI
// modules inherit properly. Subclassing a _Base class can leave
// the AI agent incomplete and the infected just stands still.
class DamageSystem {
    class GlobalHealth {
        class Health {
            hitpoints = 600;
        };
    };
};

// FOR AI BEHAVIOUR: this class works with dynamic-event spawns
// because it derives from a fully-configured zombie. If the
// infected spawns idle, the fix is registering a zombie territory
// binding in cfgenvironment.xml via Map editor → Territories panel.`,
  },
  {
    label: "Infected: Blood-red berserker",
    parent: "ZmbM_SoldierNormal",
    container: "CfgVehicles",
    body: `scope = 2;
displayName = "Berserker";
// Concrete parent (not _Base) so the AI agent inherits the full
// zombie behaviour suite. Extra HP + red uniform recolour so it
// reads clearly at range.
class DamageSystem {
    class GlobalHealth {
        class Health {
            hitpoints = 800;
        };
    };
};

// Zombies DO have hiddenSelections (personality/camo/insignia) so
// this procedural recolour actually binds — unlike with animals.
hiddenSelections[] = {"personality","camo","insignia"};
hiddenSelectionsTextures[] = {
    "#(argb,8,8,3)color(0.7,0.05,0.05,1.0,CO)",
    "#(argb,8,8,3)color(0.7,0.05,0.05,1.0,CO)",
    ""
};

// FOR AI BEHAVIOUR: inherits from a concrete zombie so dynamic-
// event spawns should aggro correctly. If your Berserker stays
// idle, register a zombie_territories binding in cfgenvironment
// via Map editor → Territories panel — that attaches the scripted
// AI even when dynamic events alone don't.`,
  },

  // ---------- Items / weapons ----------
  {
    label: "Item: Durability-boosted weapon (AKM)",
    parent: "AKM",
    container: "CfgWeapons",
    body: `scope = 2;
displayName = "Reinforced AKM";
class DamageSystem {
    class GlobalHealth {
        class Health {
            hitpoints = 4000;       // vanilla AKM is ~1000
            healthLevels[] = {
                {1.0,{"DZ\\\\weapons\\\\rifles\\\\data\\\\akm.rvmat"}},
                {0.7,{"DZ\\\\weapons\\\\rifles\\\\data\\\\akm.rvmat"}},
                {0.5,{"DZ\\\\weapons\\\\rifles\\\\data\\\\akm_damage.rvmat"}},
                {0.3,{"DZ\\\\weapons\\\\rifles\\\\data\\\\akm_damage.rvmat"}},
                {0.0,{"DZ\\\\weapons\\\\rifles\\\\data\\\\akm_destruct.rvmat"}}
            };
        };
    };
};`,
  },
  {
    label: "Item: Long-life food (rice)",
    parent: "Rice",
    container: "CfgVehicles",
    body: `scope = 2;
displayName = "Preserved Rice";
// varQuantityMax stays the same, but nutritional decay slows:
varWetMax = 0;            // doesn't get wet
repairableWithKits[] = {};
// Cut the spoilage rate in half by doubling the decay threshold.
class Food {
    class FoodStages {
        class Raw {
            agents = 0;
        };
    };
};`,
  },

  // ---------- Generic ----------
  {
    label: "Generic: Blank subclass",
    parent: "",
    container: "CfgVehicles",
    body: `scope = 2;
// Add overrides here.`,
  },
  {
    label: "Generic: Pure override (no parent)",
    parent: "",
    container: "CfgVehicles",
    body: `// Leaving the parent blank (or setting it equal to the
// classname in the Parent field above) rewrites the existing class
// by the same name — useful for tweaking a vanilla value without
// shipping a distinct variant. All properties here merge into the
// original class at config-read time.`,
  },
];

export function ReskinConfigClassesPage() {
  const qc = useQueryClient();
  const active = useProfileStore((s) => s.active);
  const registry = useQuery<ReskinRegistry>({
    queryKey: ["reskin", "registry"],
    queryFn: () => tauri.reskinRegistryGet(),
  });

  // After saving / removing a config class the list AND several
  // adjacent caches are stale: the vanilla class index (which
  // merges user classes in for the reskin wizard) and, for `New`
  // classes we auto-register in types.xml, the items snapshot.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["reskin", "registry"] });
    qc.invalidateQueries({ queryKey: ["reskin", "vanilla-index"] });
    if (active) {
      qc.invalidateQueries({ queryKey: ["items", active.id] });
    }
  };

  const upsert = useMutation({
    mutationFn: async (entry: ConfigClassEntry) => {
      const saved = await tauri.reskinConfigClassUpsert(entry);
      // For New classes with an active profile, write a stub into
      // the mission's types_custom.xml so the class appears in
      // Items / Events / Loadouts. The stub's shape mirrors vanilla
      // Chernarus's equivalent entry for the entity kind — animals
      // use `min=0, lifetime=1800`, infected use `min=1,
      // lifetime=1800`, items default to `lifetime=14400`. CE reads
      // the new row the same way it reads `Animal_UrsusArctos` or
      // `ZmbM_SoldierNormal_Autumn` next to it.
      //
      // Overrides skip the write — they modify an existing class
      // that's already in the registry, a second entry would split
      // the item into two conflicting rows.
      const kind = entityKindFromParent(saved);
      const shouldRegister = saved.kind === "new" && !!active;
      if (shouldRegister && active) {
        try {
          await tauri.itemsUpsert(active.id, [
            makeTypesStub(saved.classname, kind),
          ]);
        } catch (err) {
          toast.warning(
            `Couldn't auto-register ${saved.classname} in types.xml`,
            {
              description: `${errorMessage(err)}. The config class is saved; register manually from the Items page if needed.`,
            },
          );
        }
      }
      return { saved, kind, registered: shouldRegister };
    },
    onSuccess: ({ saved, kind, registered }) => {
      invalidate();
      if (saved.kind !== "new") {
        toast.success("Saved");
        return;
      }
      if (registered) {
        const shapeNote =
          kind === "animal"
            ? "animal shape (min=0, lifetime=1800, count_in_map=1) — matches vanilla animals"
            : kind === "infected"
              ? "infected shape (min=1, lifetime=1800, count_in_map=1) — matches vanilla ZmbM_*/ZmbF_*"
              : "item shape (lifetime=14400) — tune usage / value / nominal in the Items page";
        toast.success(`Saved — ${saved.classname} registered in types.xml`, {
          description: `${shapeNote}. For AI entities you still need a Territory binding in cfgenvironment for the scripted AI to activate.`,
        });
        return;
      }
      toast.success("Saved", {
        description:
          "No active profile — skipped types.xml registration. Select a profile and re-save to auto-register.",
      });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => tauri.reskinConfigClassRemove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Removed", {
        description:
          "The config class is gone. Its types.xml entry (if any) was left in place — remove it from the Items page if you want it gone too.",
      });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [editing, setEditing] = useState<ConfigClassEntry | null>(null);
  // `creating` is `null` when the dialog is closed, otherwise it
  // carries the kind the operator chose — New vs Override — so the
  // form opens in the right mode with the right field set.
  const [creating, setCreating] = useState<ConfigClassKind | null>(null);
  // `presetParent` pre-fills the parent field when the operator
  // deep-links from the Vanilla Classes page via `?parent=...`.
  // Cleared once the dialog consumes it to avoid repeated reopens.
  const [searchParams, setSearchParams] = useSearchParams();
  const presetParent = searchParams.get("parent") ?? "";
  useEffect(() => {
    if (presetParent && creating === null) {
      setCreating("new");
    }
  }, [presetParent, creating]);

  const entries = registry.data?.configClasses ?? [];

  // Classname collision detection is a build-time error, but
  // surfacing a soft warning early keeps operators from hitting a
  // wall when they press Build.
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const key = e.classname.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const out = new Set<string>();
    for (const [k, n] of counts) {
      if (n > 1) out.add(k);
    }
    return out;
  }, [entries]);

  return (
    <div className="space-y-4 p-6">
      <PageHeader
        icon={FileCode}
        title="Config classes"
        description="Author raw config.cpp class blocks that ship inside the same PBO as your reskins. Subclass a vanilla entity into a stronger variant (Super-Bear, Dire Wolf) or override an existing class's stats. Advanced — you're writing real Bohemia config syntax."
        badges={
          <>
            <Badge variant="outline">{entries.length} class(es)</Badge>
            {duplicates.size > 0 ? (
              <Badge
                variant="outline"
                className="border-severity-error/40 text-severity-error"
                title="Build will fail — two classes with the same name"
              >
                {duplicates.size} duplicate name(s)
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setCreating("new")}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New class
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setCreating("override")}
              title="Rewrite an existing class of the same name without creating a new symbol"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Override existing
            </Button>
          </>
        }
      />

      <Explainer
        title="How config classes ship"
        subtitle="appended into the generated config.cpp, same PBO."
        storageKey="dzcm.reskin.config.explainer.open"
      >
        <p>
          At build time each entry below becomes a{" "}
          <code>class Name: Parent {"{ body }"}</code> block inside
          the modpack's generated <code>config.cpp</code> — grouped by
          the container you pick (<code>CfgVehicles</code> for
          animals / vehicles, <code>CfgWeapons</code> for firearms,
          etc.). The body is inserted verbatim: whatever valid
          Enfusion config you write is what ships.
        </p>
        <p>
          A class with <strong>no parent</strong> (or one where{" "}
          <code>parent === classname</code>) becomes a{" "}
          <strong>pure override</strong> — it rewrites the existing
          class of the same name rather than creating a new symbol.
          CfgPatches skips pure overrides so you don't accidentally
          "introduce" a vanilla classname.
        </p>
        <p>
          <strong>What you can't change from here:</strong> the
          entity's mesh, textures, or anything driven by a{" "}
          <code>.p3d</code> model. For that you need a proper mod
          project. This is for tuning stats, behaviour flags, spawn
          attributes — the data-driven slice.
        </p>
        <p>
          <strong>Items / Events / Loadouts integration:</strong> when
          you save a <em>New</em> class with a profile active, the app
          writes a minimal <code>&lt;type&gt;</code> entry into that
          mission's <code>custom/types_custom.xml</code> so your class
          appears in Items / Events / Loadouts. The stub is shaped to
          match the equivalent vanilla entry — animals use{" "}
          <code>min=0, lifetime=1800</code>, infected use{" "}
          <code>min=1, lifetime=1800</code>, items use{" "}
          <code>lifetime=14400</code>. Operators tune nominal / usage
          / category in the Items page when ready. Overrides skip this
          step.
        </p>
        <p>
          <strong>AI entities need Territory wiring too.</strong> A
          types.xml entry makes a classname addressable, but for an
          animal or infected to actually roam / aggro you also need a
          Territory binding in <code>cfgenvironment.xml</code> so the
          agent manager attaches its scripted AI (
          <code>BlishBearGroupBeh</code>,{" "}
          <code>DZdomesticGroupBeh</code>, …). Use{" "}
          <strong>Map editor → Territories panel → + Add custom
          animal</strong> for that. Dynamic events alone don't wake
          the AI up — entities spawn but stay in idle.
        </p>
      </Explainer>

      {entries.length === 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            No custom classes yet. Click <strong>New class</strong> to
            create one that appears everywhere (items, reskin picker),
            or <strong>Override existing</strong> to tweak a vanilla
            class without adding a new entry.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-md border border-border/60 bg-card/60">
          <div className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-x-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Kind</span>
            <span>Classname</span>
            <span>Parent</span>
            <span>Container</span>
            <span>Updated</span>
            <span></span>
          </div>
          <ul className="divide-y divide-border/40">
            {entries.map((e) => {
              const isDup = duplicates.has(e.classname.toLowerCase());
              const kind = effectiveKind(e);
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-x-3 px-4 py-2 text-sm"
                >
                  <Badge
                    variant="outline"
                    className={
                      kind === "new"
                        ? "border-primary/40 text-primary"
                        : "border-muted-foreground/40 text-muted-foreground"
                    }
                    title={
                      kind === "new"
                        ? "Introduces a new class symbol. Appears in reskin picker + types.xml."
                        : "Rewrites an existing class. Doesn't create a new symbol."
                    }
                  >
                    {kind}
                  </Badge>
                  <span className="truncate font-mono">
                    {e.classname}
                    {isDup ? (
                      <span
                        className="ml-1 text-severity-error"
                        title="Duplicate — build will fail"
                      >
                        ⚠
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {kind === "override"
                      ? "(rewrites self)"
                      : e.parent || "—"}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {e.container}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatRelativeTime(e.updatedAt)}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditing(e)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove.mutate(e.id)}
                      disabled={remove.isPending}
                      title="Remove"
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfigClassDialog
        open={creating !== null}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(null);
            // Drop the `?parent=…` deep-link once the dialog closes
            // so re-navigating here doesn't auto-reopen it.
            if (presetParent) {
              const next = new URLSearchParams(searchParams);
              next.delete("parent");
              setSearchParams(next, { replace: true });
            }
          }
        }}
        initial={null}
        mode={creating ?? "new"}
        presetParent={creating === "new" ? presetParent : ""}
        onSubmit={async (entry) => {
          await upsert.mutateAsync(entry);
        }}
        saving={upsert.isPending}
      />
      <ConfigClassDialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        initial={editing}
        mode={editing ? effectiveKind(editing) : "new"}
        onSubmit={async (entry) => {
          await upsert.mutateAsync(entry);
        }}
        saving={upsert.isPending}
      />
    </div>
  );
}

function ConfigClassDialog({
  open,
  onOpenChange,
  initial,
  mode,
  presetParent,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initial: ConfigClassEntry | null;
  /** Chosen at the entry point — New (derived class, registers a new
   *  symbol) or Override (rewrites a vanilla class in place). Drives
   *  which fields the dialog shows and the copy in each header. */
  mode: ConfigClassKind;
  /** When deep-linked from the Classes page ("Create a Config Class
   *  deriving from X"), pre-fills the parent field. Ignored in
   *  override mode and when editing. */
  presetParent?: string;
  onSubmit: (entry: ConfigClassEntry) => Promise<void>;
  saving: boolean;
}) {
  const [displayName, setDisplayName] = useState("");
  const [classname, setClassname] = useState("");
  const [parent, setParent] = useState("");
  const [container, setContainer] = useState<string>("CfgVehicles");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setDisplayName(initial.displayName);
      setClassname(initial.classname);
      setParent(initial.parent);
      setContainer(initial.container || "CfgVehicles");
      setBody(initial.body);
    } else {
      setDisplayName("");
      setClassname("");
      setParent(mode === "new" ? (presetParent ?? "") : "");
      setContainer("CfgVehicles");
      setBody(
        mode === "override"
          ? "// Override body — rewrites an existing class by the same\n// name. Only add the fields you want to change; the rest\n// inherit from the vanilla config.\n"
          : "",
      );
    }
  }, [open, initial, mode, presetParent]);

  const classnameValid = /^[A-Za-z][A-Za-z0-9_]*$/.test(classname.trim());
  const parentValid =
    mode === "override" || parent.trim().length > 0;
  const canSubmit = classnameValid && parentValid && !saving;

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setParent(tpl.parent);
    setBody(tpl.body);
    if (tpl.container) setContainer(tpl.container);
    // Pull a suggested display name out of the label — strip the
    // category prefix ("Animal: Giant purple bear" → "Giant purple
    // bear") so the field doesn't start with the taxonomy we only
    // use to organise the dropdown.
    if (!displayName && tpl.label) {
      const suggested = tpl.label.replace(/^[A-Z][a-z]+:\s*/, "");
      setDisplayName(suggested);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    const now = new Date().toISOString();
    const entry: ConfigClassEntry = {
      id: initial?.id ?? "",
      displayName: displayName.trim() || classname.trim(),
      classname: classname.trim(),
      // Override mode ignores the parent field — we store classname
      // there so the backend's back-fill heuristic still classifies
      // the entry correctly if the `kind` field ever gets stripped.
      parent:
        mode === "override" ? classname.trim() : parent.trim(),
      container,
      kind: mode,
      body,
      createdAt: initial?.createdAt ?? now,
      updatedAt: now,
    };
    await onSubmit(entry);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {initial
              ? `Edit ${initial.classname}`
              : mode === "new"
                ? "New class"
                : "Override existing class"}
          </DialogTitle>
          <DialogDescription>
            {mode === "new" ? (
              <>
                Creates a brand-new class symbol (derived from a
                parent) — visible in the reskin picker, the items
                list, and CfgPatches. Appears everywhere a vanilla
                class would.
              </>
            ) : (
              <>
                Rewrites the existing class of the same name. No new
                symbol is added; downstream views still show the
                vanilla class but with your overrides applied.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {!initial ? (
          <div className="rounded-md border border-dashed border-border/60 p-3">
            <Label className="text-[11px] font-semibold">
              Quick-start template (optional)
            </Label>
            <div className="mt-1.5 space-y-2">
              {groupTemplates(TEMPLATES).map((group) => (
                <div key={group.category} className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {group.category}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((t) => (
                      <Button
                        key={t.label}
                        size="sm"
                        variant="ghost"
                        className="h-7 border border-border/60 px-2 text-[11px]"
                        onClick={() => applyTemplate(t)}
                        title={
                          t.parent
                            ? `Pre-fills parent=${t.parent}, container=${t.container ?? "CfgVehicles"}`
                            : "Pure override — no parent, tweaks the class of the same name"
                        }
                      >
                        {t.label.replace(/^[^:]+:\s*/, "")}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="displayName">Display label</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="SuperBear (boss variant)"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="classname">
              {mode === "override"
                ? "Class to override *"
                : "Classname *"}
            </Label>
            <Input
              id="classname"
              value={classname}
              onChange={(e) => setClassname(e.target.value)}
              placeholder={
                mode === "override" ? "Animal_UrsusArctos" : "SuperBear"
              }
              className="font-mono"
            />
            {classname && !classnameValid ? (
              <p className="text-[11px] text-severity-error">
                Must start with a letter, only letters / digits /
                underscore.
              </p>
            ) : null}
            {mode === "override" ? (
              <p className="text-[11px] text-muted-foreground">
                The classname of the existing class you want to
                rewrite. The override merges into the original class
                at config-read time.
              </p>
            ) : null}
          </div>
          {mode === "new" ? (
            <div className="space-y-1">
              <Label htmlFor="parent">Parent class *</Label>
              <Input
                id="parent"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder="Animal_UrsusArctos"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                The existing class your new class inherits from.
                Your class will show up in the reskin picker using
                the parent's hidden-selection slots.
              </p>
              {parent.trim().length === 0 ? (
                <p className="text-[11px] text-severity-error">
                  Required — pick an existing class to derive from.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <Label>Container</Label>
            <Select value={container} onValueChange={setContainer}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTAINERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="body">Class body</Label>
          <textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            rows={14}
            className="w-full rounded-md border border-border/60 bg-background p-2 font-mono text-[12px] leading-snug"
            placeholder={`scope = 2;\ndisplayName = "${classname || "NewClass"}";\n// stat overrides…`}
          />
          <p className="text-[11px] text-muted-foreground">
            Whatever you write lands between the class braces
            verbatim. Semicolons are required on each statement —
            that's Enfusion, not us.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : initial ? (
              "Save changes"
            ) : (
              "Create class"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Partition templates into `"Animal:"`, `"Infected:"`, `"Item:"`,
 *  `"Generic:"` groups based on the label prefix. Preserves the
 *  order of first appearance so the UI follows the declaration order
 *  in the TEMPLATES array rather than re-sorting alphabetically. */
function groupTemplates(
  all: typeof TEMPLATES,
): { category: string; items: typeof TEMPLATES }[] {
  const order: string[] = [];
  const map = new Map<string, typeof TEMPLATES>();
  for (const t of all) {
    const m = t.label.match(/^([^:]+):/);
    const category = m ? m[1].trim() : "Other";
    if (!map.has(category)) {
      order.push(category);
      map.set(category, []);
    }
    map.get(category)!.push(t);
  }
  return order.map((c) => ({ category: c, items: map.get(c)! }));
}
