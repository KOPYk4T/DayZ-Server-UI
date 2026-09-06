import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ClipboardPaste,
  Dice5,
  Loader2,
  Map as MapIcon,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Undo2,
  Users,
  Waypoints,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/InfoTooltip";
import { VanillaOverriddenBanner } from "@/features/mods/VanillaOverriddenBanner";
import {
  usePlayerSpawnsSnapshot,
  usePlayerSpawnsUpdate,
} from "@/hooks/usePlayerSpawns";
import { cn, errorMessage } from "@/lib/utils";
import type { PlayerSpawnPoints, SpawnPosition } from "@/types/ipc";

type SpawnKind = "fresh" | "hop" | "travel";

const KIND_META: Record<
  SpawnKind,
  { label: string; icon: React.ReactNode; description: string }
> = {
  fresh: {
    label: "Fresh",
    icon: <Users className="mr-1.5 h-3.5 w-3.5" />,
    description:
      "Brand-new character spawn bubbles. These are the points CE picks between when a player joins with a fresh spawn — typically scattered along the coast for vanilla Chernarus.",
  },
  hop: {
    label: "Hop",
    icon: <Waypoints className="mr-1.5 h-3.5 w-3.5" />,
    description:
      "Cross-server join points. Used when a player joins this server from a different one (when server hopping isn't disabled). Usually the same coastal pool as Fresh.",
  },
  travel: {
    label: "Travel",
    icon: <MapPin className="mr-1.5 h-3.5 w-3.5" />,
    description:
      "Map-transition spawn bubbles. Used by scripts that move a player between missions / instances. Empty is fine if the mission doesn't use travel.",
  },
};

export function PlayerSpawnsPage() {
  const snapshot = usePlayerSpawnsSnapshot();
  const update = usePlayerSpawnsUpdate();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<SpawnKind>("fresh");
  const [draft, setDraft] = useState<PlayerSpawnPoints | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);

  useEffect(() => {
    if (snapshot.data) setDraft(snapshot.data.data);
  }, [snapshot.data]);

  // ?kind=fresh|hop|travel pre-selects a tab — used by the map page
  // when the user clicks "Open table view" for a specific kind.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const k = params.get("kind");
    if (k === "fresh" || k === "hop" || k === "travel") setTab(k);
  }, [location.search]);

  const dirty = useMemo(() => {
    if (!draft || !snapshot.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(snapshot.data.data);
  }, [draft, snapshot.data]);

  if (snapshot.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading cfgplayerspawnpoints…
      </div>
    );
  }

  if (snapshot.isError) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2 break-words">
            <div className="font-mono text-xs">
              {errorMessage(snapshot.error)}
            </div>
            <div className="mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void snapshot.refetch()}
              >
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const save = (force = false) => {
    if (!draft) return;
    if (draft.hasUnsupportedGenerators && !force) {
      setConfirmSave(true);
      return;
    }
    update.mutate(draft, {
      onSuccess: () =>
        toast.success("cfgplayerspawnpoints.xml saved", {
          description: `${draft.fresh.length} fresh · ${draft.hop.length} hop · ${draft.travel.length} travel`,
        }),
      onError: (err) => toast.error(errorMessage(err)),
    });
    setConfirmSave(false);
  };

  const revert = () => {
    if (snapshot.data) setDraft(snapshot.data.data);
  };

  const updateKind = (kind: SpawnKind, next: SpawnPosition[]) => {
    setDraft({ ...draft, [kind]: next });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={MapPin}
        title="Player Spawns"
        description="cfgplayerspawnpoints.xml — the fresh / hop / travel spawn bubble lists CE picks from when a player joins."
        badges={
          <>
            {snapshot.data?.missingFile ? (
              <Badge
                variant="outline"
                className="border-severity-warning/40 text-severity-warning"
              >
                file missing — will be created on save
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="font-mono text-[10px]"
                title={
                  draft.posFormat === "posBubble"
                    ? 'File uses the modern <pos_bubble pos="x z" z_rot="a"/> entry form. Saves round-trip in the same form.'
                    : 'File uses the older <pos x="…" z="…" a="…"/> entry form. Saves round-trip in the same form.'
                }
              >
                format: {draft.posFormat === "posBubble" ? "pos_bubble" : "pos"}
              </Badge>
            )}
            {dirty ? (
              <Badge
                variant="outline"
                className="border-primary/40 text-primary"
              >
                unsaved
              </Badge>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                navigate(`/app/map?layer=player-spawns&kind=${tab}`)
              }
              title={`Open the map filtered to the ${tab} spawn layer`}
            >
              <MapIcon className="mr-1.5 h-3.5 w-3.5" /> Show on map
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={revert}
              disabled={!dirty || update.isPending}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Revert
            </Button>
            <Button
              size="sm"
              onClick={() => save(false)}
              disabled={!dirty || update.isPending}
            >
              {update.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </>
        }
      />

      <PlayerSpawnsExplainer />

      <div className="mx-6 mt-3">
        <VanillaOverriddenBanner system="player-spawns">
          Vanilla <code>cfgplayerspawnpoints.xml</code> below still
          edits correctly. Expansion ignores this file when its own
          SpawnSelection is enabled.
        </VanillaOverriddenBanner>
      </div>

      {draft.hasUnsupportedGenerators ? (
        <Alert className="mx-6 mt-3 border-severity-warning/40 bg-severity-warning/5">
          <AlertTriangle className="h-4 w-4 text-severity-warning" />
          <AlertTitle className="text-severity-warning">
            Other generator kinds present in this file
          </AlertTitle>
          <AlertDescription className="text-xs">
            The current cfgplayerspawnpoints.xml contains{" "}
            <code>generator_deviate</code> or <code>generator_random</code>{" "}
            blocks in addition to <code>generator_posbubbles</code>. This
            editor only understands <code>generator_posbubbles</code> — if
            you save from here, the other blocks get stripped. If that's
            not what you want, either edit the XML directly in the raw
            file or don't save from this screen.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SpawnKind)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-6 mt-3 w-fit">
          {(Object.keys(KIND_META) as SpawnKind[]).map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {KIND_META[kind].icon}
              {KIND_META[kind].label} ({draft[kind].length})
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(KIND_META) as SpawnKind[]).map((kind) => (
          <TabsContent
            key={kind}
            value={kind}
            className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4"
          >
            <KindHeader
              label={KIND_META[kind].label}
              description={KIND_META[kind].description}
              count={draft[kind].length}
            />
            <PositionsEditor
              positions={draft[kind]}
              onChange={(next) => updateKind(kind, next)}
            />
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save will drop unsupported blocks</DialogTitle>
            <DialogDescription className="text-xs">
              This file contains <code>generator_deviate</code> or{" "}
              <code>generator_random</code> sections that this editor
              doesn't round-trip. Saving will write out only the
              posbubbles lists and strip the other generators.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmSave(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => save(true)}
              disabled={update.isPending}
            >
              Save anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Explainer ----------

function PlayerSpawnsExplainer() {
  return (
    <Explainer
      title="How player spawns work"
      subtitle={
        <>
          CE picks a random position from the matching kind's list
          whenever a player joins; each &lt;pos&gt; is one spawn bubble.
        </>
      }
      storageKey="dzcm.player-spawns.explainer.open"
    >
      <p>
        <strong className="text-foreground">Coordinates.</strong>{" "}
        DayZ uses <code>x</code> (east-west) and <code>z</code>{" "}
        (north-south) in world metres. Chernarus is 0–15360 on both;
        Livonia 0–12800; Sakhal similar. <code>y</code> (altitude) is
        not used here — CE drops spawns to ground level.
        <code>a</code> is yaw in degrees, 0 facing north.
      </p>
      <p>
        <strong className="text-foreground">Three kinds</strong>{" "}
        (fresh, hop, travel) — see each tab's header for details. CE
        rolls one position per spawn uniformly; add more positions
        to spread starting locations.
      </p>
      <p>
        <strong className="text-foreground">Paste-import</strong> is
        useful when you've got a list of coordinates from an admin
        tool — it accepts formats like{" "}
        <code>6644 2464 91.4</code> or{" "}
        <code>x=6644 z=2464 a=91.4</code>, one line per position.
      </p>
      <p className="italic">
        A proper map view is coming in the next phase — for now this
        is a tabular editor. Use DayZ mapping sites (iZurvive etc.)
        to look up coordinates if you're placing points by hand.
      </p>
    </Explainer>
  );
}

function KindHeader({
  label,
  description,
  count,
}: {
  label: string;
  description: string;
  count: number;
}) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold">
        {label}{" "}
        <span className="text-muted-foreground">({count} position{count === 1 ? "" : "s"})</span>
      </h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

// ---------- Positions editor ----------

function PositionsEditor({
  positions,
  onChange,
}: {
  positions: SpawnPosition[];
  onChange: (next: SpawnPosition[]) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);

  const add = () => onChange([...positions, { x: 0, z: 0, a: 0 }]);
  const update = (i: number, patch: Partial<SpawnPosition>) =>
    onChange(positions.map((p, ii) => (ii === i ? { ...p, ...patch } : p)));
  const remove = (i: number) =>
    onChange(positions.filter((_, ii) => ii !== i));
  const clear = () => onChange([]);
  const randomiseYaw = () =>
    onChange(
      positions.map((p) => ({ ...p, a: Math.round(Math.random() * 360) })),
    );

  const importedHandler = (imported: SpawnPosition[], mode: "replace" | "append") => {
    onChange(mode === "replace" ? imported : [...positions, ...imported]);
    toast.success(`${mode === "replace" ? "Replaced with" : "Appended"} ${imported.length} position${imported.length === 1 ? "" : "s"}`);
    setPasteOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={randomiseYaw} disabled={positions.length === 0}>
          <Dice5 className="mr-1.5 h-3.5 w-3.5" /> Randomise all yaws
        </Button>
        <Button size="sm" variant="ghost" onClick={clear} disabled={positions.length === 0}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Paste import
        </Button>
        <Button size="sm" onClick={add}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add position
        </Button>
      </div>

      {positions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          No positions in this list. Click Add to enter coordinates by
          hand, or Paste import to drop a block of coordinates from
          iZurvive / admin tools.
        </div>
      ) : (
        <div className="space-y-1">
          <div className="grid grid-cols-[40px_1fr_1fr_100px_32px] gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>#</span>
            <HelpLabel
              label="x"
              tagline="East-west world metre"
              description="DayZ's X axis. Chernarus is 0–15360 (west to east). Positive values are east of the map origin."
            />
            <HelpLabel
              label="z"
              tagline="North-south world metre"
              description="DayZ's Z axis — NOT Y. Higher values are further north. Chernarus 0–15360 (south to north)."
            />
            <HelpLabel
              label="yaw (a)"
              tagline="Facing direction in degrees"
              description="0 faces north, 90 east, 180 south, 270 west. CE rotates the player to this angle when they spawn. Doesn't matter hugely for gameplay — players can look around."
              align="start"
            />
            <span />
          </div>
          {positions.map((p, i) => (
            <div
              key={i}
              className="grid grid-cols-[40px_1fr_1fr_100px_32px] items-center gap-2"
            >
              <span className="text-right text-[10px] text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <Input
                type="number"
                step="1"
                value={p.x}
                onChange={(e) =>
                  update(i, { x: Number(e.target.value) || 0 })
                }
                className="h-8 tabular-nums"
              />
              <Input
                type="number"
                step="1"
                value={p.z}
                onChange={(e) =>
                  update(i, { z: Number(e.target.value) || 0 })
                }
                className="h-8 tabular-nums"
              />
              <Input
                type="number"
                step="1"
                min="0"
                max="360"
                value={p.a}
                onChange={(e) =>
                  update(i, { a: Number(e.target.value) || 0 })
                }
                className="h-8 tabular-nums"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => remove(i)}
                aria-label={`remove position ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <PasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onImport={importedHandler}
      />
    </div>
  );
}

function HelpLabel({
  label,
  tagline,
  description,
  align,
}: {
  label: string;
  tagline?: string;
  description: string;
  align?: "start";
}) {
  return (
    <div className={cn("flex items-center gap-1", align !== "start" && "justify-start")}>
      <Label className="text-[10px] uppercase">{label}</Label>
      <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
    </div>
  );
}

// ---------- Paste-import ----------

function PasteDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (positions: SpawnPosition[], mode: "replace" | "append") => void;
}) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseCoordinates(text), [text]);
  const hasErrors = parsed.errors.length > 0;

  useEffect(() => {
    if (!open) setText("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste coordinates</DialogTitle>
          <DialogDescription className="text-xs">
            One position per line. Accepted formats:{" "}
            <code>x z a</code>, <code>x, z, a</code>, <code>x=… z=… a=…</code>,
            or a raw <code>&lt;pos x="…" z="…" a="…"/&gt;</code> line — all
            mixed is fine. Lines that can't be parsed are listed below
            so you can fix them before importing.
          </DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`6644 2464 91.4\n4847 2477 272.5\n<pos x="5500" z="2100" a="0"/>`}
          className="h-48 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        />

        <div className="space-y-1 text-xs">
          <p className="text-muted-foreground">
            <strong className="text-foreground">
              {parsed.positions.length}
            </strong>{" "}
            valid position{parsed.positions.length === 1 ? "" : "s"}
            {hasErrors
              ? `, ${parsed.errors.length} line${parsed.errors.length === 1 ? "" : "s"} couldn't be parsed:`
              : ""}
          </p>
          {hasErrors ? (
            <ul className="max-h-32 overflow-y-auto rounded-md border border-severity-warning/40 bg-severity-warning/5 p-2 text-[11px] text-severity-warning">
              {parsed.errors.slice(0, 10).map((err, i) => (
                <li key={i} className="font-mono">
                  line {err.line}: {err.reason} — <em>{err.raw}</em>
                </li>
              ))}
              {parsed.errors.length > 10 ? (
                <li>…and {parsed.errors.length - 10} more.</li>
              ) : null}
            </ul>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => onImport(parsed.positions, "append")}
            disabled={parsed.positions.length === 0}
          >
            Append ({parsed.positions.length})
          </Button>
          <Button
            onClick={() => onImport(parsed.positions, "replace")}
            disabled={parsed.positions.length === 0}
          >
            Replace list ({parsed.positions.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ParseResult {
  positions: SpawnPosition[];
  errors: Array<{ line: number; raw: string; reason: string }>;
}

function parseCoordinates(text: string): ParseResult {
  const positions: SpawnPosition[] = [];
  const errors: ParseResult["errors"] = [];
  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    // <pos x="…" z="…" a="…"/>
    const xmlMatch =
      trimmed.match(/x\s*=\s*["']?(-?\d+(?:\.\d+)?)["']?/i) ?? null;
    const zMatch =
      trimmed.match(/z\s*=\s*["']?(-?\d+(?:\.\d+)?)["']?/i) ?? null;
    const aMatch =
      trimmed.match(/a\s*=\s*["']?(-?\d+(?:\.\d+)?)["']?/i) ?? null;

    if (xmlMatch && zMatch) {
      positions.push({
        x: Number(xmlMatch[1]),
        z: Number(zMatch[1]),
        a: aMatch ? Number(aMatch[1]) : 0,
      });
      return;
    }

    // Fallback: bare space/comma separated: x z [a]
    const parts = trimmed
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const nums = parts.map(Number).filter((n) => !Number.isNaN(n));
    if (nums.length >= 2) {
      positions.push({
        x: nums[0],
        z: nums[1],
        a: nums[2] ?? 0,
      });
      return;
    }

    errors.push({ line, raw: trimmed, reason: "couldn't find x and z" });
  });
  return { positions, errors };
}
