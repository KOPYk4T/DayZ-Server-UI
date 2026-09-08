import { useEffect, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  isWikiMiss,
  peekWikiHit,
  rememberWikiHit,
  rememberWikiMiss,
  wikiFileCandidates,
  wikiThumbUrl,
} from "./resolve";

type Size = "sm" | "md" | "lg";

const THUMB_PX: Record<Size, number> = { sm: 48, md: 96, lg: 220 };
const PREVIEW_PX = 280;

const BOX: Record<Size, string> = {
  sm: "h-5 w-5",
  md: "h-12 w-16",
  lg: "h-24 w-36",
};

interface Props {
  classname: string;
  size?: Size;
  /** Hover popover with a larger thumb. Default on. */
  preview?: boolean;
  /** Only paint if we already resolved a file (dropdowns). */
  cachedOnly?: boolean;
  className?: string;
}

/**
 * Lazy wiki.gg inventory thumb. Renders nothing when the wiki has
 * no file for this classname. Hover scales the chip and opens a
 * larger preview (loaded only then).
 */
export function WikiItemImage({
  classname,
  size = "sm",
  preview = true,
  cachedOnly = false,
  className,
}: Props) {
  const files = wikiFileCandidates(classname);
  const cached = peekWikiHit(classname);
  const [fileIndex, setFileIndex] = useState(() => {
    if (cached) {
      const i = files.indexOf(cached);
      return i >= 0 ? i : 0;
    }
    return 0;
  });
  const [hidden, setHidden] = useState(() => isWikiMiss(classname));
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    setHidden(isWikiMiss(classname));
    const hit = peekWikiHit(classname);
    const nextFiles = wikiFileCandidates(classname);
    const i = hit ? nextFiles.indexOf(hit) : 0;
    setFileIndex(i >= 0 ? i : 0);
    setPreviewOpen(false);
  }, [classname]);

  if (hidden || !classname) return null;
  if (cachedOnly && !cached) return null;

  const file = files[fileIndex];
  if (!file) return null;
  const src = wikiThumbUrl(file, THUMB_PX[size]);

  const img = (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-black/40",
        BOX[size],
        className,
      )}
    >
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(
          "max-h-full max-w-full object-contain transition-transform duration-200 ease-out",
          preview && "group-hover/wiki:scale-110",
        )}
        onLoad={() => rememberWikiHit(classname, file)}
        onError={() => {
          const next = fileIndex + 1;
          if (next < files.length) {
            setFileIndex(next);
            return;
          }
          rememberWikiMiss(classname);
          setHidden(true);
        }}
      />
    </span>
  );

  if (!preview) return img;

  return (
    <Popover open={previewOpen} onOpenChange={setPreviewOpen}>
      <PopoverTrigger asChild>
        <span
          className="group/wiki inline-flex"
          onPointerEnter={() => setPreviewOpen(true)}
          onPointerLeave={() => setPreviewOpen(false)}
        >
          {img}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="center"
        className="w-auto border-border/60 bg-black/90 p-2"
        onPointerEnter={() => setPreviewOpen(true)}
        onPointerLeave={() => setPreviewOpen(false)}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <img
          src={wikiThumbUrl(file, PREVIEW_PX)}
          alt={classname}
          referrerPolicy="no-referrer"
          className="max-h-40 max-w-72 object-contain"
        />
        <p className="mt-1 text-center font-mono text-[10px] text-muted-foreground">
          {classname}
        </p>
      </PopoverContent>
    </Popover>
  );
}
