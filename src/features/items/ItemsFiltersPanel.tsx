import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InfoTooltip } from "@/components/InfoTooltip";

import { DEFAULT_FILTERS, type ItemFilters } from "./filters";
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

const ANY = "__any__";

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
    <aside className="flex w-64 shrink-0 flex-col gap-4 border-r border-border/60 bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Filters
        </Label>
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

      <FilterSelect
        label="Category"
        tagline={FIELDS.category.tagline}
        description={valueHint(FIELDS.category, categories)}
        value={value.category}
        onChange={(v) => set("category", v)}
        options={categories}
      />
      <FilterSelect
        label="Usage"
        tagline={FIELDS.usage.tagline}
        description={valueHint(FIELDS.usage, usages)}
        value={value.usage}
        onChange={(v) => set("usage", v)}
        options={usages}
      />
      <FilterSelect
        label="Value (tier)"
        tagline={FIELDS.value.tagline}
        description={valueHint(FIELDS.value, values)}
        value={value.value}
        onChange={(v) => set("value", v)}
        options={values}
      />
      <FilterSelect
        label="Tag"
        tagline={FIELDS.tag.tagline}
        description={valueHint(FIELDS.tag, tags)}
        value={value.tag}
        onChange={(v) => set("tag", v)}
        options={tags}
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

function FilterSelect({
  label,
  tagline,
  description,
  value,
  onChange,
  options,
}: {
  label: string;
  tagline?: string;
  description?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {description ? (
          <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
        ) : null}
      </div>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? null : v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={`any ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>any</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
