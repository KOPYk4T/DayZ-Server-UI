import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/InfoTooltip";
import { cn } from "@/lib/utils";

import {
  DEFAULT_FILTERS,
  toggleFlag,
  type FlagMatch,
  type ItemFilters,
} from "./filters";
import { FIELDS, FILTER_TOOLTIPS, valueHint } from "./glossary";

interface Props {
  value: ItemFilters;
  onChange: (next: ItemFilters) => void;
  categories: string[];
  usages: string[];
  values: string[];
  tags: string[];
  totalCount: number;
  filteredCount: number;
}

export function ItemsFiltersPanel({
  value,
  onChange,
  categories,
  usages,
  values,
  tags,
  totalCount,
  filteredCount,
}: Props) {
  const set = <K extends keyof ItemFilters>(k: K, v: ItemFilters[K]) =>
    onChange({ ...value, [k]: v });

  const setSource = (
    src: keyof ItemFilters["sources"],
    on: boolean,
  ) =>
    onChange({
      ...value,
      sources: { ...value.sources, [src]: on },
    });

  const clear = () => onChange(DEFAULT_FILTERS);

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border/60 bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Filters
          </Label>
          <InfoTooltip>{FILTER_TOOLTIPS.combine}</InfoTooltip>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={clear}
        >
          <X className="mr-1 h-3 w-3" /> reset
        </Button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="items-search" className="text-xs">
            Search
          </Label>
          <InfoTooltip>{FILTER_TOOLTIPS.search}</InfoTooltip>
        </div>
        <Input
          id="items-search"
          placeholder="classname or category"
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">Source</Label>
          <InfoTooltip tagline={FIELDS.source.tagline}>
            {FILTER_TOOLTIPS.source}
          </InfoTooltip>
        </div>
        <div className="flex flex-col gap-1.5">
          {(["vanilla", "mod", "custom"] as const).map((src) => (
            <div key={src} className="flex items-center gap-2">
              <Checkbox
                id={`src-${src}`}
                checked={value.sources[src]}
                onCheckedChange={(v) => setSource(src, v === true)}
              />
              <Label
                htmlFor={`src-${src}`}
                className="flex-1 text-xs font-normal capitalize"
              >
                {src}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <FlagGroup
        label="Category"
        tagline={FIELDS.category.tagline}
        description={valueHint(FIELDS.category, categories)}
        options={categories}
        selected={value.categories}
        onToggle={(name) => set("categories", toggleFlag(value.categories, name))}
      />
      <FlagGroup
        label="Usage"
        tagline={FIELDS.usage.tagline}
        description={valueHint(FIELDS.usage, usages)}
        options={usages}
        selected={value.usages}
        onToggle={(name) => set("usages", toggleFlag(value.usages, name))}
        match={value.usageMatch}
        onMatchChange={(m) => set("usageMatch", m)}
      />
      <FlagGroup
        label="Value (tier)"
        tagline={FIELDS.value.tagline}
        description={valueHint(FIELDS.value, values)}
        options={values}
        selected={value.values}
        onToggle={(name) => set("values", toggleFlag(value.values, name))}
        match={value.valueMatch}
        onMatchChange={(m) => set("valueMatch", m)}
      />
      {value.usages.length > 0 && value.values.length > 0 ? (
        <p className="rounded-md border border-border/50 bg-background/50 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
          Usage + tier are both set — items must carry{" "}
          <span className="font-medium text-foreground">both</span>,
          like CE at a loot point.
        </p>
      ) : null}

      <FlagGroup
        label="Tag"
        tagline={FIELDS.tag.tagline}
        description={valueHint(FIELDS.tag, tags)}
        options={tags}
        selected={value.tags}
        onToggle={(name) => set("tags", toggleFlag(value.tags, name))}
        match={value.tagMatch}
        onMatchChange={(m) => set("tagMatch", m)}
      />

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">Stackable</Label>
          <InfoTooltip>{FILTER_TOOLTIPS.stackable}</InfoTooltip>
        </div>
        <Tabs
          value={value.showStackables}
          onValueChange={(v) =>
            set("showStackables", v as ItemFilters["showStackables"])
          }
        >
          <TabsList className="h-7 w-full">
            <TabsTrigger value="any" className="text-[11px]">Any</TabsTrigger>
            <TabsTrigger value="only" className="text-[11px]">Only</TabsTrigger>
            <TabsTrigger value="exclude" className="text-[11px]">None</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="zero-nominal"
          checked={value.showZeroNominal}
          onCheckedChange={(v) => set("showZeroNominal", v === true)}
        />
        <Label htmlFor="zero-nominal" className="flex flex-1 items-center gap-1.5 text-xs font-normal">
          Include nominal = 0
          <InfoTooltip>{FILTER_TOOLTIPS.includeZeroNominal}</InfoTooltip>
        </Label>
      </div>

      <div className="mt-auto">
        <Badge variant="outline" className="w-full justify-center py-1">
          {filteredCount} / {totalCount}
        </Badge>
      </div>
    </aside>
  );
}

function FlagGroup({
  label,
  tagline,
  description,
  options,
  selected,
  onToggle,
  match,
  onMatchChange,
}: {
  label: string;
  tagline?: string;
  description?: string;
  options: string[];
  selected: string[];
  onToggle: (name: string) => void;
  match?: FlagMatch;
  onMatchChange?: (next: FlagMatch) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">{label}</Label>
          {description ? (
            <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
          ) : null}
        </div>
        {match && onMatchChange && selected.length >= 2 ? (
          <Tabs
            value={match}
            onValueChange={(v) => onMatchChange(v as FlagMatch)}
          >
            <TabsList className="h-6">
              <TabsTrigger
                value="any"
                className="px-1.5 text-[10px]"
                title={FILTER_TOOLTIPS.flagAny}
              >
                any
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="px-1.5 text-[10px]"
                title={FILTER_TOOLTIPS.flagAll}
              >
                all
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
      </div>
      {options.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">none in use</p>
      ) : (
        <div className="flex max-h-36 flex-wrap gap-1 overflow-y-auto">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => onToggle(o)}
                aria-pressed={on}
                className={cn(
                  "rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-5 transition-colors",
                  on
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
