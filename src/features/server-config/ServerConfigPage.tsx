import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Braces,
  ChevronDown,
  FileCode,
  Loader2,
  MinusCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { InfoTooltip } from "@/components/InfoTooltip";
import {
  useServerCfgSnapshot,
  useServerCfgUpdate,
} from "@/hooks/useServerCfg";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type {
  CfgSegment,
  CfgValueKind,
  ServerCfg,
} from "@/types/ipc";

import { AddKeyDialog } from "./AddKeyDialog";
import { CFG_GROUPS, groupFor, infoFor, type CfgGroup } from "./catalog";

export function ServerConfigPage() {
  const active = useProfileStore((s) => s.active);
  const snapshot = useServerCfgSnapshot();
  const update = useServerCfgUpdate();

  const [draft, setDraft] = useState<ServerCfg | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"all" | CfgGroup>("all");
  const [addKeyOpen, setAddKeyOpen] = useState(false);

  useEffect(() => {
    if (snapshot.data) setDraft(snapshot.data.data);
  }, [snapshot.data]);

  const dirty = useMemo(() => {
    if (!draft || !snapshot.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(snapshot.data.data);
  }, [draft, snapshot.data]);

  const segments = draft?.segments ?? [];

  // Only scalar + array segments are filterable. Other segments get
  // rendered in their original positions within their own sections.
  type EditableSeg = Extract<CfgSegment, { kind: "scalar" | "array" }>;
  const editableIndexed = useMemo(() => {
    const out: { seg: EditableSeg; index: number }[] = [];
    segments.forEach((seg, i) => {
      if (seg.kind === "scalar" || seg.kind === "array") {
        out.push({ seg, index: i });
      }
    });
    return out;
  }, [segments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return editableIndexed.filter(({ seg }) => {
      const key = seg.key;
      if (group !== "all" && groupFor(key) !== group) return false;
      if (q) {
        const info = infoFor(key);
        const valText =
          seg.kind === "scalar" ? seg.rawValue : seg.elements.join(" ");
        const hay =
          `${key} ${valText} ${info?.summary ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [editableIndexed, search, group]);

  const classSegments = useMemo(
    () => segments.filter((s) => s.kind === "classBlock"),
    [segments],
  );

  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    segments.forEach((s) => {
      if (s.kind === "scalar" || s.kind === "array") keys.add(s.key);
    });
    return keys;
  }, [segments]);

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a profile to view serverDZ.cfg.
      </div>
    );
  }

  if (snapshot.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading serverDZ.cfg…
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

  const save = () => {
    if (!draft) return;
    update.mutate(draft, {
      onSuccess: () => {
        toast.success("serverDZ.cfg saved", {
          description: `${draft.segments.length} segments written.`,
        });
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const revert = () => {
    if (snapshot.data) setDraft(snapshot.data.data);
  };

  const patchAt = (index: number, next: CfgSegment) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            segments: prev.segments.map((s, i) => (i === index ? next : s)),
          }
        : prev,
    );
  };

  const removeAt = (index: number) => {
    setDraft((prev) =>
      prev
        ? { ...prev, segments: prev.segments.filter((_, i) => i !== index) }
        : prev,
    );
  };

  const appendSegment = (seg: CfgSegment) => {
    setDraft((prev) =>
      prev ? { ...prev, segments: [...prev.segments, seg] } : prev,
    );
  };

  const data = snapshot.data!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Wrench}
        title="Server configuration"
        description="serverDZ.cfg — the launch-time Arma-cfg file. Scalars and arrays edit in the table below; any class blocks are preserved verbatim and shown as read-only panels."
        badges={
          <>
            {data.missingFile ? (
              <Badge
                variant="outline"
                className="border-severity-warning/40 text-severity-warning"
              >
                file missing — will be created on save
              </Badge>
            ) : null}
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
        path={data.missingFile ? undefined : data.fileDisplay}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={revert}
              disabled={!dirty || update.isPending}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Revert
            </Button>
            <Button
              size="sm"
              onClick={save}
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

      <ServerCfgExplainer searchedPaths={data.searchedPaths} />

      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 text-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search key / value / description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-72 pl-7 text-xs"
          />
        </div>
        <Select
          value={group}
          onValueChange={(v) => setGroup(v as typeof group)}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {CFG_GROUPS.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">
          {filtered.length} of {editableIndexed.length} editable key
          {editableIndexed.length === 1 ? "" : "s"} ·{" "}
          {classSegments.length} class block
          {classSegments.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setAddKeyOpen(true)}
          className="ml-auto h-7"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add key…
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 && editableIndexed.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No editable keys found. Click Add key above to start, or
            paste a serverDZ.cfg at{" "}
            <code>{data.fileDisplay}</code>.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No keys match the current search / group filter.
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[220px_80px_1fr_100px_32px] gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Key</span>
              <span>Type</span>
              <span>Value</span>
              <span>Group</span>
              <span />
            </div>
            {filtered.map(({ seg, index }) =>
              seg.kind === "scalar" ? (
                <ScalarRow
                  key={index}
                  seg={seg}
                  onPatch={(next) => patchAt(index, next)}
                  onRemove={() => removeAt(index)}
                />
              ) : seg.kind === "array" ? (
                <ArrayRow
                  key={index}
                  seg={seg}
                  onPatch={(next) => patchAt(index, next)}
                  onRemove={() => removeAt(index)}
                />
              ) : null,
            )}
          </div>
        )}

        {classSegments.length > 0 ? (
          <section className="mt-8 space-y-3">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2 text-xs">
              <Braces className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="font-semibold">Class blocks (read-only)</h2>
              <InfoTooltip tagline="Preserved verbatim">
                These get parsed structurally in a later phase. For now
                they round-trip byte-for-byte on save — if you need to
                change them, edit the file by hand and re-open.
              </InfoTooltip>
            </div>
            {classSegments.map((c, i) =>
              c.kind === "classBlock" ? (
                <ClassBlockPanel key={i} seg={c} />
              ) : null,
            )}
          </section>
        ) : null}
      </div>

      <AddKeyDialog
        open={addKeyOpen}
        onOpenChange={setAddKeyOpen}
        existingKeys={existingKeys}
        onAdd={appendSegment}
      />
    </div>
  );
}

// ---------- Scalar row ----------

function ScalarRow({
  seg,
  onPatch,
  onRemove,
}: {
  seg: Extract<CfgSegment, { kind: "scalar" }>;
  onPatch: (next: CfgSegment) => void;
  onRemove: () => void;
}) {
  const info = infoFor(seg.key);
  const groupLabel =
    CFG_GROUPS.find((g) => g.id === groupFor(seg.key))?.label ?? "";
  const { value, setValue, kind } = useScalarValueBinding(seg, onPatch);
  return (
    <div className="grid grid-cols-[220px_80px_1fr_100px_32px] items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={seg.key}
          onChange={(e) =>
            onPatch({ ...seg, key: e.target.value })
          }
          placeholder="key"
          className="h-7 font-mono text-xs"
        />
        {info ? (
          <InfoTooltip tagline={info.summary}>
            {info.detail ?? info.summary}
            {info.unit ? (
              <div className="mt-1 font-mono text-[10px] opacity-70">
                unit: {info.unit}
              </div>
            ) : null}
          </InfoTooltip>
        ) : null}
      </div>
      <Select
        value={kind}
        onValueChange={(k) => {
          onPatch({ ...seg, valueKind: k as CfgValueKind });
        }}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="string">string</SelectItem>
          <SelectItem value="integer">integer</SelectItem>
          <SelectItem value="float">float</SelectItem>
          <SelectItem value="ident">ident</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Input
          type={
            kind === "integer" || kind === "float" ? "number" : "text"
          }
          step={kind === "float" ? "any" : "1"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={cn(
            "h-7 text-xs tabular-nums",
            (kind === "string" || kind === "ident") && "font-mono",
          )}
        />
        {info?.unit ? (
          <Label className="shrink-0 text-[10px] text-muted-foreground">
            {info.unit}
          </Label>
        ) : null}
      </div>
      <span className="truncate text-[10px] text-muted-foreground">
        {groupLabel}
      </span>
      <Button
        size="icon"
        variant="ghost"
        onClick={onRemove}
        title="Remove key"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Maps `rawValue` ↔ a user-friendly display value depending on
 *  kind. Strings are shown without quotes in the input; quotes get
 *  re-applied on write.  */
function useScalarValueBinding(
  seg: Extract<CfgSegment, { kind: "scalar" }>,
  onPatch: (next: CfgSegment) => void,
) {
  const value =
    seg.valueKind === "string"
      ? unquote(seg.rawValue)
      : seg.rawValue;
  const setValue = (next: string) => {
    const rawValue =
      seg.valueKind === "string" ? quote(next) : next.trim();
    onPatch({ ...seg, rawValue });
  };
  return { value, setValue, kind: seg.valueKind };
}

function unquote(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("\"") && s.endsWith("\"") && s.length >= 2) {
    return s.slice(1, -1).replace(/""/g, "\"");
  }
  return s;
}

function quote(s: string): string {
  return `"${s.replace(/"/g, "\"\"")}"`;
}

// ---------- Array row ----------

function ArrayRow({
  seg,
  onPatch,
  onRemove,
}: {
  seg: Extract<CfgSegment, { kind: "array" }>;
  onPatch: (next: CfgSegment) => void;
  onRemove: () => void;
}) {
  const info = infoFor(seg.key);
  const groupLabel =
    CFG_GROUPS.find((g) => g.id === groupFor(seg.key))?.label ?? "";

  const patchElement = (i: number, raw: string) => {
    onPatch({
      ...seg,
      elements: seg.elements.map((e, ii) => (ii === i ? raw : e)),
    });
  };
  const removeElement = (i: number) => {
    onPatch({ ...seg, elements: seg.elements.filter((_, ii) => ii !== i) });
  };
  const addElement = () => {
    onPatch({ ...seg, elements: [...seg.elements, '""'] });
  };

  return (
    <div className="rounded-md border border-border/40 bg-muted/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Input
          value={seg.key}
          onChange={(e) => onPatch({ ...seg, key: e.target.value })}
          className="h-7 max-w-xs font-mono text-xs"
        />
        <Badge variant="outline" className="text-[10px]">
          array[] · {seg.elements.length} items
        </Badge>
        {info ? (
          <InfoTooltip tagline={info.summary}>
            {info.detail ?? info.summary}
          </InfoTooltip>
        ) : null}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {groupLabel}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={onRemove}
          title="Remove entire array key"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-2 space-y-1">
        {seg.elements.length === 0 ? (
          <div className="text-[11px] italic text-muted-foreground">
            Empty array.
          </div>
        ) : (
          seg.elements.map((el, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <Input
                value={el}
                onChange={(e) => patchElement(i, e.target.value)}
                placeholder='"element"'
                className="h-7 flex-1 font-mono text-xs"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => removeElement(i)}
                title={`Remove element ${i + 1}`}
              >
                <MinusCircle className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={addElement}
          className="h-7"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add element
        </Button>
      </div>
      <p className="mt-2 text-[10px] italic text-muted-foreground">
        Each element is written verbatim — include quotes for strings.
      </p>
    </div>
  );
}

// ---------- Class block panel (read-only) ----------

function ClassBlockPanel({
  seg,
}: {
  seg: Extract<CfgSegment, { kind: "classBlock" }>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/50 bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/30"
      >
        <Braces className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono font-semibold">
          class {seg.name}
          {seg.base ? `: ${seg.base}` : ""}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {seg.raw.split("\n").length} line{seg.raw.split("\n").length === 1 ? "" : "s"}
        </Badge>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <pre className="max-h-[50vh] overflow-auto border-t border-border/40 bg-muted/20 p-3 text-[11px] leading-snug">
          {seg.raw}
        </pre>
      ) : null}
    </div>
  );
}

// ---------- Explainer ----------

function ServerCfgExplainer({ searchedPaths }: { searchedPaths: string[] }) {
  return (
    <Explainer
      title="How serverDZ.cfg works"
      subtitle="launch-time Arma-cfg file; changes take effect on server restart."
      storageKey="dzcm.server-cfg.explainer.open"
    >
      <p>
        <strong className="text-foreground">File location.</strong> DayZ
        doesn't have a single canonical path — the launcher points{" "}
        <code>-config=...</code> wherever you put it. This tool walks a
        few common spots and uses the first it finds:
      </p>
      <ul className="list-disc pl-5 font-mono text-[11px]">
        {searchedPaths.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p>
        <FileCode className="mr-1 inline h-3 w-3" />
        <strong className="text-foreground">What's editable.</strong>{" "}
        Top-level <code>key = value;</code> scalars and{" "}
        <code>key[] = {`{ ... }`};</code> arrays in the table above.
        Any <code>class X {`{ ... }`}</code> block is preserved
        verbatim; expand a panel below the table to inspect it.
      </p>
      <p>
        <strong className="text-foreground">Round-trip safety.</strong>{" "}
        Comments, blank lines, and class bodies pass through
        byte-for-byte — editing hostname won't reformat your BattlEye
        block.
      </p>
      <p className="italic">
        Known-key descriptions (hostname, passwordAdmin, maxPlayers,
        etc.) get inline tooltips. Unknown keys still edit fine —
        useful for mod-authored additions like{" "}
        <code>ExpansionMod_allowQuestSkip</code>.
      </p>
    </Explainer>
  );
}
