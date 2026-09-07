import { useEffect, useRef, useState } from "react";
import { Circle, useMap, useMapEvents } from "react-leaflet";

import type { MapId } from "@/types/ipc";

import { latLngToDayz, sizeFor } from "./dayzMap";

/** Painter canvas resolution. Independent of the underlying 4096×4096
 *  tier raster — the operator's edits are stored at fine-cell
 *  granularity and only downsampled here for the preview overlay.
 *  Each preview pixel covers RASTER_DIM/PREVIEW_DIM fine cells per
 *  axis = 4×4 = 16 cells (~15 m on Chernarus). That's well below
 *  what an operator can resolve visually and keeps both canvas
 *  redraws and stroke-end commits cheap. */
const PREVIEW_DIM = 1024;
const RASTER_DIM = 4096;
const CELLS_PER_PX = RASTER_DIM / PREVIEW_DIM;

/** Tier index → preview tint. Matches the Rust `tier_color` table so
 *  painted-but-unsaved zones look the same as committed ones. */
const TIER_COLOR: Record<number, [number, number, number]> = {
  0: [34, 197, 94], // Tier1 green
  1: [234, 179, 8], // Tier2 yellow
  2: [249, 115, 22], // Tier3 orange
  3: [220, 38, 38], // Tier4 red
  4: [139, 92, 246], // Unique violet
};

/** Lookup the rgb tint for a tier-bits byte. Bit 0 wins when several
 *  tiers are set so the colour is deterministic; in practice the
 *  painter only emits single-bit values. `overrideRgb` is the usage
 *  brush colour when the parent is painting a usage flag. */
function bitsToRgb(
  bits: number,
  overrideRgb?: [number, number, number],
): [number, number, number] {
  if (overrideRgb && bits !== 0) return overrideRgb;
  for (let i = 0; i < 5; i += 1) {
    if (bits & (1 << i)) return TIER_COLOR[i];
  }
  return [148, 163, 184];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to load CE overlay stamp"));
    img.src = url;
  });
}

export type BrushMode =
  /** Replace the cell's tier bits with the picked tier (single bit). */
  | "set"
  /** Clear the paint target in the cell. Tiers become empty; usage
   *  clears only the selected flag. Preview punches a hole through
   *  the stamped overlay so the map (and other layers) show. */
  | "erase";

export interface PaintEdit {
  row: number;
  col: number;
  bits: number;
}

/** One stroke: previous value per cell (`undefined` = the cell was
 *  not in the draft) and the value the stroke wrote. */
export type PaintStrokeDelta = Map<
  number,
  { prev: number | undefined; next: number }
>;

export interface PaintStampOverlay {
  name: string;
  pngDataUrl: string;
}

interface Props {
  mapId: MapId;
  active: boolean;
  paintTier: number;
  /** When set, non-zero preview cells use this tint (usage paint).
   *  Tiers keep the built-in palette when omitted. */
  previewRgb?: [number, number, number];
  brushRadiusM: number;
  mode: BrushMode;
  /** Mutable map of pending edits keyed by `row * RASTER_DIM + col`.
   *  Stroke commits update this in batch at mouseup, not per pointer
   *  event. */
  editsRef: React.MutableRefObject<Map<number, number>>;
  /** Bumped after each stroke so consumers (the panel's edit count)
   *  re-render. */
  onEditsChanged?: () => void;
  /** Fires after a stroke is committed, with enough data to undo it. */
  onStrokeCommitted?: (delta: PaintStrokeDelta) => void;
  /** Reactive view of `editsRef.current.size`. Used as the redraw
   *  trigger when the parent clears edits externally (after save /
   *  revert / undo). */
  editCount: number;
  /** Fires whenever a stroke commit starts (`true`) and finishes
   *  (`false`). The parent renders an "Applying stroke…" indicator
   *  while a large bbox is being processed. */
  onCommittingChange?: (committing: boolean) => void;
  /** Committed overlays of the current paint target, drawn as the
   *  canvas base so erase can punch a real hole (Leaflet PNGs cannot
   *  be punched). Parent hides the matching ImageOverlays once
   *  `onStampReady(true)` fires. */
  stampOverlays?: PaintStampOverlay[];
  stampOpacity?: number;
  onStampReady?: (ready: boolean) => void;
}

/**
 * Two-canvas painter.
 *
 *   Display canvas — the operator sees this. Committed overlays of
 *     the paint target are stamped as a base; strokes draw on top.
 *     Erase uses destination-out so those stamps (and prior paint)
 *     disappear and the map shows through.
 *
 *   Mask canvas    — hidden 1-bit alpha mask of "what did this
 *     stroke paint". Reset to transparent before each stroke. At
 *     `mouseup` we read its bounding-box pixels back, and every
 *     painted pixel commits the stroke's bits into `editsRef`.
 *
 * The cell-level math only runs ONCE per stroke, at commit time.
 */
export function TierPaintLayer({
  mapId,
  active,
  paintTier,
  previewRgb,
  brushRadiusM,
  mode,
  editsRef,
  onEditsChanged,
  onStrokeCommitted,
  editCount,
  onCommittingChange,
  stampOverlays = [],
  stampOpacity = 0.7,
  onStampReady,
}: Props) {
  const map = useMap();
  const size = sizeFor(mapId);

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  if (displayCanvasRef.current === null) {
    const c = document.createElement("canvas");
    c.width = PREVIEW_DIM;
    c.height = PREVIEW_DIM;
    c.style.position = "absolute";
    c.style.pointerEvents = "none";
    c.style.willChange = "transform";
    displayCanvasRef.current = c;
  }
  if (maskCanvasRef.current === null) {
    const c = document.createElement("canvas");
    c.width = PREVIEW_DIM;
    c.height = PREVIEW_DIM;
    maskCanvasRef.current = c;
  }

  const stampImagesRef = useRef<HTMLImageElement[]>([]);
  const stampOpacityRef = useRef(stampOpacity);
  stampOpacityRef.current = stampOpacity;

  useEffect(() => {
    const canvas = displayCanvasRef.current!;
    const pane = map.getPane("overlayPane");
    if (!pane) return;
    pane.appendChild(canvas);

    const reposition = () => {
      const tl = map.latLngToLayerPoint([size, 0]);
      const br = map.latLngToLayerPoint([0, size]);
      const w = br.x - tl.x;
      const h = br.y - tl.y;
      canvas.style.transform = `translate(${tl.x}px, ${tl.y}px)`;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    reposition();
    map.on("viewreset zoom move", reposition);
    return () => {
      map.off("viewreset zoom move", reposition);
      if (canvas.parentElement === pane) {
        pane.removeChild(canvas);
      }
    };
  }, [map, size]);

  useEffect(() => {
    return () => onStampReady?.(false);
    // Mount/unmount only — the parent resets hide-overlays with this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const worldToPx = (worldX: number, worldZ: number) => ({
    px: (worldX * PREVIEW_DIM) / size,
    py: ((size - worldZ) * PREVIEW_DIM) / size,
  });
  const brushPx = (brushRadiusM * PREVIEW_DIM) / size;

  const drawStamps = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    ctx.globalAlpha = stampOpacityRef.current;
    for (const img of stampImagesRef.current) {
      ctx.drawImage(img, 0, 0, PREVIEW_DIM, PREVIEW_DIM);
    }
    ctx.restore();
  };

  const drawEditCell = (
    ctx: CanvasRenderingContext2D,
    row: number,
    col: number,
    bits: number,
  ) => {
    const scale = PREVIEW_DIM / RASTER_DIM;
    const pixSize = Math.max(1, Math.ceil(scale));
    const py = Math.floor((RASTER_DIM - 1 - row) * scale);
    const px = Math.floor(col * scale);
    if (bits === 0) {
      ctx.clearRect(px, py, pixSize, pixSize);
      return;
    }
    const [r, g, b] = bitsToRgb(bits, previewRgb);
    ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
    ctx.fillRect(px, py, pixSize, pixSize);
  };

  const fullRepaint = () => {
    const canvas = displayCanvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW_DIM, PREVIEW_DIM);
    drawStamps(ctx);
    editsRef.current.forEach((bits, key) => {
      const row = Math.floor(key / RASTER_DIM);
      const col = key % RASTER_DIM;
      drawEditCell(ctx, row, col, bits);
    });
  };

  const stampKey = stampOverlays.map((o) => o.pngDataUrl).join("\0");
  useEffect(() => {
    let cancelled = false;
    if (stampOverlays.length === 0) {
      stampImagesRef.current = [];
      fullRepaint();
      onStampReady?.(true);
      return () => {
        cancelled = true;
      };
    }
    void Promise.all(stampOverlays.map((o) => loadImage(o.pngDataUrl)))
      .then((imgs) => {
        if (cancelled) return;
        stampImagesRef.current = imgs;
        fullRepaint();
        onStampReady?.(true);
      })
      .catch(() => {
        if (!cancelled) onStampReady?.(false);
      });
    return () => {
      cancelled = true;
    };
    // fullRepaint reads refs; stampKey stands in for the overlay list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stampKey, stampOpacity]);

  useEffect(() => {
    fullRepaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCount]);

  const drawingRef = useRef(false);
  const lastPaintPosRef = useRef<{ x: number; z: number } | null>(null);
  const strokeBitsRef = useRef<number>(0);
  const strokeEraseRef = useRef(false);
  const strokeBBoxRef = useRef<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null>(null);

  const expandBBox = (px: number, py: number) => {
    const r = Math.ceil(brushPx) + 1;
    const bb = strokeBBoxRef.current;
    if (!bb) {
      strokeBBoxRef.current = {
        minX: px - r,
        minY: py - r,
        maxX: px + r,
        maxY: py + r,
      };
    } else {
      if (px - r < bb.minX) bb.minX = px - r;
      if (py - r < bb.minY) bb.minY = py - r;
      if (px + r > bb.maxX) bb.maxX = px + r;
      if (py + r > bb.maxY) bb.maxY = py + r;
    }
  };

  const applyBrushStyle = (
    ctx: CanvasRenderingContext2D,
    kind: "fill" | "stroke",
  ) => {
    if (strokeEraseRef.current) {
      ctx.globalCompositeOperation = "destination-out";
      if (kind === "fill") ctx.fillStyle = "rgba(0,0,0,1)";
      else ctx.strokeStyle = "rgba(0,0,0,1)";
      return;
    }
    ctx.globalCompositeOperation = "source-over";
    const [r, g, b] = bitsToRgb(strokeBitsRef.current, previewRgb);
    const color = `rgba(${r},${g},${b},0.85)`;
    if (kind === "fill") ctx.fillStyle = color;
    else ctx.strokeStyle = color;
  };

  const paintDot = (worldX: number, worldZ: number) => {
    const display = displayCanvasRef.current!.getContext("2d");
    const mask = maskCanvasRef.current!.getContext("2d");
    if (!display || !mask) return;
    const { px, py } = worldToPx(worldX, worldZ);

    display.save();
    applyBrushStyle(display, "fill");
    display.beginPath();
    display.arc(px, py, brushPx, 0, Math.PI * 2);
    display.fill();
    display.restore();

    mask.fillStyle = "rgba(255,255,255,1)";
    mask.beginPath();
    mask.arc(px, py, brushPx, 0, Math.PI * 2);
    mask.fill();

    expandBBox(px, py);
  };

  const paintSegment = (
    from: { x: number; z: number },
    to: { x: number; z: number },
  ) => {
    const display = displayCanvasRef.current!.getContext("2d");
    const mask = maskCanvasRef.current!.getContext("2d");
    if (!display || !mask) return;
    const a = worldToPx(from.x, from.z);
    const b = worldToPx(to.x, to.z);

    display.save();
    applyBrushStyle(display, "stroke");
    display.lineWidth = brushPx * 2;
    display.lineCap = "round";
    display.lineJoin = "round";
    display.beginPath();
    display.moveTo(a.px, a.py);
    display.lineTo(b.px, b.py);
    display.stroke();
    display.restore();

    mask.strokeStyle = "rgba(255,255,255,1)";
    mask.lineWidth = brushPx * 2;
    mask.lineCap = "round";
    mask.lineJoin = "round";
    mask.beginPath();
    mask.moveTo(a.px, a.py);
    mask.lineTo(b.px, b.py);
    mask.stroke();

    expandBBox(a.px, a.py);
    expandBBox(b.px, b.py);
  };

  const commitStroke = async () => {
    const bb = strokeBBoxRef.current;
    if (!bb) return;
    strokeBBoxRef.current = null;
    const minX = Math.max(0, Math.floor(bb.minX));
    const minY = Math.max(0, Math.floor(bb.minY));
    const maxX = Math.min(PREVIEW_DIM - 1, Math.ceil(bb.maxX));
    const maxY = Math.min(PREVIEW_DIM - 1, Math.ceil(bb.maxY));
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w <= 0 || h <= 0) return;

    const mask = maskCanvasRef.current!.getContext("2d");
    if (!mask) return;
    const data = mask.getImageData(minX, minY, w, h).data;
    const bits = strokeBitsRef.current;
    const delta: PaintStrokeDelta = new Map();

    const bigStroke = w * h > 256 * 256;
    if (bigStroke) onCommittingChange?.(true);

    try {
      const PIXELS_PER_CHUNK = 6000;
      const rowsPerChunk = Math.max(1, Math.floor(PIXELS_PER_CHUNK / w));
      for (let baseY = 0; baseY < h; baseY += rowsPerChunk) {
        const endY = Math.min(h, baseY + rowsPerChunk);
        for (let dy = baseY; dy < endY; dy += 1) {
          for (let dx = 0; dx < w; dx += 1) {
            const alpha = data[(dy * w + dx) * 4 + 3];
            if (alpha === 0) continue;
            const px = minX + dx;
            const py = minY + dy;
            const colStart = Math.floor(px * CELLS_PER_PX);
            const colEnd = Math.min(
              RASTER_DIM - 1,
              colStart + CELLS_PER_PX - 1,
            );
            const rowTop = RASTER_DIM - 1 - Math.floor(py * CELLS_PER_PX);
            const rowBot = Math.max(0, rowTop - (CELLS_PER_PX - 1));
            for (let row = rowBot; row <= rowTop; row += 1) {
              const base = row * RASTER_DIM;
              for (let col = colStart; col <= colEnd; col += 1) {
                const key = base + col;
                if (!delta.has(key)) {
                  delta.set(key, {
                    prev: editsRef.current.has(key)
                      ? editsRef.current.get(key)
                      : undefined,
                    next: bits,
                  });
                }
                editsRef.current.set(key, bits);
              }
            }
          }
        }
        if (endY < h) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      }
      mask.clearRect(minX, minY, w, h);
    } finally {
      if (bigStroke) onCommittingChange?.(false);
    }
    if (delta.size > 0) onStrokeCommitted?.(delta);
    else onEditsChanged?.();
  };

  useEffect(() => {
    if (active) {
      map.dragging.disable();
      map.doubleClickZoom.disable();
    } else {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    }
    return () => {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    };
  }, [active, map]);

  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
  const [heldErase, setHeldErase] = useState(false);
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; z: number } | null>(null);
  const queueCursorUpdate = (pos: { x: number; z: number }) => {
    pendingCursorRef.current = pos;
    if (cursorRafRef.current != null) return;
    cursorRafRef.current = requestAnimationFrame(() => {
      cursorRafRef.current = null;
      const p = pendingCursorRef.current;
      pendingCursorRef.current = null;
      if (p) setCursor(p);
    });
  };

  const beginStroke = (pos: { x: number; z: number }, erase: boolean) => {
    drawingRef.current = true;
    strokeEraseRef.current = erase;
    strokeBitsRef.current = erase ? 0 : 1 << paintTier;
    strokeBBoxRef.current = null;
    lastPaintPosRef.current = pos;
    queueCursorUpdate(pos);
    paintDot(pos.x, pos.z);
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPaintPosRef.current = null;
    void commitStroke();
  };

  const endStrokeRef = useRef(endStroke);
  endStrokeRef.current = endStroke;

  useEffect(() => {
    if (!active) return;
    const up = () => endStrokeRef.current();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [active]);

  useMapEvents(
    active
      ? {
          mousedown: (e) => {
            if (e.originalEvent.button !== 0) return;
            const erase = mode === "erase" || e.originalEvent.altKey;
            beginStroke(latLngToDayz(e.latlng), erase);
          },
          mousemove: (e) => {
            const pos = latLngToDayz(e.latlng);
            queueCursorUpdate(pos);
            setHeldErase(e.originalEvent.altKey);
            if (!drawingRef.current) return;
            const last = lastPaintPosRef.current;
            if (last) paintSegment(last, pos);
            else paintDot(pos.x, pos.z);
            lastPaintPosRef.current = pos;
          },
          mouseout: () => {
            setCursor(null);
          },
        }
      : {},
  );

  const eraseCursor = mode === "erase" || heldErase;

  return (
    <>
      {active && cursor ? (
        <Circle
          center={[cursor.z, cursor.x]}
          radius={brushRadiusM}
          pathOptions={{
            color: eraseCursor
              ? "#94a3b8"
              : `rgb(${(previewRgb ?? TIER_COLOR[paintTier] ?? [148, 163, 184]).join(",")})`,
            weight: 2,
            dashArray: eraseCursor ? "2 6" : "4 4",
            fillOpacity: 0,
          }}
          interactive={false}
        />
      ) : null}
    </>
  );
}
