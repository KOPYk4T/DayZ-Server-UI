import { useMemo } from "react";

import { cn } from "@/lib/utils";

import type { RecordWithOrigin } from "./origin";
import {
  basenameOf,
  originId,
  originTint,
  parseOriginId,
} from "./origin";

interface Props {
  record: RecordWithOrigin;
  /** When set, clicking the chip filters the parent list to this
   *  origin. Receives the origin id. Optional — chips render as
   *  static badges if no handler is provided (e.g. inside detail
   *  drawers where filtering doesn't apply). */
  onClick?: (id: string) => void;
  /** Pass `false` to hide the file basename in the tooltip — useful
   *  in dense rows where the mod name is enough. Defaults to true. */
  showFileInTooltip?: boolean;
  className?: string;
}

/**
 * Per-row origin chip. Renders the mod folder name (or `vanilla` /
 * `custom`) as a small coloured badge. Hover shows a tooltip with
 * the exact XML file the record was parsed from. Clicking (when
 * `onClick` is wired) filters the parent list to that origin.
 *
 * Colour comes from `originTint` — same hash → same colour across
 * the chip, the filter row's chips, and any future linter UI that
 * highlights cross-mod conflicts.
 */
export function OriginChip({
  record,
  onClick,
  showFileInTooltip = true,
  className,
}: Props) {
  const { id, label, tint, tooltip } = useMemo(() => {
    const id = originId(record);
    const origin = parseOriginId(id);
    const tint = originTint(id);
    const tooltip = showFileInTooltip
      ? `${origin.label} · ${basenameOf(record.file)}\n${record.file}`
      : origin.label;
    return { id, label: origin.label, tint, tooltip };
  }, [record, showFileInTooltip]);

  const interactive = !!onClick;

  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onClick!(id);
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onClick!(id);
              }
            }
          : undefined
      }
      title={tooltip}
      className={cn(
        "inline-flex h-5 max-w-[140px] items-center gap-1 rounded border px-1.5 text-[10px] font-medium uppercase tracking-wider",
        interactive && "cursor-pointer hover:brightness-110",
        className,
      )}
      style={{
        backgroundColor: tint.bg,
        color: tint.fg,
        borderColor: tint.border,
      }}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
