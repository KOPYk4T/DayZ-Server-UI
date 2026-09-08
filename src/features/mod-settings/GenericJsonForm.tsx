import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TokenInput } from "@/components/TokenInput";
import { cn } from "@/lib/utils";

interface Props {
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

/**
 * Infer a form from a JSON object. Primitives and string arrays are
 * editable; nested objects collapse; arrays of objects stay in Raw.
 */
export function GenericJsonForm({ data, onChange }: Props) {
  return (
    <div className="space-y-3">
      {Object.keys(data).length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Empty object.</p>
      ) : (
        Object.entries(data).map(([key, value]) => (
          <Field
            key={key}
            path={key}
            label={key}
            value={value}
            depth={0}
            onChange={(next) => onChange({ ...data, [key]: next })}
          />
        ))
      )}
    </div>
  );
}

function Field({
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

  if (typeof value === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          id={id}
          checked={value}
          onCheckedChange={(v) => onChange(v === true)}
        />
        <Label htmlFor={id} className="cursor-pointer font-mono text-xs">
          {label}
        </Label>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="font-mono text-xs">
          {label}
        </Label>
        <Input
          id={id}
          type="number"
          step="any"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isNaN(n) ? 0 : n);
          }}
          className="h-8 font-mono text-xs"
        />
      </div>
    );
  }

  if (typeof value === "string") {
    return (
      <div className="space-y-1">
        <Label htmlFor={id} className="font-mono text-xs">
          {label}
        </Label>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 font-mono text-xs"
        />
      </div>
    );
  }

  if (value === null) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono">{label}</span>
        <span className="text-muted-foreground">null — edit in Raw</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    const allStrings = value.every((x) => typeof x === "string");
    if (allStrings) {
      return (
        <div className="space-y-1">
          <Label className="font-mono text-xs">{label}</Label>
          <TokenInput
            value={value as string[]}
            onChange={(next) => onChange(next)}
          />
        </div>
      );
    }
    return (
      <p className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-[11px] text-muted-foreground">
        <span className="font-mono text-foreground">{label}</span>
        {" — "}
        {value.length} {value.length === 1 ? "entry" : "entries"}. Edit in Raw.
      </p>
    );
  }

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (depth >= 4) {
      return (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-mono text-foreground">{label}</span> is nested
          deeper — edit in Raw.
        </p>
      );
    }
    return (
      <details
        open={depth < 2}
        className={cn(
          "rounded-md border border-border/50 bg-card/30",
          depth > 0 && "ml-1",
        )}
      >
        <summary className="cursor-pointer px-2 py-1.5 font-mono text-xs text-foreground">
          {label}
          <span className="ml-2 font-sans text-[10px] text-muted-foreground">
            {keys.length} {keys.length === 1 ? "field" : "fields"}
          </span>
        </summary>
        <div className="space-y-2 border-t border-border/40 px-2 py-2">
          {keys.map((k) => (
            <Field
              key={k}
              path={`${path}.${k}`}
              label={k}
              value={obj[k]}
              depth={depth + 1}
              onChange={(next) => onChange({ ...obj, [k]: next })}
            />
          ))}
        </div>
      </details>
    );
  }

  return (
    <p className="text-[11px] text-muted-foreground">
      <span className="font-mono text-foreground">{label}</span> — unsupported
      type, edit in Raw.
    </p>
  );
}
