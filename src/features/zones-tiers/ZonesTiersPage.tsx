import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Tag,
  Target,
  Trash2,
  Undo2,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useLimitsSnapshot, useLimitsUpdate } from "@/hooks/useLimits";
import { cn, errorMessage } from "@/lib/utils";
import type {
  LimitFlag,
  LimitName,
  LimitsDefinition,
  LimitsImpact,
} from "@/types/ipc";

import { LIMIT_FIELDS, ZONES_TIERS_EXPLAINER } from "./glossary";

type ListKind = "categories" | "tags" | "usageflags" | "valueflags";

/** Map limits-list kind to the query parameter the Items page recognises. */
const FILTER_PARAM: Record<ListKind, "category" | "tag" | "usage" | "value"> = {
  categories: "category",
  tags: "tag",
  usageflags: "usage",
  valueflags: "value",
};

export function ZonesTiersPage() {
  const snapshot = useLimitsSnapshot();
  const update = useLimitsUpdate();
  const navigate = useNavigate();

  const drillToItems = (kind: ListKind, name: string) => {
    const param = FILTER_PARAM[kind];
    navigate(`/app/items?${param}=${encodeURIComponent(name)}`);
  };

  const [tab, setTab] = useState<ListKind>("categories");
  const [draft, setDraft] = useState<LimitsDefinition | null>(null);

  // Sync the draft whenever the backend snapshot changes.
  useEffect(() => {
    if (snapshot.data) setDraft(snapshot.data.definition);
  }, [snapshot.data]);

  const dirty = useMemo(() => {
    if (!draft || !snapshot.data) return false;
    return (
      JSON.stringify(draft) !== JSON.stringify(snapshot.data.definition)
    );
  }, [draft, snapshot.data]);

  if (snapshot.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading cfglimitsdefinition…
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

  const impact = snapshot.data!.impact;

  const save = () => {
    if (!draft) return;
    update.mutate(draft, {
      onSuccess: () =>
        toast.success("cfglimitsdefinition.xml saved", {
          description: "items are re-validated against the new definition",
        }),
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const revert = () => {
    if (snapshot.data) setDraft(snapshot.data.definition);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Shield}
        title="Zones & Tiers"
        description="cfglimitsdefinition.xml — the vocabulary every item's usage, value, category and tag fields must pick from."
        badges={
          <>
            {snapshot.data?.missingFile ? (
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
        actions={
          <>
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

      <ZonesTiersExplainer />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as ListKind)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-6 mt-3 w-fit">
          <TabsTrigger value="categories">
            <Tag className="mr-1.5 h-3.5 w-3.5" /> Categories (
            {draft.categories.length})
          </TabsTrigger>
          <TabsTrigger value="tags">
            <Tag className="mr-1.5 h-3.5 w-3.5" /> Tags (
            {draft.tags.length})
          </TabsTrigger>
          <TabsTrigger value="usageflags">
            <Target className="mr-1.5 h-3.5 w-3.5" /> Usage (
            {draft.usageflags.length})
          </TabsTrigger>
          <TabsTrigger value="valueflags">
            <Target className="mr-1.5 h-3.5 w-3.5" /> Value / Tiers (
            {draft.valueflags.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="categories"
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4"
        >
          <NamedListEditor
            kind="categories"
            entries={draft.categories}
            impact={impact.categories}
            orphans={impact.orphanCategories}
            onChange={(next) => setDraft({ ...draft, categories: next })}
            onDrillToItems={(name) => drillToItems("categories", name)}
          />
        </TabsContent>
        <TabsContent
          value="tags"
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4"
        >
          <NamedListEditor
            kind="tags"
            entries={draft.tags}
            impact={impact.tags}
            orphans={impact.orphanTags}
            onChange={(next) => setDraft({ ...draft, tags: next })}
            onDrillToItems={(name) => drillToItems("tags", name)}
          />
        </TabsContent>
        <TabsContent
          value="usageflags"
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4"
        >
          <FlagListEditor
            kind="usageflags"
            entries={draft.usageflags}
            impact={impact.usageflags}
            orphans={impact.orphanUsageflags}
            onChange={(next) => setDraft({ ...draft, usageflags: next })}
            onDrillToItems={(name) => drillToItems("usageflags", name)}
          />
        </TabsContent>
        <TabsContent
          value="valueflags"
          className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4"
        >
          <FlagListEditor
            kind="valueflags"
            entries={draft.valueflags}
            impact={impact.valueflags}
            orphans={impact.orphanValueflags}
            onChange={(next) => setDraft({ ...draft, valueflags: next })}
            onDrillToItems={(name) => drillToItems("valueflags", name)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ZonesTiersExplainer() {
  return (
    <Explainer
      title={ZONES_TIERS_EXPLAINER.title}
      subtitle={<>{ZONES_TIERS_EXPLAINER.body}</>}
      storageKey="dzcm.zones-tiers.explainer.open"
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {ZONES_TIERS_EXPLAINER.bullets.map((b) => (
          <li
            key={b.heading}
            className="rounded-md border border-border/60 bg-card/40 p-3"
          >
            <p className="mb-1 font-semibold text-foreground">{b.heading}</p>
            <p>{b.body}</p>
          </li>
        ))}
      </ul>
    </Explainer>
  );
}

// ---------- List editors ----------

function ListHeader({
  label,
  hint,
  count,
  onAdd,
}: {
  label: string;
  hint: string;
  count: number;
  onAdd: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">
          {label}{" "}
          <span className="text-muted-foreground">({count})</span>
        </h2>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onAdd}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}

function OrphanWarning({
  kind,
  orphans,
  onAddOrphan,
}: {
  kind: ListKind;
  orphans: string[];
  onAddOrphan: (name: string) => void;
}) {
  if (orphans.length === 0) return null;
  return (
    <div className="mb-3 rounded-md border border-severity-warning/40 bg-severity-warning/5 p-3 text-xs">
      <p className="mb-1 font-medium text-severity-warning">
        {orphans.length} name{orphans.length === 1 ? "" : "s"} used on items
        but missing from this list
      </p>
      <p className="mb-2 text-muted-foreground">
        The items reference {kind === "valueflags" ? "tiers" : kind.replace(/flags$/, "")}
        {" "}
        that CE doesn't know — the dimension is silently dropped at
        runtime. Click a name to add it.
      </p>
      <div className="flex flex-wrap gap-1">
        {orphans.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onAddOrphan(o)}
            className="rounded-full border border-severity-warning/60 bg-background px-2 py-0.5 font-mono hover:bg-severity-warning/10"
          >
            + {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function NamedListEditor({
  kind,
  entries,
  impact,
  orphans,
  onChange,
  onDrillToItems,
}: {
  kind: Extract<ListKind, "categories" | "tags">;
  entries: LimitName[];
  impact: LimitsImpact["categories"];
  orphans: string[];
  onChange: (next: LimitName[]) => void;
  onDrillToItems: (name: string) => void;
}) {
  const label = kind === "categories" ? "Categories" : "Tags";
  const hint =
    kind === "categories"
      ? "One value per row. Items must reference these exact names in their <category name='…'/> element."
      : "One value per row. Items reference tags in <tag name='…'/> — tags pair with building prototype loot points.";

  const addAt = (name: string) =>
    onChange([...entries, { name: name.trim() }].filter((e) => e.name));
  const update = (i: number, patch: Partial<LimitName>) =>
    onChange(entries.map((e, ii) => (ii === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(entries.filter((_, ii) => ii !== i));

  return (
    <div className="space-y-3">
      <ListHeader
        label={label}
        hint={hint}
        count={entries.length}
        onAdd={() => addAt("")}
      />
      <OrphanWarning kind={kind} orphans={orphans} onAddOrphan={addAt} />

      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_90px_32px] gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <LabelWithHelp
            label="name"
            tagline={LIMIT_FIELDS.name.tagline}
            description={LIMIT_FIELDS.name.description}
          />
          <LabelWithHelp
            label="items"
            tagline={LIMIT_FIELDS.impact.tagline}
            description={LIMIT_FIELDS.impact.description}
            align="end"
          />
          <span />
        </div>
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Empty. Click Add to create the first entry, or pick an orphan
            above if items already reference a name you haven't declared
            yet.
          </div>
        ) : (
          entries.map((e, i) => {
            const count = impact[e.name] ?? 0;
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_90px_32px] items-center gap-2"
              >
                <Input
                  value={e.name}
                  onChange={(ev) => update(i, { name: ev.target.value })}
                  placeholder={kind === "categories" ? "e.g. weapons" : "e.g. shelves"}
                  className="h-8 font-mono"
                />
                <div className="text-right">
                  <ImpactBadge
                    count={count}
                    onClick={
                      count > 0 && e.name.trim() !== ""
                        ? () => onDrillToItems(e.name.trim())
                        : undefined
                    }
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(i)}
                  disabled={count > 0}
                  title={
                    count > 0
                      ? `Cannot remove — ${count} item${count === 1 ? "" : "s"} still reference this name. Clear their references first.`
                      : "Remove entry"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FlagListEditor({
  kind,
  entries,
  impact,
  orphans,
  onChange,
  onDrillToItems,
}: {
  kind: Extract<ListKind, "usageflags" | "valueflags">;
  entries: LimitFlag[];
  impact: Record<string, number>;
  orphans: string[];
  onChange: (next: LimitFlag[]) => void;
  onDrillToItems: (name: string) => void;
}) {
  const label =
    kind === "usageflags" ? "Usage flags" : "Value flags (tiers)";
  const hint =
    kind === "usageflags"
      ? "Location zones. Items carry these in <usage name='…'/>. Max 4 per item in vanilla."
      : "Loot tiers. Items carry these in <value name='…'/>. Tier-gated against building coverage.";
  const namePlaceholder =
    kind === "usageflags" ? "e.g. Military" : "e.g. Tier3";

  const nextValue = (): number => {
    const used = new Set(
      entries.filter((e) => e.value != null).map((e) => e.value as number),
    );
    // Prefer powers of two for the bitmask convention.
    let v = 1;
    while (used.has(v)) v <<= 1;
    return v;
  };

  const addAt = (name: string) =>
    onChange(
      [...entries, { name: name.trim(), value: nextValue() }].filter(
        (e) => e.name,
      ),
    );
  const update = (i: number, patch: Partial<LimitFlag>) =>
    onChange(entries.map((e, ii) => (ii === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(entries.filter((_, ii) => ii !== i));

  return (
    <div className="space-y-3">
      <ListHeader
        label={label}
        hint={hint}
        count={entries.length}
        onAdd={() => addAt("")}
      />
      <OrphanWarning kind={kind} orphans={orphans} onAddOrphan={addAt} />

      <div className="space-y-1">
        <div className="grid grid-cols-[1fr_120px_90px_32px] gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <LabelWithHelp
            label="name"
            tagline={LIMIT_FIELDS.name.tagline}
            description={LIMIT_FIELDS.name.description}
          />
          <LabelWithHelp
            label="bitmask"
            tagline={LIMIT_FIELDS.value.tagline}
            description={LIMIT_FIELDS.value.description}
          />
          <LabelWithHelp
            label="items"
            tagline={LIMIT_FIELDS.impact.tagline}
            description={LIMIT_FIELDS.impact.description}
            align="end"
          />
          <span />
        </div>
        {entries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Empty. Click Add to create the first flag.
          </div>
        ) : (
          entries.map((e, i) => {
            const count = impact[e.name] ?? 0;
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_120px_90px_32px] items-center gap-2"
              >
                <Input
                  value={e.name}
                  onChange={(ev) => update(i, { name: ev.target.value })}
                  placeholder={namePlaceholder}
                  className="h-8 font-mono"
                />
                <Input
                  type="number"
                  value={e.value ?? ""}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    update(i, {
                      value: v === "" ? null : Number(v) || 0,
                    });
                  }}
                  placeholder="(auto)"
                  className="h-8 tabular-nums"
                />
                <div className="text-right">
                  <ImpactBadge
                    count={count}
                    onClick={
                      count > 0 && e.name.trim() !== ""
                        ? () => onDrillToItems(e.name.trim())
                        : undefined
                    }
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(i)}
                  disabled={count > 0}
                  title={
                    count > 0
                      ? `Cannot remove — ${count} item${count === 1 ? "" : "s"} still reference this name. Clear their references first.`
                      : "Remove entry"
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function ImpactBadge({
  count,
  onClick,
}: {
  count: number;
  onClick?: () => void;
}) {
  if (count === 0) {
    return (
      <Badge
        variant="outline"
        className="h-5 px-1.5 text-[10px] text-muted-foreground"
        title="No items reference this entry"
      >
        0
      </Badge>
    );
  }
  if (!onClick) {
    return (
      <Badge
        variant="outline"
        className="h-5 border-primary/40 px-1.5 text-[10px] text-primary"
        title={`${count} item${count === 1 ? "" : "s"} reference this entry`}
      >
        {count}
      </Badge>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-5 items-center rounded-md border border-primary/40 bg-primary/5 px-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`View the ${count} item${count === 1 ? "" : "s"} referencing this — opens the Items page filtered by this name`}
    >
      {count} →
    </button>
  );
}

function LabelWithHelp({
  label,
  tagline,
  description,
  align,
}: {
  label: string;
  tagline?: string;
  description?: string;
  align?: "end";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        align === "end" && "justify-end",
      )}
    >
      <Label className="text-[10px] uppercase">{label}</Label>
      {description ? (
        <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
      ) : null}
    </div>
  );
}
