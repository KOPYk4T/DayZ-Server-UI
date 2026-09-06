import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Library,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Explainer } from "@/components/Explainer";
import { InfoTooltip } from "@/components/InfoTooltip";
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
import {
  useGlobalsSnapshot,
  useGlobalsUpdate,
} from "@/hooks/useGlobals";
import { cn, errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { GlobalVar, GlobalVarType, Globals } from "@/types/ipc";

import {
  GLOBAL_CATALOG,
  GLOBAL_GROUPS,
  groupFor,
  infoFor,
  type GlobalGroup,
} from "./catalog";
import { GlobalsLibraryDialog } from "./GlobalsLibraryDialog";

export function GlobalsPage() {
  const active = useProfileStore((s) => s.active);
  const snapshot = useGlobalsSnapshot();
  const update = useGlobalsUpdate();

  const [draft, setDraft] = useState<Globals | null>(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<"all" | GlobalGroup>("all");
  const [libraryOpen, setLibraryOpen] = useState(false);

  useEffect(() => {
    if (snapshot.data) setDraft(snapshot.data.data);
  }, [snapshot.data]);

  const dirty = useMemo(() => {
    if (!draft || !snapshot.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(snapshot.data.data);
  }, [draft, snapshot.data]);

  const vars = draft?.vars ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vars
      .map((v, index) => ({ v, index }))
      .filter(({ v }) => {
        if (group !== "all" && groupFor(v.name) !== group) return false;
        if (q) {
          const info = infoFor(v.name);
          const hay =
            `${v.name} ${v.value} ${info?.summary ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [vars, search, group]);

  // Precompute the in-use var name set here — must stay above any
  // early-return below so the hook order never shifts.
  const existingNames = useMemo(
    () => new Set(vars.map((v) => v.name)),
    [vars],
  );

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a profile to view globals.
      </div>
    );
  }

  if (snapshot.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading globals.xml…
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
      onSuccess: () =>
        toast.success("globals.xml saved", {
          description: `${draft.vars.length} var${draft.vars.length === 1 ? "" : "s"} written.`,
        }),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const revert = () => {
    if (snapshot.data) setDraft(snapshot.data.data);
  };

  const patchVar = (index: number, patch: Partial<GlobalVar>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            vars: prev.vars.map((v, i) => (i === index ? { ...v, ...patch } : v)),
          }
        : prev,
    );
  };

  const removeVar = (index: number) => {
    setDraft((prev) =>
      prev
        ? { ...prev, vars: prev.vars.filter((_, i) => i !== index) }
        : prev,
    );
  };

  const addVar = (v: GlobalVar) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            vars: [...prev.vars, v],
          }
        : prev,
    );
  };

  const data = snapshot.data!;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={MessagesSquare}
        title="Globals & Messages"
        description="globals.xml — Central Economy global tuning. Vanilla Chernarus has ~80 vars; mods often add more."
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

      <GlobalsExplainer />

      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-6 py-3 text-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name / description / value"
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
            {GLOBAL_GROUPS.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">
          {filtered.length} of {vars.length} var{vars.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setLibraryOpen(true)}
          className="ml-auto h-7"
        >
          <Library className="mr-1.5 h-3.5 w-3.5" /> Add from library
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            {vars.length === 0
              ? "No vars in this file. Click 'Add from library' to insert one — a blank globals.xml will be written on save."
              : "No vars match the current search / group filter."}
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="grid grid-cols-[1fr_90px_1fr_80px_32px] gap-2 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Name</span>
              <span>Type</span>
              <span>Value</span>
              <span>Group</span>
              <span />
            </div>
            {filtered.map(({ v, index }) => (
              <VarRow
                key={index}
                v={v}
                onPatch={(patch) => patchVar(index, patch)}
                onRemove={() => removeVar(index)}
              />
            ))}
          </div>
        )}
      </div>

      <GlobalsLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        existingNames={existingNames}
        onAdd={addVar}
      />
    </div>
  );
}

function VarRow({
  v,
  onPatch,
  onRemove,
}: {
  v: GlobalVar;
  onPatch: (patch: Partial<GlobalVar>) => void;
  onRemove: () => void;
}) {
  const info = infoFor(v.name);
  const groupLabel =
    GLOBAL_GROUPS.find((g) => g.id === groupFor(v.name))?.label ?? "";
  const isNumeric = v.varType === "integer" || v.varType === "float";
  return (
    <div className="grid grid-cols-[1fr_90px_1fr_80px_32px] items-center gap-2 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <Input
          value={v.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          placeholder="VarName"
          className="h-7 font-mono text-xs"
        />
        {info ? (
          <InfoTooltip tagline={info.summary}>
            {info.detail ?? info.summary}
            {info.min != null || info.max != null ? (
              <div className="mt-1 font-mono text-[10px] opacity-70">
                {info.min != null ? `min ${info.min}` : ""}
                {info.min != null && info.max != null ? " · " : ""}
                {info.max != null ? `max ${info.max}` : ""}
                {info.unit ? ` · unit ${info.unit}` : ""}
              </div>
            ) : null}
          </InfoTooltip>
        ) : null}
      </div>
      <Select
        value={v.varType}
        onValueChange={(t) => onPatch({ varType: t as GlobalVarType })}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="integer">integer</SelectItem>
          <SelectItem value="float">float</SelectItem>
          <SelectItem value="string">string</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Input
          type={isNumeric ? "number" : "text"}
          step={v.varType === "float" ? "any" : "1"}
          value={v.value}
          onChange={(e) => onPatch({ value: e.target.value })}
          className={cn(
            "h-7 text-xs tabular-nums",
            isNumeric && "font-mono",
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
        aria-label={`remove ${v.name}`}
        title="Remove var"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function GlobalsExplainer() {
  const knownCount = Object.keys(GLOBAL_CATALOG).length;
  return (
    <Explainer
      title="How globals.xml works"
      subtitle={
        <>
          flat list of CE tuning vars. {knownCount} have built-in
          descriptions; unknown vars still edit fine, just without a
          tooltip.
        </>
      }
      storageKey="dzcm.globals.explainer.open"
    >
      <p>
        <strong className="text-foreground">What this file is.</strong>{" "}
        globals.xml lives at{" "}
        <code>mpmissions/&lt;mission&gt;/db/globals.xml</code>. It's a
        flat list of server-wide Central Economy settings — cleanup
        timers, login-protection durations, animal/zombie caps, etc.
        Changes take effect on the next server restart.
      </p>
      <p>
        <strong className="text-foreground">Types.</strong> DayZ stores
        a <code>type</code> attribute per var (0 = integer, 1 = float,
        2 = string). For most vanilla vars it's <code>0</code>;
        numeric inputs on this page reflect that when known.
      </p>
      <p>
        <strong className="text-foreground">Round-trip safe.</strong>{" "}
        Save preserves the original order of vars and formats values
        as strings — no silent precision loss on floats. Unknown vars
        (your mods or custom additions) pass through untouched.
      </p>
      <p className="italic">
        A few commonly-tuned vars (e.g. <code>TimeLogin</code>,{" "}
        <code>CleanupLifetimeDeadPlayer</code>,{" "}
        <code>AnimalMaxCount</code>) have inline tooltips. The
        catalogue grows as contributors flag more.
      </p>
    </Explainer>
  );
}
