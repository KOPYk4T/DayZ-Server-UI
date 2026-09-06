import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/InfoTooltip";
import { MonacoXmlViewer } from "@/components/MonacoXmlViewer";
import { ItemForm } from "@/features/items/ItemForm";
import { FIELDS, valueHint } from "@/features/items/glossary";
import {
  useItemsUpsert,
  useSerializePreview,
} from "@/hooks/useItems";
import type { FileOriginOut, ItemType, ItemsSnapshot } from "@/types/ipc";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  snapshot?: ItemsSnapshot;
  onCreated: (name: string) => void;
}

const CATEGORY_DEFAULTS: Record<
  string,
  Partial<Pick<ItemType, "nominal" | "min" | "lifetime" | "restock" | "cost" | "flags">>
> = {
  weapons: {
    nominal: 5,
    min: 2,
    lifetime: 14_400,
    restock: 1_800,
    cost: 100,
    flags: {
      count_in_cargo: 0,
      count_in_hoarder: 0,
      count_in_map: 1,
      count_in_player: 0,
      crafted: 0,
      deloot: 0,
    },
  },
  food: {
    nominal: 20,
    min: 10,
    lifetime: 14_400,
    restock: 0,
    cost: 100,
    flags: {
      count_in_cargo: 1,
      count_in_hoarder: 1,
      count_in_map: 1,
      count_in_player: 1,
      crafted: 0,
      deloot: 0,
    },
  },
  clothes: {
    nominal: 10,
    min: 5,
    lifetime: 14_400,
    restock: 1_800,
    cost: 100,
    flags: {
      count_in_cargo: 0,
      count_in_hoarder: 0,
      count_in_map: 1,
      count_in_player: 0,
      crafted: 0,
      deloot: 0,
    },
  },
};

const STEPS = ["Identity", "Fields", "Review"] as const;
type Step = (typeof STEPS)[number];

function blankItem(): ItemType {
  return {
    name: "",
    nominal: 5,
    lifetime: 14_400,
    restock: 1_800,
    min: 2,
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

export function AddItemWizard({ open, onOpenChange, snapshot, onCreated }: Props) {
  const [step, setStep] = useState<Step>("Identity");
  const [draft, setDraft] = useState<ItemType>(blankItem);

  const upsert = useItemsUpsert();
  const preview = useSerializePreview();
  const [previewXml, setPreviewXml] = useState<string | null>(null);

  const existingNames = useMemo(
    () => new Set(snapshot?.items.map((i) => i.name) ?? []),
    [snapshot],
  );
  const nameCollision = draft.name.trim() !== "" && existingNames.has(draft.name);

  useEffect(() => {
    if (!open) {
      setStep("Identity");
      setDraft(blankItem());
      setPreviewXml(null);
    }
  }, [open]);

  useEffect(() => {
    if (step !== "Review") return;
    preview.mutate([draft], {
      onSuccess: (xml) => setPreviewXml(xml),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, draft]);

  const applyCategoryDefaults = (cat: string) => {
    const defaults = CATEGORY_DEFAULTS[cat];
    if (!defaults) return;
    setDraft((d) => ({
      ...d,
      category: cat,
      ...defaults,
      flags: defaults.flags ?? d.flags,
    }));
  };

  const canAdvance =
    step === "Identity"
      ? draft.name.trim().length > 0 && !nameCollision
      : step === "Fields"
        ? draft.nominal >= 0 && draft.min >= 0
        : true;

  const advance = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };
  const back = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const commit = () => {
    upsert.mutate([draft], {
      onSuccess: () => {
        toast.success(`added ${draft.name}`, {
          description: "written to custom/types_custom.xml",
        });
        onCreated(draft.name);
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add item</DialogTitle>
          <DialogDescription>
            Creates a new entry in{" "}
            <code>custom/types_custom.xml</code> and registers the file in
            <code> cfgeconomycore.xml</code> if it isn't already.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={
                  s === step
                    ? "font-medium text-foreground"
                    : i < STEPS.indexOf(step)
                      ? "text-primary"
                      : ""
                }
              >
                {i + 1}. {s}
              </span>
              {i < STEPS.length - 1 ? <span>·</span> : null}
            </div>
          ))}
        </div>

        <Separator />

        <div className="max-h-[60vh] overflow-y-auto">
          {step === "Identity" ? (
            <IdentityStep
              draft={draft}
              setDraft={setDraft}
              snapshot={snapshot}
              nameCollision={nameCollision}
              applyCategoryDefaults={applyCategoryDefaults}
            />
          ) : step === "Fields" ? (
            <ItemForm
              value={draft}
              onChange={setDraft}
              categories={snapshot?.categories ?? []}
              usages={snapshot?.usages ?? []}
              values={snapshot?.values ?? []}
              tags={snapshot?.tags ?? []}
            />
          ) : (
            <ReviewStep item={draft} xml={previewXml} />
          )}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={back}
            disabled={step === "Identity"}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          {step === "Review" ? (
            <Button onClick={commit} disabled={upsert.isPending}>
              {upsert.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Create item
            </Button>
          ) : (
            <Button onClick={advance} disabled={!canAdvance}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IdentityStep({
  draft,
  setDraft,
  snapshot,
  nameCollision,
  applyCategoryDefaults,
}: {
  draft: ItemType;
  setDraft: (next: ItemType) => void;
  snapshot?: ItemsSnapshot;
  nameCollision: boolean;
  applyCategoryDefaults: (cat: string) => void;
}) {
  const trimmed = draft.name.trim();
  const modFiles =
    snapshot?.files.filter((f) => f.source === "mod") ?? [];
  const modItemCount = modFiles.reduce((n, f) => n + f.count, 0);
  const matchesInRegistry = snapshot
    ? snapshot.items
        .filter((it) =>
          trimmed.length >= 2
            ? it.name.toLowerCase().includes(trimmed.toLowerCase())
            : false,
        )
        .slice(0, 8)
    : [];
  const exactMatch = snapshot?.items.find((it) => it.name === trimmed);

  return (
    <div className="space-y-4 p-1">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Registering a CE entry</AlertTitle>
        <AlertDescription className="space-y-1 text-xs">
          <p>
            Use this when a class exists in-game (vanilla or an installed
            mod) but the Central Economy doesn't know about it yet. You're
            filling the CE metadata so the server spawns it on the map.
          </p>
          <p>
            <code>types.xml</code> does <strong>not</strong> create the
            item — the model, inventory size, sounds, and behavior come
            from the mod's <code>.pbo</code> (<code>config.cpp</code>). If
            no installed mod defines this classname, the server will
            silently ignore the entry — no error, just no spawns.
          </p>
          <p>
            The app sees two kinds of classnames: (a) <strong>items in
            a loaded <code>types.xml</code></strong> — vanilla{" "}
            <code>db/types.xml</code> plus every mod whose
            <code>types.xml</code> is registered in{" "}
            <code>cfgeconomycore.xml</code>; (b) <strong>items defined
            only in a mod's <code>config.cpp</code></strong> with no CE
            metadata — invisible to this app (we don't parse{" "}
            <code>.pbo</code>). This wizard is the bridge for case (b).
          </p>
        </AlertDescription>
      </Alert>

      <SourcesLoaded
        vanillaCount={
          snapshot?.files.find((f) => f.source === "vanilla")?.count ?? 0
        }
        modFiles={modFiles}
        modItemCount={modItemCount}
        customCount={
          snapshot?.files.find((f) => f.source === "custom")?.count ?? 0
        }
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium" htmlFor="new-classname">
            Classname
          </label>
          <InfoTooltip tagline={FIELDS.name.tagline}>
            {FIELDS.name.description}
          </InfoTooltip>
        </div>
        <input
          id="new-classname"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. SuperRifle, TraderPlus_Token, Expansion_Parachute"
          autoComplete="off"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <ClassnameStatus
          trimmed={trimmed}
          nameCollision={nameCollision}
          exactMatch={exactMatch ?? null}
          modItemCount={modItemCount}
        />

        {matchesInRegistry.length > 0 && !exactMatch ? (
          <div className="space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Similar classnames already registered
            </p>
            <ul className="space-y-0.5">
              {matchesInRegistry.map((it) => (
                <li key={it.name} className="flex items-center gap-2 text-xs">
                  <span
                    className={
                      it.source === "vanilla"
                        ? "rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground"
                        : it.source === "mod"
                          ? "rounded bg-severity-info/20 px-1 text-[9px] uppercase text-severity-info"
                          : "rounded bg-primary/20 px-1 text-[9px] uppercase text-primary"
                    }
                  >
                    {it.source[0]}
                  </span>
                  <button
                    type="button"
                    className="truncate font-mono text-foreground hover:underline"
                    onClick={() => setDraft({ ...draft, name: it.name })}
                  >
                    {it.name}
                  </button>
                  <span className="ml-auto truncate text-[10px] text-muted-foreground">
                    {it.modId ?? it.file.split("/").pop() ?? ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              Clicking a row fills the name. To change its spawn behavior
              directly, cancel this wizard and pick the item from the list.
            </p>
          </div>
        ) : null}
      </div>

      <Alert className="bg-muted/30">
        <Info className="h-4 w-4" />
        <AlertTitle className="text-xs">Finding a mod's classnames</AlertTitle>
        <AlertDescription className="text-xs">
          If the mod didn't ship a <code>types.xml</code>, the class
          names have to come from somewhere else: the mod's documentation
          or Steam Workshop page, its <code>config.cpp</code> if it's
          unpacked, admin-tool spawn menus (VPPAdminTools, CF), or the
          server <code>.RPT</code> log after an attempted spawn. Classname
          spelling must be exact — DayZ is case-sensitive and a typo
          looks the same as a missing mod (silent ignore).
        </AlertDescription>
      </Alert>

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs text-muted-foreground">
            Prefill defaults for a category
          </p>
          <InfoTooltip tagline={FIELDS.category.tagline}>
            {valueHint(FIELDS.category, snapshot?.categories ?? [])} Clicking a
            category seeds sensible nominal, min, lifetime, and flag values so
            the next step starts from a reasonable baseline.
          </InfoTooltip>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(snapshot?.categories ?? []).map((c) => (
            <Button
              key={c}
              variant={draft.category === c ? "default" : "secondary"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => applyCategoryDefaults(c)}
            >
              {c}
            </Button>
          ))}
        </div>
        {draft.category ? (
          <p className="text-[10px] text-muted-foreground">
            Applied <code>{draft.category}</code> defaults. You can tweak
            everything on the next step.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ReviewStep({ item, xml }: { item: ItemType; xml: string | null }) {
  return (
    <div className="space-y-3 p-1">
      <p className="text-sm">
        <strong className="font-mono">{item.name}</strong> will be written to{" "}
        <code>custom/types_custom.xml</code> with the fields shown below.
      </p>
      <div className="h-72 overflow-hidden rounded-md border border-border/60">
        <MonacoXmlViewer value={xml ?? "Rendering…"} readOnly />
      </div>
    </div>
  );
}

function SourcesLoaded({
  vanillaCount,
  modFiles,
  modItemCount,
  customCount,
}: {
  vanillaCount: number;
  modFiles: FileOriginOut[];
  modItemCount: number;
  customCount: number;
}) {
  return (
    <details className="group rounded-md border border-border/60 bg-muted/20 p-2 text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-muted-foreground">
        <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        Classname sources the app has parsed
        <span className="ml-auto font-mono text-[10px]">
          {vanillaCount} vanilla · {modItemCount} mod · {customCount} custom
        </span>
      </summary>
      <ul className="mt-2 space-y-0.5">
        <li className="flex items-center gap-2">
          <span className="rounded bg-muted px-1 text-[9px] uppercase text-muted-foreground">
            V
          </span>
          <span className="font-mono text-[11px]">db/types.xml</span>
          <span className="ml-auto tabular-nums text-[10px] text-muted-foreground">
            {vanillaCount}
          </span>
        </li>
        {modFiles.map((f) => (
          <li key={f.relative} className="flex items-center gap-2">
            <span className="rounded bg-severity-info/20 px-1 text-[9px] uppercase text-severity-info">
              M
            </span>
            <span className="truncate font-mono text-[11px]">{f.relative}</span>
            <span className="ml-auto tabular-nums text-[10px] text-muted-foreground">
              {f.count}
            </span>
          </li>
        ))}
        {modFiles.length === 0 ? (
          <li className="italic text-[10px] text-muted-foreground">
            No mod <code>types.xml</code> registered in{" "}
            <code>cfgeconomycore.xml</code>. Mods whose author ships CE
            metadata show up here once the mod is installed on the server
            you pulled from.
          </li>
        ) : null}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        A classname missing from this list can still be valid — it just
        means the mod didn't include a <code>types.xml</code>. Your new
        CE entry is what adds it to the economy.
      </p>
    </details>
  );
}

function ClassnameStatus({
  trimmed,
  nameCollision,
  exactMatch,
  modItemCount,
}: {
  trimmed: string;
  nameCollision: boolean;
  exactMatch: ItemType | null;
  modItemCount: number;
}) {
  if (trimmed === "") {
    return (
      <p className="text-[10px] text-muted-foreground">
        Enter the classname exactly as defined by vanilla DayZ or the mod.
        Case-sensitive.
      </p>
    );
  }
  if (nameCollision && exactMatch) {
    return (
      <div className="rounded-md border border-severity-warning/40 bg-severity-warning/5 p-2 text-[11px]">
        <p className="font-medium text-severity-warning">
          This classname already has a CE entry ({exactMatch.source}).
        </p>
        <p className="text-muted-foreground">
          Cancel this wizard and open <code>{exactMatch.name}</code> from
          the items list to edit its behavior, or use <em>Clone</em> to
          create a variant under a different name.
        </p>
      </div>
    );
  }
  // No exact match — tell the user how the app will treat it.
  if (modItemCount === 0) {
    return (
      <div className="rounded-md border border-severity-info/30 bg-severity-info/5 p-2 text-[11px] text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">
            New to the CE.
          </span>{" "}
          We haven't loaded any mod <code>types.xml</code> for this
          workspace, so we can't check whether a mod defines this class.
          Double-check the spelling against your mod's documentation.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-severity-info/30 bg-severity-info/5 p-2 text-[11px] text-muted-foreground">
      <p>
        <span className="font-medium text-foreground">New to the CE.</span>{" "}
        This classname isn't in vanilla or any of the {modItemCount} mod
        entries we parsed. That's expected if the mod ships classes
        without a <code>types.xml</code> — you're filling that gap.
        Double-check the spelling against the mod's <code>config.cpp</code>{" "}
        or docs.
      </p>
    </div>
  );
}
