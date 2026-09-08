import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function JsonFieldRow({
  id,
  label,
  children,
}: {
  id?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(6.5rem,36%)_minmax(0,1fr)] items-center gap-x-3 rounded-sm px-1 py-2 transition-colors duration-150 hover:bg-muted/50">
      {id ? (
        <Label
          htmlFor={id}
          className="min-w-0 cursor-pointer truncate font-mono text-xs font-medium text-foreground"
          title={label}
        >
          {label}
        </Label>
      ) : (
        <span
          className="min-w-0 truncate font-mono text-xs font-medium text-foreground"
          title={label}
        >
          {label}
        </span>
      )}
      <div className="flex min-w-0 items-center justify-end gap-1.5">
        {children}
      </div>
    </div>
  );
}

export function JsonGhostInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className={cn(
        "h-7 min-w-0 overflow-hidden text-ellipsis rounded-none border-0 border-b border-border/40 bg-transparent px-1 shadow-none",
        "dark:bg-transparent",
        "focus-visible:border-foreground/40 focus-visible:ring-0",
        "font-mono text-xs text-foreground",
        className,
      )}
    />
  );
}
