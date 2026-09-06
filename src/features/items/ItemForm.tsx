import { forwardRef, useEffect, type InputHTMLAttributes } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { InfoTooltip } from "@/components/InfoTooltip";
import { TokenInput } from "@/components/TokenInput";
import type { ItemType } from "@/types/ipc";

import { FIELDS, FLAGS, valueHint } from "./glossary";

const schema = z.object({
  name: z.string().min(1, "classname is required"),
  nominal: z.coerce.number().int().min(0),
  min: z.coerce.number().int().min(0),
  lifetime: z.coerce.number().int().min(0),
  restock: z.coerce.number().int().min(0),
  quantmin: z.coerce.number().int().min(-1).max(100),
  quantmax: z.coerce.number().int().min(-1).max(100),
  cost: z.coerce.number().int().min(0),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  usage: z.array(z.string()),
  value: z.array(z.string()),
  flagCountInCargo: z.boolean(),
  flagCountInHoarder: z.boolean(),
  flagCountInMap: z.boolean(),
  flagCountInPlayer: z.boolean(),
  flagCrafted: z.boolean(),
  flagDeloot: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const ANY = "__none__";

export interface ItemFormProps {
  value: ItemType;
  onChange: (next: ItemType) => void;
  categories: string[];
  usages: string[];
  values: string[];
  tags: string[];
  classnameLocked?: boolean;
}

export function ItemForm({
  value,
  onChange,
  categories,
  usages,
  values,
  tags,
  classnameLocked,
}: ItemFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: fromItem(value),
    mode: "onChange",
  });

  // Keep the form in sync when a different item is selected.
  useEffect(() => {
    form.reset(fromItem(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.name]);

  // Push validated changes back up on every field change.
  useEffect(() => {
    const sub = form.watch((values) => {
      const parsed = schema.safeParse(values);
      if (!parsed.success) return;
      onChange(mergeIntoItem(value, parsed.data));
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, form]);

  const category = form.watch("category");
  const tagsVal = form.watch("tags");
  const usageVal = form.watch("usage");
  const valueVal = form.watch("value");

  const isStackable = form.watch("quantmin") >= 0 || form.watch("quantmax") >= 0;

  return (
    <form className="space-y-5">
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Identity
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <LabelWithHelp
              htmlFor="name"
              label="Classname"
              tagline={FIELDS.name.tagline}
              description={FIELDS.name.description}
            />
            <Input
              id="name"
              {...form.register("name")}
              disabled={classnameLocked}
              className="font-mono"
            />
            {form.formState.errors.name ? (
              <p className="text-xs text-severity-error">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="col-span-2 space-y-1.5">
            <LabelWithHelp
              label="Category"
              tagline={FIELDS.category.tagline}
              description={valueHint(FIELDS.category, categories)}
            />
            <Select
              value={category ?? ANY}
              onValueChange={(v) =>
                form.setValue("category", v === ANY ? null : v, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="no category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>(no category)</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Spawn behavior
        </h4>
        <div className="grid grid-cols-4 gap-3">
          <NumberField
            label="nominal"
            tagline={FIELDS.nominal.tagline}
            description={FIELDS.nominal.description}
            {...form.register("nominal")}
          />
          <NumberField
            label="min"
            tagline={FIELDS.min.tagline}
            description={FIELDS.min.description}
            {...form.register("min")}
          />
          <NumberField
            label="lifetime (s)"
            tagline={FIELDS.lifetime.tagline}
            description={FIELDS.lifetime.description}
            {...form.register("lifetime")}
          />
          <NumberField
            label="restock (s)"
            tagline={FIELDS.restock.tagline}
            description={FIELDS.restock.description}
            {...form.register("restock")}
          />
          <NumberField
            label="cost"
            tagline={FIELDS.cost.tagline}
            description={FIELDS.cost.description}
            {...form.register("cost")}
          />
          <NumberField
            label="quantmin"
            tagline={FIELDS.quantmin.tagline}
            description={FIELDS.quantmin.description}
            hint="−1 = not stackable"
            {...form.register("quantmin")}
          />
          <NumberField
            label="quantmax"
            tagline={FIELDS.quantmax.tagline}
            description={FIELDS.quantmax.description}
            {...form.register("quantmax")}
          />
          <div className="col-span-1 flex items-end text-[10px] text-muted-foreground">
            {isStackable ? "stackable" : "not stackable"}
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Locations (usage / value / tags)
        </h4>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <LabelWithHelp
              label="Usage"
              tagline={FIELDS.usage.tagline}
              description={valueHint(FIELDS.usage, usages)}
            />
            <TokenInput
              value={usageVal}
              onChange={(next) =>
                form.setValue("usage", next, { shouldDirty: true })
              }
              suggestions={usages}
              placeholder="Military, Police, …"
              max={4}
            />
            {usageVal.length > 4 ? (
              <p className="text-xs text-severity-warning">
                Vanilla CE caps at 4 usage tags.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <LabelWithHelp
              label="Value (tier)"
              tagline={FIELDS.value.tagline}
              description={valueHint(FIELDS.value, values)}
            />
            <TokenInput
              value={valueVal}
              onChange={(next) =>
                form.setValue("value", next, { shouldDirty: true })
              }
              suggestions={values}
              placeholder="Tier1, Tier2, …"
            />
          </div>
          <div className="space-y-1.5">
            <LabelWithHelp
              label="Tags"
              tagline={FIELDS.tag.tagline}
              description={valueHint(FIELDS.tag, tags)}
            />
            <TokenInput
              value={tagsVal}
              onChange={(next) =>
                form.setValue("tags", next, { shouldDirty: true })
              }
              suggestions={tags}
              placeholder="shelves, floor, …"
            />
          </div>
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Flags
          <InfoTooltip tagline="CE counting flags" className="ml-1.5 align-middle">
            Flags tell the Central Economy which instances of this item to
            count toward the nominal target. Hover each flag for its meaning.
            Typical values on the right of each row are the vanilla defaults.
          </InfoTooltip>
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <FlagToggle
            field="flagCountInCargo"
            flagKey="count_in_cargo"
            value={form.watch("flagCountInCargo")}
            onChange={(v) => form.setValue("flagCountInCargo", v, { shouldDirty: true })}
          />
          <FlagToggle
            field="flagCountInHoarder"
            flagKey="count_in_hoarder"
            value={form.watch("flagCountInHoarder")}
            onChange={(v) => form.setValue("flagCountInHoarder", v, { shouldDirty: true })}
          />
          <FlagToggle
            field="flagCountInMap"
            flagKey="count_in_map"
            value={form.watch("flagCountInMap")}
            onChange={(v) => form.setValue("flagCountInMap", v, { shouldDirty: true })}
          />
          <FlagToggle
            field="flagCountInPlayer"
            flagKey="count_in_player"
            value={form.watch("flagCountInPlayer")}
            onChange={(v) => form.setValue("flagCountInPlayer", v, { shouldDirty: true })}
          />
          <FlagToggle
            field="flagCrafted"
            flagKey="crafted"
            value={form.watch("flagCrafted")}
            onChange={(v) => form.setValue("flagCrafted", v, { shouldDirty: true })}
          />
          <FlagToggle
            field="flagDeloot"
            flagKey="deloot"
            value={form.watch("flagDeloot")}
            onChange={(v) => form.setValue("flagDeloot", v, { shouldDirty: true })}
          />
        </div>
      </section>
    </form>
  );
}

function LabelWithHelp({
  htmlFor,
  label,
  tagline,
  description,
}: {
  htmlFor?: string;
  label: string;
  tagline?: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs">
        {label}
      </Label>
      <InfoTooltip tagline={tagline} side="top">
        {description}
      </InfoTooltip>
    </div>
  );
}

interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
  tagline?: string;
  description?: string;
}

const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  function NumberField({ label, hint, tagline, description, ...rest }, ref) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs">{label}</Label>
          {description ? (
            <InfoTooltip tagline={tagline}>{description}</InfoTooltip>
          ) : null}
        </div>
        <Input ref={ref} type="number" className="tabular-nums" {...rest} />
        {hint ? (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    );
  },
);

function FlagToggle({
  field,
  flagKey,
  value,
  onChange,
}: {
  field: string;
  flagKey: import("./glossary").FlagDef["key"];
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const def = FLAGS.find((f) => f.key === flagKey);
  return (
    <label
      className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5"
      data-field={field}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11px]">{flagKey}</span>
        {def ? (
          <InfoTooltip tagline={`${def.short} (typical: ${def.typicalValue})`}>
            {def.description}
          </InfoTooltip>
        ) : null}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

function fromItem(it: ItemType): FormValues {
  return {
    name: it.name,
    nominal: it.nominal,
    min: it.min,
    lifetime: it.lifetime,
    restock: it.restock,
    quantmin: it.quantmin,
    quantmax: it.quantmax,
    cost: it.cost,
    category: it.category ?? null,
    tags: it.tags,
    usage: it.usage,
    value: it.value,
    flagCountInCargo: it.flags.count_in_cargo === 1,
    flagCountInHoarder: it.flags.count_in_hoarder === 1,
    flagCountInMap: it.flags.count_in_map === 1,
    flagCountInPlayer: it.flags.count_in_player === 1,
    flagCrafted: it.flags.crafted === 1,
    flagDeloot: it.flags.deloot === 1,
  };
}

function mergeIntoItem(base: ItemType, values: FormValues): ItemType {
  return {
    ...base,
    name: values.name,
    nominal: values.nominal,
    min: values.min,
    lifetime: values.lifetime,
    restock: values.restock,
    quantmin: values.quantmin,
    quantmax: values.quantmax,
    cost: values.cost,
    category: values.category,
    tags: values.tags,
    usage: values.usage,
    value: values.value,
    flags: {
      count_in_cargo: values.flagCountInCargo ? 1 : 0,
      count_in_hoarder: values.flagCountInHoarder ? 1 : 0,
      count_in_map: values.flagCountInMap ? 1 : 0,
      count_in_player: values.flagCountInPlayer ? 1 : 0,
      crafted: values.flagCrafted ? 1 : 0,
      deloot: values.flagDeloot ? 1 : 0,
    },
  };
}
