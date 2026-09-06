import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  CircleSlash,
  Copy,
  Download,
  ExternalLink,
  EyeOff,
  FileImage,
  Loader2,
  Palette,
  Save,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { cn, errorMessage } from "@/lib/utils";
import type {
  ReskinEntry,
  ReskinRegistry,
  ReskinSlotOverride,
  SkinnableClass,
  VanillaClassSummary,
} from "@/types/ipc";


type Step = 1 | 2 | 3 | 4;
type Mode = "coexist" | "replace";

interface SlotOverride {
  /** Absolute path on disk to the source PNG/TGA/JPG. Null = no
   *  file-based override. */
  sourceFile: string | null;
  /** Replacement procedural colour. Null = no colour override. Only
   *  one of sourceFile / sourceColor should be set at a time — the
   *  setters below clear whichever the user isn't choosing. */
  sourceColor: ProceduralColor | null;
}

interface WizardState {
  step: Step;
  source: SkinnableClass | null;
  newClassname: string;
  mode: Mode;
  slots: Record<number, SlotOverride>;
}

export function ReskinWizardPage() {
  const [searchParams] = useSearchParams();
  const editClassname = searchParams.get("edit");

  // Load the full registry so we can pre-fill in edit mode. In
  // create mode this is still a cheap hit — the registry is tiny.
  const registry = useQuery<ReskinRegistry>({
    queryKey: ["reskin", "registry"],
    queryFn: () => tauri.reskinRegistryGet(),
  });

  const [state, setState] = useState<WizardState>({
    step: 1,
    source: null,
    newClassname: "",
    mode: "coexist",
    slots: {},
  });

  // One-shot preload when editing an existing entry. `hydrated` guards
  // against re-overwriting local edits if the registry refetches.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || !editClassname || !registry.data) return;
    const entry = registry.data.reskins.find(
      (e) => e.newClassname === editClassname,
    );
    if (!entry) return;
    const slots: Record<number, SlotOverride> = {};
    for (const s of entry.slots) {
      slots[s.slotIndex] = {
        sourceFile: s.sourceFile ?? null,
        sourceColor: s.sourceColor ?? null,
      };
    }
    setState({
      step: 2,
      source: entry.source,
      newClassname: entry.newClassname,
      mode: entry.mode,
      slots,
    });
    setHydrated(true);
  }, [editClassname, registry.data, hydrated]);

  const go = (step: Step) => setState((s) => ({ ...s, step }));

  const setSource = (src: SkinnableClass | null) => {
    setState((s) => ({
      ...s,
      source: src,
      newClassname: s.newClassname || (src ? `${src.name}_Reskin` : ""),
      slots: {},
    }));
  };

  const setSlot = (index: number, patch: Partial<SlotOverride>) =>
    setState((s) => ({
      ...s,
      slots: {
        ...s.slots,
        [index]: {
          ...(s.slots[index] ?? { sourceFile: null, sourceColor: null }),
          ...patch,
        },
      },
    }));

  const stepComplete: Record<Step, boolean> = {
    1: state.source !== null,
    2:
      state.newClassname.trim().length > 0 &&
      validClassname(state.newClassname),
    3: true, // textures are optional — user can reskin any subset of slots
    4: false,
  };

  const isEdit = !!editClassname;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Palette}
        title={`Reskin · ${isEdit ? "Edit" : "New"}`}
        description={
          isEdit
            ? `Editing "${editClassname}" — save to update the library, then rebuild from the library page.`
            : "Clone a vanilla class under a new name and swap textures. Save adds it to the library; rebuild the mod from the library page."
        }
        actions={<Stepper current={state.step} complete={stepComplete} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {state.step === 1 ? (
          <StepSource
            value={state.source}
            onPick={setSource}
            onNext={() => go(2)}
          />
        ) : null}
        {state.step === 2 ? (
          <StepTarget
            source={state.source!}
            newClassname={state.newClassname}
            mode={state.mode}
            onChange={(patch) =>
              setState((s) => ({ ...s, ...patch }))
            }
            onBack={() => go(1)}
            onNext={() => go(3)}
            canNext={stepComplete[2]}
          />
        ) : null}
        {state.step === 3 ? (
          <StepTextures
            source={state.source!}
            slots={state.slots}
            onSetSlot={setSlot}
            onBack={() => go(2)}
            onNext={() => go(4)}
          />
        ) : null}
        {state.step === 4 ? (
          <StepReview
            state={state}
            onBack={() => go(3)}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------- Stepper ----------

function Stepper({
  current,
  complete,
}: {
  current: Step;
  complete: Record<Step, boolean>;
}) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: "Source" },
    { n: 2, label: "Target" },
    { n: 3, label: "Textures" },
    { n: 4, label: "Review" },
  ];
  return (
    <ol className="flex items-center gap-1 text-[11px]">
      {steps.map((s, i) => {
        const done = s.n < current && complete[s.n];
        const active = s.n === current;
        return (
          <li key={s.n} className="flex items-center gap-1">
            <span
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full border font-mono",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-severity-success/60 bg-severity-success/20 text-severity-success"
                    : "border-border text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : s.n}
            </span>
            <span
              className={cn(
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 ? (
              <ArrowRight className="mx-1 h-3 w-3 text-muted-foreground/60" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- Step 1: Source ----------

function StepSource({
  value,
  onPick,
  onNext,
}: {
  value: SkinnableClass | null;
  onPick: (cls: SkinnableClass | null) => void;
  onNext: () => void;
}) {
  const list = useQuery<VanillaClassSummary[]>({
    queryKey: ["reskin", "vanilla-index", "list"],
    queryFn: () => tauri.reskinVanillaClassList(),
    staleTime: 60_000,
  });

  const [query, setQuery] = useState("");
  const [container, setContainer] = useState("__all__");

  const containers = useMemo(() => {
    const s = new Set<string>();
    for (const c of list.data ?? []) if (c.container) s.add(c.container);
    return Array.from(s).sort();
  }, [list.data]);

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // The wizard ONLY targets reskinnable classes — the ones with
      // hiddenSelection slots to override. Animals and other
      // unskinnable entries now live in the broader class index but
      // need the Config Classes flow, not this one.
      if (!r.reskinnable) return false;
      if (container !== "__all__" && r.container !== container) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [list.data, query, container]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-4 w-4" /> Step 1 · Pick the source class
          </CardTitle>
          <CardDescription>
            The new skinned item inherits from this class. Filter by
            name or container to narrow down — there are thousands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading index…
            </div>
          ) : list.data && list.data.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Vanilla class index is empty. Build it from{" "}
                <strong>Reskin · Setup</strong> before starting a reskin.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by classname…"
                    className="h-8 pl-8 text-xs"
                  />
                  {query ? (
                    <button
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                      onClick={() => setQuery("")}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <Select value={container} onValueChange={setContainer}>
                  <SelectTrigger className="h-8 w-56 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All containers</SelectItem>
                    {containers.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
                <ul className="divide-y divide-border/60">
                  {filtered.slice(0, 200).map((c) => (
                    <li key={c.name}>
                      <button
                        onClick={() => {
                          void tauri
                            .reskinVanillaClassGet(c.name)
                            .then((full) => onPick(full));
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                          value?.name === c.name
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-muted/50",
                        )}
                      >
                        <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono">{c.name}</div>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {c.container ?? "—"}
                            {c.parent ? ` · : ${c.parent}` : ""}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[9px]">
                          {c.selectionCount} slot(s)
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {filtered.length > 200 ? (
                <div className="text-[11px] text-muted-foreground">
                  Showing the first 200 of {filtered.length} matches —
                  tighten your filter if the class you want isn't here.
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {value ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Selected: <code className="font-mono">{value.name}</code>
            </CardTitle>
            <CardDescription>
              {value.hiddenSelectionsTextures.length} default texture
              slot(s), parent{" "}
              <code className="font-mono">{value.parent ?? "—"}</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!value}>
          Next · Target <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Step 2: Target ----------

function StepTarget({
  source,
  newClassname,
  mode,
  onChange,
  onBack,
  onNext,
  canNext,
}: {
  source: SkinnableClass;
  newClassname: string;
  mode: Mode;
  onChange: (
    patch: Partial<Pick<WizardState, "newClassname" | "mode">>,
  ) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  const nameValid = validClassname(newClassname);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4" /> Step 2 · Name the reskin
          </CardTitle>
          <CardDescription>
            The new class inherits from{" "}
            <code className="font-mono">{source.name}</code> — same
            model, same behaviour, new textures.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-classname">New classname</Label>
            <Input
              id="new-classname"
              value={newClassname}
              onChange={(e) => onChange({ newClassname: e.target.value })}
              className="font-mono"
              placeholder={`${source.name}_Reskin`}
            />
            {newClassname && !nameValid ? (
              <p className="text-xs text-severity-error">
                Only letters, digits, and underscore — must start with a
                letter.
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                This is the classname operators will reference from
                types.xml and cfgspawnabletypes.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Relation to the original</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ModeOption
                id="coexist"
                selected={mode === "coexist"}
                onSelect={() => onChange({ mode: "coexist" })}
                icon={<Copy className="h-4 w-4" />}
                title="Coexist"
                blurb={`${source.name} keeps spawning. The reskin is a separate item with its own CE entry.`}
              />
              <ModeOption
                id="replace"
                selected={mode === "replace"}
                onSelect={() => onChange({ mode: "replace" })}
                icon={<EyeOff className="h-4 w-4" />}
                title="Replace"
                blurb={`${source.name} is added to the CE ignore list so only the reskin spawns.`}
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Every reskin lands in the same shared mod — set its folder
            name once from the library page.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
        </Button>
        <Button onClick={onNext} disabled={!canNext}>
          Next · Textures <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ModeOption({
  id,
  selected,
  onSelect,
  icon,
  title,
  blurb,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`mode-${id}`}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border/60 hover:border-border",
      )}
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 rounded-full p-1.5",
          selected ? "bg-primary/20 text-primary" : "bg-muted",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{blurb}</div>
      </div>
    </button>
  );
}

// ---------- Step 3: Textures ----------

function StepTextures({
  source,
  slots,
  onSetSlot,
  onBack,
  onNext,
}: {
  source: SkinnableClass;
  slots: Record<number, SlotOverride>;
  onSetSlot: (index: number, patch: Partial<SlotOverride>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const rows = useMemo(() => buildSelectionRows(source), [source]);

  const pickFile = async (slot: number) => {
    const picked = await openDialog({
      multiple: false,
      title: "Pick replacement texture",
      filters: [
        {
          name: "Image",
          extensions: ["png", "tga", "jpg", "jpeg", "paa"],
        },
      ],
    });
    if (typeof picked === "string") {
      // Setting a file-based override clears any colour the user had
      // picked on this slot — the two are mutually exclusive.
      onSetSlot(slot, { sourceFile: picked, sourceColor: null });
    }
  };

  const pickColor = (
    slot: number,
    hex: string,
    defaultFrom: ProceduralColor | null,
  ) => {
    const rgb = hexToUnit(hex);
    if (!rgb) return;
    onSetSlot(slot, {
      sourceFile: null,
      sourceColor: {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        a: defaultFrom?.a ?? 1,
        type: defaultFrom?.type || "CO",
      },
    });
  };

  const [extracting, setExtracting] = useState<number | null>(null);

  const extract = useMutation({
    mutationFn: (args: {
      slot: number;
      selection: string;
      texturePath: string;
    }) =>
      tauri.reskinExtractTexture({
        className: source.name,
        slotIndex: args.slot,
        selection: args.selection,
        texturePath: args.texturePath,
      }),
  });

  const runExtract = async (
    slot: number,
    selection: string,
    texturePath: string,
  ) => {
    setExtracting(slot);
    try {
      const res = await extract.mutateAsync({
        slot,
        selection,
        texturePath,
      });
      onSetSlot(slot, { sourceFile: res.extractedPng, sourceColor: null });
      toast.success("Extracted vanilla texture", {
        description: res.extractedPng,
        action: {
          label: "Open folder",
          onClick: () => {
            void tauri
              .reskinRevealExtracted(source.name)
              .catch((e: unknown) => toast.error(errorMessage(e)));
          },
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExtracting(null);
    }
  };

  const overridden = Object.values(slots).filter(
    (s) => s.sourceFile || s.sourceColor,
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileImage className="h-4 w-4" /> Step 3 · Replacement textures
          </CardTitle>
          <CardDescription>
            Pick a new image per slot. PNG / TGA / JPG are converted to
            .paa during build via ImageToPAA. Leave a slot empty to
            keep the vanilla texture.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This class declares no selection slots — there is nothing
                to reskin textures-wise. Pick a different source class.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {rows.map((row, i) => {
                const slot = slots[i] ?? { sourceFile: null, sourceColor: null };
                const fileOverride = slot.sourceFile;
                const colorOverride = slot.sourceColor;
                const hasOverride = !!fileOverride || !!colorOverride;
                const kind = classifyTexture(row.texture);
                const procedural =
                  kind === "procedural" ? parseProcedural(row.texture) : null;
                const canExtract = kind === "file";
                const isExtracting = extracting === i;
                const activeColor = colorOverride ?? procedural;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md border border-border/60 p-3"
                  >
                    <div className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground">
                      #{i}
                    </div>
                    {procedural ? (
                      <div
                        className="mt-0.5 h-6 w-6 shrink-0 rounded border border-border/60"
                        style={{
                          backgroundColor: proceduralCss(
                            colorOverride ?? procedural,
                          ),
                        }}
                        title={
                          colorOverride
                            ? `replacement: RGB(${colorOverride.r}, ${colorOverride.g}, ${colorOverride.b}) · ${colorOverride.type || "CO"}`
                            : `vanilla: RGB(${procedural.r}, ${procedural.g}, ${procedural.b}) · ${procedural.type || "CO"}`
                        }
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-medium">
                          {row.selection || <em>unnamed</em>}
                        </span>
                        {kind === "empty" ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] text-muted-foreground"
                          >
                            no default — optional
                          </Badge>
                        ) : kind === "procedural" ? (
                          <Badge
                            variant="outline"
                            className="text-[9px]"
                            title="Bohemia procedural solid colour — not a .paa file"
                          >
                            procedural colour
                          </Badge>
                        ) : null}
                      </div>
                      {kind !== "empty" ? (
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          vanilla: {row.texture}
                        </div>
                      ) : null}
                      {fileOverride ? (
                        <div className="truncate font-mono text-[11px] text-severity-success">
                          replacement (image): {fileOverride}
                        </div>
                      ) : null}
                      {colorOverride ? (
                        <div className="truncate font-mono text-[11px] text-severity-success">
                          replacement (colour):{" "}
                          {formatProcedural(colorOverride)}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canExtract ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void runExtract(i, row.selection, row.texture)
                          }
                          disabled={isExtracting}
                          title="Decode the vanilla .paa to PNG so you can open it in your image editor, then save back to the same path."
                        >
                          {isExtracting ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Extract
                        </Button>
                      ) : null}
                      {kind === "procedural" ? (
                        <ColorPickerButton
                          hex={unitToHex(activeColor)}
                          onChange={(hex) => pickColor(i, hex, procedural)}
                          highlighted={!!colorOverride}
                        />
                      ) : null}
                      <Button
                        size="sm"
                        variant={fileOverride ? "secondary" : "default"}
                        onClick={() => void pickFile(i)}
                        title={
                          kind === "procedural"
                            ? "Replace the procedural colour with a custom .paa/.png"
                            : undefined
                        }
                      >
                        <FileImage className="mr-1.5 h-3.5 w-3.5" />
                        {fileOverride ? "Change" : "Pick image"}
                      </Button>
                      {hasOverride ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            onSetSlot(i, {
                              sourceFile: null,
                              sourceColor: null,
                            })
                          }
                          title="Drop override — keep the vanilla texture/colour"
                        >
                          <CircleSlash className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              {overridden} of {rows.length} slot(s) overridden. Empty
              slots render the vanilla texture at game time.
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void tauri
                  .reskinRevealExtracted(source.name)
                  .catch((e: unknown) => toast.error(errorMessage(e)))
              }
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open extracted
              folder
            </Button>
          </div>

          <Alert className="mt-3">
            <Download className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Extract</strong> decodes the vanilla{" "}
              <code className="font-mono">.paa</code> to a PNG under
              <code className="mx-1 font-mono">&lt;app-data&gt;/reskin/extracted/{source.name}/</code>
              and pre-fills it as this slot's replacement. Edit the
              file in your image editor, save back to the same path,
              then run the build — no need to pick it again.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
        </Button>
        <Button onClick={onNext}>
          Next · Review <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Step 4: Review ----------

function StepReview({
  state,
  onBack,
}: {
  state: WizardState;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const src = state.source!;
  const rows = useMemo(() => buildSelectionRows(src), [src]);
  const overridden = Object.entries(state.slots)
    .filter(([, v]) => v.sourceFile || v.sourceColor)
    .map(([k, v]) => ({
      slot: Number(k),
      selection: rows[Number(k)]?.selection ?? "",
      kind: v.sourceFile ? ("image" as const) : ("color" as const),
      source: v.sourceFile ?? (v.sourceColor ? formatProcedural(v.sourceColor) : ""),
    }));

  const save = useMutation({
    mutationFn: () => {
      const slotOverrides: ReskinSlotOverride[] = Object.entries(state.slots)
        .filter(([, v]) => v.sourceFile || v.sourceColor)
        .map(([k, v]) => ({
          slotIndex: Number(k),
          selection: rows[Number(k)]?.selection ?? "",
          sourceFile: v.sourceFile ?? null,
          sourceColor: v.sourceColor ?? null,
        }));
      const entry: ReskinEntry = {
        source: src,
        newClassname: state.newClassname,
        mode: state.mode,
        slots: slotOverrides,
        createdAt: "",
        updatedAt: "",
      };
      return tauri.reskinRegistryUpsert(entry);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reskin", "registry"] });
      toast.success("Reskin saved to library", {
        description: "Rebuild the mod from the library page.",
      });
      navigate("/app/reskin/library");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Save className="h-4 w-4" /> Step 4 · Review & save
          </CardTitle>
          <CardDescription>
            Save adds this reskin to the library. The mod isn't rebuilt
            until you hit Build on the library page — lets you batch
            several edits into one PBO.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <ReviewRow label="Source class">
            <code className="font-mono">{src.name}</code>
            {src.parent ? (
              <span className="text-muted-foreground">
                {" "}
                (: {src.parent})
              </span>
            ) : null}
          </ReviewRow>
          <ReviewRow label="New classname">
            <code className="font-mono">{state.newClassname}</code>
          </ReviewRow>
          <ReviewRow label="Mode">
            {state.mode === "coexist" ? (
              <span>
                <Copy className="mr-1 inline h-3.5 w-3.5" /> Coexist —
                both items spawn
              </span>
            ) : (
              <span>
                <EyeOff className="mr-1 inline h-3.5 w-3.5" /> Replace —{" "}
                <code className="font-mono">{src.name}</code> added to
                CE ignore list
              </span>
            )}
          </ReviewRow>
          <ReviewRow label="Overridden slots">
            {overridden.length === 0 ? (
              <span className="text-muted-foreground">
                none — the saved reskin will be a straight clone, are
                you sure?
              </span>
            ) : (
              <ul className="space-y-1">
                {overridden.map((o) => (
                  <li key={o.slot} className="font-mono text-xs">
                    #{o.slot} {o.selection || "(unnamed)"} ←{" "}
                    <span className="text-muted-foreground">[{o.kind}]</span>{" "}
                    {o.source}
                  </li>
                ))}
              </ul>
            )}
          </ReviewRow>

          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="mb-1 text-xs font-semibold">
              Generated config.cpp (preview · per-class slice)
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px]">
              {generateConfigPreview(state)}
            </pre>
          </div>

          {save.error ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-wrap break-all">
                {errorMessage(save.error)}
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} disabled={save.isPending}>
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate("/app/reskin/library")}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            {save.isPending ? "Saving…" : "Save to library"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3 border-b border-border/60 py-2 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ---------- Helpers ----------

interface SelectionRow {
  selection: string;
  texture: string;
  material: string;
}

function buildSelectionRows(c: SkinnableClass): SelectionRow[] {
  const width = Math.max(
    c.hiddenSelections.length,
    c.hiddenSelectionsTextures.length,
    c.hiddenSelectionsMaterials.length,
  );
  const out: SelectionRow[] = [];
  for (let i = 0; i < width; i++) {
    out.push({
      selection: c.hiddenSelections[i] ?? "",
      texture: c.hiddenSelectionsTextures[i] ?? "",
      material: c.hiddenSelectionsMaterials[i] ?? "",
    });
  }
  return out;
}

function validClassname(s: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(s);
}

// ---------- Texture classification ----------
//
// Bohemia hiddenSelectionsTextures entries come in three forms:
//   - empty string — no vanilla texture on this slot
//   - `#(argb,W,H,C)color(R,G,B,A,TYPE)` — procedural solid colour,
//     not a file (parsed below so we can render a swatch)
//   - any other non-empty string — a path to a .paa under P:\
//
// Only the third kind can be extracted to PNG. The first two pass
// through unchanged in the generated config.cpp, so they're still
// valid reskins — you just can't "edit the base image".

type TextureKind = "empty" | "procedural" | "file";

interface ProceduralColor {
  r: number;
  g: number;
  b: number;
  a: number;
  type: string;
}

function classifyTexture(raw: string | null | undefined): TextureKind {
  const t = (raw ?? "").trim();
  if (!t) return "empty";
  if (t.startsWith("#")) return "procedural";
  return "file";
}

function parseProcedural(raw: string): ProceduralColor | null {
  const m = raw.match(/^#\([^)]+\)color\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => s.trim());
  if (parts.length < 3) return null;
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length >= 4 ? Number(parts[3]) : 1;
  const type = parts.length >= 5 ? parts[4] : "";
  if ([r, g, b, a].some((v) => !Number.isFinite(v))) return null;
  return { r, g, b, a, type };
}

function proceduralCss(color: ProceduralColor): string {
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)}, ${color.a.toFixed(2)})`;
}

/** Emit the Bohemia procedural string a build step can write into
 *  `hiddenSelectionsTextures[]` verbatim. 8x8x3 ARGB is the canonical
 *  shape vanilla uses for flat-colour fills — matches what the
 *  engine expects. */
function formatProcedural(color: ProceduralColor): string {
  const fmt = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    // Trim trailing zeros but keep at least one decimal for clarity.
    return Number(clamped.toFixed(3)).toString();
  };
  const type = color.type || "CO";
  return `#(argb,8,8,3)color(${fmt(color.r)},${fmt(color.g)},${fmt(color.b)},${fmt(color.a)},${type})`;
}

/** Convert a 0-1 unit colour to a `#rrggbb` hex the native
 *  `<input type="color">` understands. Alpha is dropped — the native
 *  picker doesn't take it. */
function unitToHex(color: ProceduralColor | null): string {
  if (!color) return "#000000";
  const to255 = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)));
  const pad = (n: number) => n.toString(16).padStart(2, "0");
  return `#${pad(to255(color.r))}${pad(to255(color.g))}${pad(to255(color.b))}`;
}

/** Parse a `#rrggbb` hex from the native colour picker back to 0-1
 *  unit values. Returns null on malformed input so callers can
 *  ignore unexpected events. */
function hexToUnit(
  hex: string,
): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16) / 255,
    g: parseInt(m[2], 16) / 255,
    b: parseInt(m[3], 16) / 255,
  };
}

/** Thin wrapper around the browser's native colour picker, styled
 *  to match a shadcn Button. The `<input type="color">` is hidden
 *  but clickable via `htmlFor`. */
function ColorPickerButton({
  hex,
  onChange,
  highlighted,
}: {
  hex: string;
  onChange: (hex: string) => void;
  highlighted: boolean;
}) {
  const id = `color-picker-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
        highlighted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/60 bg-background hover:bg-muted/50",
      )}
      title="Replace the procedural texture with a different solid colour"
    >
      <span
        className="h-3.5 w-3.5 rounded border border-border/60"
        style={{ backgroundColor: hex }}
      />
      Pick colour
      <input
        id={id}
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </label>
  );
}

function generateConfigPreview(state: WizardState): string {
  const src = state.source!;
  const rows = buildSelectionRows(src);
  const textureArray = rows
    .map((row, i) => {
      const slot = state.slots[i];
      // Colour override — emit the procedural string directly.
      if (slot?.sourceColor) {
        return `    "${formatProcedural(slot.sourceColor)}"`;
      }
      // File override — emit the final PAA path under the mod's data/ folder.
      if (slot?.sourceFile) {
        const stem = state.newClassname.toLowerCase();
        const slotName = row.selection || `slot${i}`;
        // Preview uses a generic `<addon>` placeholder — the actual
        // addon name is derived from the library's mod folder setting
        // at build time.
        return `    "<addon>\\data\\${stem}_${slotName}_co.paa"`;
      }
      // No override — vanilla passthrough, works for file paths AND
      // procedural strings unchanged.
      return `    "${row.texture}"`;
    })
    .join(",\n");

  const container = src.containers[0] ?? "CfgVehicles";

  return `class ${container} {
  class ${src.name};
  class ${state.newClassname}: ${src.name} {
    scope = 2;
    displayName = "${state.newClassname}";
    hiddenSelections[] = {${src.hiddenSelections.map((s) => `"${s}"`).join(", ")}};
    hiddenSelectionsTextures[] = {
${textureArray}
    };
  };
};`;
}
