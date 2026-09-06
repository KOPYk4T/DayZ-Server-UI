import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  /** Hard cap — typical use: vanilla usage-tag limit is 4. */
  max?: number;
}

export function TokenInput({
  value,
  onChange,
  suggestions = [],
  placeholder,
  className,
  max,
}: Props) {
  const [draft, setDraft] = useState("");

  const atLimit = max !== undefined && value.length >= max;
  const availableSuggestions = suggestions.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase()),
  );

  const add = (token: string) => {
    const t = token.trim();
    if (!t) return;
    if (value.includes(t)) return;
    if (atLimit) return;
    onChange([...value, t]);
    setDraft("");
  };

  const remove = (token: string) => {
    onChange(value.filter((t) => t !== token));
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        {value.map((t) => (
          <Badge
            key={t}
            variant="secondary"
            className="gap-1 px-1.5 py-0 text-[11px]"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="opacity-60 hover:opacity-100"
              aria-label={`remove ${t}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
        <Input
          className="h-5 min-w-[80px] flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
          placeholder={atLimit ? `max ${max}` : placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              remove(value[value.length - 1]);
            }
          }}
          disabled={atLimit}
        />
      </div>
      {draft && availableSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {availableSuggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
