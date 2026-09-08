import { Switch } from "@/components/ui/switch";
import { TokenInput } from "@/components/TokenInput";

import { JsonEntryTabs } from "./JsonEntryTabs";
import { JsonFieldRow, JsonGhostInput } from "./JsonFieldRow";
import { JsonNumberInput } from "./JsonNumberInput";
import { JsonSection } from "./JsonSection";
import {
  ARRAY_EXPAND_CAP,
  asBoolString,
  countLabel,
  prettyKey,
} from "./helpers";

interface Props {
  data: Record<string, unknown>;
  path: string;
  depth: number;
  onChange: (next: Record<string, unknown>) => void;
}

export function JsonObjectGrid({ data, path, depth, onChange }: Props) {
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return <p className="type-hint italic">Empty object.</p>;
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-x-10 gap-y-0 md:grid-cols-2">
      {keys.map((key) => (
        <JsonField
          key={key}
          path={path ? `${path}.${key}` : key}
          label={key}
          value={data[key]}
          depth={depth}
          onChange={(next) => onChange({ ...data, [key]: next })}
        />
      ))}
    </div>
  );
}

function JsonField({
  path,
  label,
  value,
  depth,
  onChange,
}: {
  path: string;
  label: string;
  value: unknown;
  depth: number;
  onChange: (next: unknown) => void;
}) {
  const id = `pj-${path}`;
  const boolString = asBoolString(value);

  if (typeof value === "boolean" || boolString) {
    const checked =
      typeof value === "boolean" ? value : boolString === "true";
    return (
      <JsonFieldRow id={id} label={label}>
        <Switch
          id={id}
          size="sm"
          checked={checked}
          onCheckedChange={(v) => {
            const on = v === true;
            onChange(typeof value === "boolean" ? on : on ? "true" : "false");
          }}
        />
        <span className="w-8 font-mono text-[10px] text-muted-foreground/70">
          {checked ? "true" : "false"}
        </span>
      </JsonFieldRow>
    );
  }

  if (typeof value === "number") {
    return (
      <JsonFieldRow id={id} label={label}>
        <JsonNumberInput
          id={id}
          value={Number.isFinite(value) ? value : 0}
          onChange={onChange}
        />
      </JsonFieldRow>
    );
  }

  if (typeof value === "string") {
    return (
      <JsonFieldRow id={id} label={label}>
        <JsonGhostInput
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          title={value}
          className="w-full min-w-0"
        />
      </JsonFieldRow>
    );
  }

  if (value === null) {
    return (
      <JsonFieldRow label={label}>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          null
        </span>
      </JsonFieldRow>
    );
  }

  if (Array.isArray(value)) {
    return (
      <JsonArrayField
        path={path}
        label={label}
        value={value}
        depth={depth}
        onChange={onChange}
      />
    );
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    return (
      <JsonSection
        title={prettyKey(label)}
        countLabel={countLabel("object", keys.length)}
        hint={depth >= 4 ? "edit in Raw" : undefined}
        defaultOpen={depth < 2}
      >
        {depth >= 4 ? null : (
          <JsonObjectGrid
            data={obj}
            path={path}
            depth={depth + 1}
            onChange={onChange}
          />
        )}
      </JsonSection>
    );
  }

  return (
    <JsonFieldRow label={label}>
      <span className="type-hint">Raw</span>
    </JsonFieldRow>
  );
}

function JsonArrayField({
  path,
  label,
  value,
  depth,
  onChange,
}: {
  path: string;
  label: string;
  value: unknown[];
  depth: number;
  onChange: (next: unknown) => void;
}) {
  const title = prettyKey(label);
  const allStrings = value.every((x) => typeof x === "string");
  if (allStrings) {
    return (
      <JsonSection
        title={title}
        countLabel={countLabel("array", value.length)}
        defaultOpen={depth < 2}
      >
        <TokenInput
          value={value as string[]}
          onChange={(next) => onChange(next)}
        />
      </JsonSection>
    );
  }

  const objects = value.filter(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === "object" && !Array.isArray(x),
  );
  const expandable =
    value.length > 0 &&
    objects.length === value.length &&
    value.length <= ARRAY_EXPAND_CAP &&
    depth < 4;

  if (!expandable) {
    return (
      <JsonSection
        title={title}
        countLabel={countLabel("array", value.length)}
        hint="edit in Raw"
        defaultOpen={false}
      />
    );
  }

  return (
    <JsonSection
      title={title}
      countLabel={countLabel("array", objects.length)}
      defaultOpen={depth < 2}
    >
      {objects.length === 1 ? (
        <JsonObjectGrid
          data={objects[0]}
          path={`${path}[0]`}
          depth={depth + 1}
          onChange={(next) =>
            onChange(value.map((entry, j) => (j === 0 ? next : entry)))
          }
        />
      ) : (
        <JsonEntryTabs
          path={path}
          items={objects}
          depth={depth + 1}
          source={value}
          onChange={onChange}
        />
      )}
    </JsonSection>
  );
}
