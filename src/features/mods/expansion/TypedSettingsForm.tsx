import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TokenInput } from "@/components/TokenInput";
import type { FieldSpec, SettingsSchema } from "./schemas";

/**
 * Renders a typed form for one Expansion settings document.
 *
 * `data` is the parsed JSON object. `onChange` is called with an
 * updated object every time the user edits a field. Unknown keys
 * (fields not in the schema) pass through on every update, so the
 * caller can round-trip untouched fields faithfully.
 */
interface Props {
  schema: SettingsSchema;
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function TypedSettingsForm({ schema, data, onChange }: Props) {
  const groups = useMemo(() => groupFields(schema.fields), [schema.fields]);
  const version =
    typeof data.m_Version === "number" ? (data.m_Version as number) : null;
  const versionMismatch =
    schema.expectedVersion != null &&
    version != null &&
    version !== schema.expectedVersion;

  const extraFieldCount = useMemo(() => {
    const known = new Set(schema.fields.map((f) => f.key));
    known.add("m_Version");
    return Object.keys(data).filter((k) => !known.has(k)).length;
  }, [data, schema.fields]);

  const setField = (key: string, value: unknown) => {
    onChange({ ...data, [key]: value });
  };

  return (
    <div className="space-y-4">
      {versionMismatch ? (
        <div className="rounded-md border border-severity-warning/40 bg-severity-warning/10 px-3 py-2 text-[11px]">
          <strong>m_Version mismatch.</strong> This file is at{" "}
          <code>m_Version: {version}</code>, the typed editor was written
          against <code>{schema.expectedVersion}</code>. Known fields
          still work; fields added in newer Expansion builds pass through
          untouched. Use the Raw JSON tab if you need to tweak them.
        </div>
      ) : null}

      {groups.map(({ group, fields }) => (
        <section key={group} className="space-y-3">
          {group !== "" ? (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </h3>
          ) : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={data[field.key]}
                onChange={(v) => setField(field.key, v)}
              />
            ))}
          </div>
        </section>
      ))}

      {extraFieldCount > 0 ? (
        <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          {extraFieldCount} additional field{extraFieldCount === 1 ? "" : "s"}{" "}
          from this file aren't covered by the typed form — likely new in your
          Expansion version or a nested array / object. They're preserved on
          save. Switch to the <strong>Raw JSON</strong> tab to edit them.
        </p>
      ) : null}
    </div>
  );
}

function groupFields(
  fields: FieldSpec[],
): { group: string; fields: FieldSpec[] }[] {
  const order: string[] = [];
  const bucket: Record<string, FieldSpec[]> = {};
  for (const f of fields) {
    const g = f.group ?? "";
    if (!(g in bucket)) {
      order.push(g);
      bucket[g] = [];
    }
    bucket[g].push(f);
  }
  return order.map((g) => ({ group: g, fields: bucket[g] }));
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const id = `expansion-field-${field.key}`;
  const baseClass = "space-y-1.5";
  switch (field.type.kind) {
    case "bool01": {
      const checked = value === 1 || value === true;
      return (
        <div className={baseClass}>
          <div className="flex items-center gap-2">
            <Switch
              id={id}
              checked={checked}
              onCheckedChange={(v) => onChange(v ? 1 : 0)}
            />
            <Label htmlFor={id} className="cursor-pointer">
              {field.label}
            </Label>
          </div>
          {field.description ? (
            <p className="text-[11px] text-muted-foreground">
              {field.description}
            </p>
          ) : null}
        </div>
      );
    }
    case "int":
    case "float": {
      const n =
        typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
      const step =
        field.type.step ?? (field.type.kind === "int" ? 1 : "any");
      return (
        <div className={baseClass}>
          <Label htmlFor={id}>
            {field.label}
            {field.type.unit ? (
              <span className="ml-1 text-[11px] text-muted-foreground">
                ({field.type.unit})
              </span>
            ) : null}
          </Label>
          <Input
            id={id}
            type="number"
            step={step as string | number | undefined}
            min={field.type.min}
            max={field.type.max}
            value={Number.isFinite(n) ? n : 0}
            onChange={(e) => {
              const parsed =
                field.type.kind === "int"
                  ? parseInt(e.target.value, 10)
                  : parseFloat(e.target.value);
              onChange(Number.isNaN(parsed) ? 0 : parsed);
            }}
          />
          {field.description ? (
            <p className="text-[11px] text-muted-foreground">
              {field.description}
            </p>
          ) : null}
        </div>
      );
    }
    case "string": {
      const s = typeof value === "string" ? value : "";
      return (
        <div className={baseClass}>
          <Label htmlFor={id}>{field.label}</Label>
          <Input
            id={id}
            value={s}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.description ? (
            <p className="text-[11px] text-muted-foreground">
              {field.description}
            </p>
          ) : null}
        </div>
      );
    }
    case "stringArray": {
      const arr = Array.isArray(value)
        ? (value.filter((x) => typeof x === "string") as string[])
        : [];
      return (
        <div className={`${baseClass} md:col-span-2`}>
          <Label>{field.label}</Label>
          <TokenInput
            value={arr}
            onChange={(next) => onChange(next)}
            placeholder={field.type.placeholder}
          />
          {field.description ? (
            <p className="text-[11px] text-muted-foreground">
              {field.description}
            </p>
          ) : null}
        </div>
      );
    }
  }
}
