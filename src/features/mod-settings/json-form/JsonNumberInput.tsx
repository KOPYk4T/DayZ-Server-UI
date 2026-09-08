import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function stepFor(value: number): number {
  return Number.isInteger(value) ? 1 : 0.1;
}

function nudge(value: number, dir: -1 | 1): number {
  const step = stepFor(value);
  const next = value + dir * step;
  if (Number.isInteger(value) && Number.isInteger(step)) return next;
  return Math.round(next * 1000) / 1000;
}

interface Props {
  id?: string;
  value: number;
  onChange: (next: number) => void;
}

/** Compact stepper. Native spin buttons stay hidden. */
export function JsonNumberInput({ id, value, onChange }: Props) {
  const n = Number.isFinite(value) ? value : 0;

  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-md border border-border bg-background">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className="h-full w-7 shrink-0 rounded-none text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(nudge(n, -1))}
        aria-label="Decrease"
      >
        <Minus className="h-3 w-3" />
      </Button>
      <Input
        id={id}
        type="number"
        step={stepFor(n)}
        value={n}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          onChange(Number.isNaN(parsed) ? 0 : parsed);
        }}
        className="h-full w-14 rounded-none border-0 bg-transparent px-1 text-center font-mono text-xs tabular-nums shadow-none [appearance:textfield] dark:bg-transparent focus-visible:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        tabIndex={-1}
        className="h-full w-7 shrink-0 rounded-none text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange(nudge(n, 1))}
        aria-label="Increase"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
