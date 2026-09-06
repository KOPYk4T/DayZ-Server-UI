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
 *  painter only emits single-bit values. */
function bitsToRgb(bits: number): [number, number, number] {
  for (let i = 0; i < 5; i += 1) {
    if (bits & (1 << i)) return TIER_COLOR[i];
  }
  return [148, 163, 184]; // empty / erase preview — slate
}

export type BrushMode =
  /** Replace the cell's tier bits with the picked tier (single bit). */
  | "set"
  /** Clear ALL tier bits in the cell — the cell becomes empty / no
   *  loot. Saving propagates this to disk. */
  | "erase";

export interface PaintEdit {
  row: number;
  col: number;
  bits: number;
}

interface Props {
  mapId: MapId;
  active: boolean;
  paintTier: number;
  brushRadiusM: number;
  mode: BrushMode;
  /** Mutable map of pending edits keyed by `row * RASTER_DIM + col`.
   *  Stroke commits update this in batch at mouseup, not per pointer
   *  event. */
  editsRef: React.MutableRefObject<Map<number, number>>;
  /** Bumped after each stroke so consumers (the panel's edit count)
   *  re-render. */
  onEditsChanged?: () => void;
  /** Reactive view of `editsRef.current.size`. Used as the redraw
   *  trigger when the parent clears edits externally (after save /
   *  on discard). */
  editCount: number;
  /** Fires whenever a stroke commit starts (`true`) and finishes
   *  (`false`). The parent renders a "Saving stroke…" indicator
   *  while a large bbox is being processed — see the panel's
   *  status footer in `CeZonePainterControls`. Optional; small
   *  strokes commit too fast to bother displaying. */
  onCommittingChange?: (committing: boolean) => void;
  overlayOpacity?: number;
}

/**
 * Two-canvas painter.
 *
 *   Display canvas — the operator sees this. Discs + line segments
 *     are drawn in the tier's tint as the stroke happens (constant
 *     time per pointer event). Stays in sync with `editsRef` at
 *     mount / external resync.
 *
 *   Mask canvas    — hidden 1-bit alpha mask of "what did this
 *     stroke paint". Reset to transparent before each stroke. At
 *     `mouseup` we read its bounding-box pixels back, and every
 *     painted pixel commits the stroke's tier bits into `editsRef`.
 *
 * The cell-level math (iterating every cell inside a brush disc and
 * writing to `editsRef`) only runs ONCE per stroke, at commit time.
 * Mouse-move just calls `ctx.arc()` / `ctx.lineTo()` — both O(1)
 * regardless of brush radius — so the visual stays smooth even with
 * a 1000 m brush dragged across the map.
 */
export function TierPaintLayer({
  mapId,
  active,
  paintTier,
  brushRadiusM,
  mode,
  editsRef,
  onEditsChanged,
  editCount,
  onCommittingChange,
  overlayOpacity = 0.85,
}: Props) {
  const map = useMap();
  const size = sizeFor(mapId);

  // ---- Canvases: persistent DOM elements in the overlay pane -----
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
    // Mask canvas never enters the DOM — we just read its
    // ImageData at stroke end. Same coordinate space as the
    // display canvas so a pixel at (px, py) in mask corresponds
    // to the same world location in display.
    const c = document.createElement("canvas");
    c.width = PREVIEW_DIM;
    c.height = PREVIEW_DIM;
    maskCanvasRef.current = c;
  }

  // ---- Reposition + opacity + lifecycle attach -------------------
  useEffect(() => {
    const canvas = displayCanvasRef.current!;
    canvas.style.opacity = String(overlayOpacity);
    const pane = map.getPane("overlayPane");
    if (!pane) return;
    pane.appendChild(canvas);

    const reposition = () => {
      // mapBounds is `[[0,0],[size,size]]` in (lat, lng) where lat
      // is world Z and lng is world X. Top of the screen = lat=size
      // (north). The mask never enters the DOM so we don't need to
      // reposition it.
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
  }, [map, size, overlayOpacity]);

  // ---- World/canvas coord conversion -----------------------------
  // World (x, z) → display/mask pixel. World z grows north; canvas
  // pixel y grows downward, so the y mapping flips.
  const worldToPx = (worldX: number, worldZ: number) => ({
    px: (worldX * PREVIEW_DIM) / size,
    py: ((size - worldZ) * PREVIEW_DIM) / size,
  });
  const brushPx = (brushRadiusM * PREVIEW_DIM) / size;

  // ---- Drawing helpers (per-cell, used by full repaint) ----------
  /** Paint one fine-cell-sized block on the display canvas. Used by
   *  `fullRepaint` to mirror `editsRef` after external mutations
   *  (Save / Discard). Stroke-time drawing uses `ctx.arc()` instead
   *  and never calls this. */
  const drawCell = (
    ctx: CanvasRenderingContext2D,
    row: number,
    col: number,
    bits: number,
  ) => {
    const scale = PREVIEW_DIM / RASTER_DIM;
    const pixSize = Math.max(1, Math.ceil(scale));
    const py = Math.floor((RASTER_DIM - 1 - row) * scale);
    const px = Math.floor(col * scale);
    ctx.clearRect(px, py, pixSize, pixSize);
    if (bits === 0) {
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.fillRect(px, py, pixSize, pixSize);
    } else {
      const [r, g, b] = bitsToRgb(bits);
      ctx.fillStyle = `rgba(${r},${g},${b},1)`;
      ctx.fillRect(px, py, pixSize, pixSize);
    }
  };

  const fullRepaint = () => {
    const canvas = displayCanvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, PREVIEW_DIM, PREVIEW_DIM);
    editsRef.current.forEach((bits, key) => {
      const row = Math.floor(key / RASTER_DIM);
      const col = key % RASTER_DIM;
      drawCell(ctx, row, col, bits);
    });
  };

  useEffect(() => {
    fullRepaint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCount]);

  // ---- Stroke handling: O(1) per pointer event -------------------
  const drawingRef = useRef(false);
  /** Last cursor position in world coords — used to draw thick
   *  line segments between consecutive mouse-move events so fast
   *  drags don't leave gaps between disc stamps. */
  const lastPaintPosRef = useRef<{ x: number; z: number } | null>(null);
  /** Bits the current stroke is committing (single tier or 0 for
   *  erase). Captured at mousedown so a tier toggle mid-stroke
   *  (the panel disables the dropdown while painting, but be
   *  defensive) doesn't corrupt the commit. */
  const strokeBitsRef = useRef<number>(0);
  /** Canvas-pixel bounding box of every paint operation in the
   *  current stroke. Read back at mouseup to limit the
   *  `getImageData` call to just the touched region. */
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

  const paintDot = (worldX: number, worldZ: number) => {
    const display = displayCanvasRef.current!.getContext("2d");
    const mask = maskCanvasRef.current!.getContext("2d");
    if (!display || !mask) return;
    const { px, py } = worldToPx(worldX, worldZ);

    // Display canvas — tier tint at full opacity so overlapping
    // strokes within one paint session don't alpha-blend through
    // each other. CSS opacity on the canvas element provides the
    // overall transparency operators see.
    const bits = strokeBitsRef.current;
    if (bits === 0) {
      display.fillStyle = "rgba(148,163,184,0.55)";
    } else {
      const [r, g, b] = bitsToRgb(bits);
      display.fillStyle = `rgba(${r},${g},${b},1)`;
    }
    display.beginPath();
    display.arc(px, py, brushPx, 0, Math.PI * 2);
    display.fill();

    // Mask canvas — opaque white, only used to mark "this stroke
    // touched this pixel". Alpha=1 makes the bbox readback fast.
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

    const bits = strokeBitsRef.current;
    if (bits === 0) {
      display.strokeStyle = "rgba(148,163,184,0.55)";
    } else {
      const [r, g, b2] = bitsToRgb(bits);
      display.strokeStyle = `rgba(${r},${g},${b2},1)`;
    }
    display.lineWidth = brushPx * 2;
    display.lineCap = "round";
    display.lineJoin = "round";
    display.beginPath();
    display.moveTo(a.px, a.py);
    display.lineTo(b.px, b.py);
    display.stroke();

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

  /** Chunked async commit. Reads the stroke mask's bbox, walks
   *  every painted pixel, and expands each one into its 4×4 fine-
   *  cell block in `editsRef`. The walk is broken into row bands
   *  with a `requestAnimationFrame` yield between each band so the
   *  main thread stays responsive — the cursor keeps moving, the
   *  "Saving stroke…" indicator can paint, and the operator can
   *  even kick off another stroke before the previous commit
   *  finishes (the bbox is local to this call, so concurrent
   *  commits are safe).
   *
   *  Chunk size is chosen so each band stays under ~10 ms of work
   *  on a typical machine even for the maximum brush radius. */
  const commitStroke = async () => {
    const bb = strokeBBoxRef.current;
    if (!bb) return;
    strokeBBoxRef.current = null; // detach early so a new stroke
    // can begin painting its own bbox while this commit runs.
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

    // Heuristic: only flip the "committing" flag for strokes large
    // enough that the parent should bother showing a status pip.
    // A 256×256 bbox is ~65 k pixels and commits in well under 50
    // ms; anything bigger gets a visible indicator. The chunked
    // loop still runs for small strokes — yielding once is cheap
    // and keeps the painter feel consistent.
    const bigStroke = w * h > 256 * 256;
    if (bigStroke) onCommittingChange?.(true);

    try {
      // ~6 k pixels per chunk = ~10 ms of work each. RAF yield
      // between chunks lets input + paint happen.
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
            // py=0 is north (lat=size); py increases southward.
            // File row 0 is south. So
            // row = RASTER_DIM - 1 - py*CELLS_PER_PX.
            const rowTop =
              RASTER_DIM - 1 - Math.floor(py * CELLS_PER_PX);
            const rowBot = Math.max(0, rowTop - (CELLS_PER_PX - 1));
            for (let row = rowBot; row <= rowTop; row += 1) {
              const base = row * RASTER_DIM;
              for (let col = colStart; col <= colEnd; col += 1) {
                editsRef.current.set(base + col, bits);
              }
            }
          }
        }
        // Yield to the main thread between chunks. If the stroke
        // is tiny (a single click) we skip the yield to avoid a
        // pointless 16 ms latency on the post-commit `editCount`
        // bump.
        if (endY < h) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      }
      // Mask cleared at the end so a concurrent stroke that
      // started mid-commit doesn't lose its pixels. The bbox of
      // the new stroke is independent of this one.
      mask.clearRect(minX, minY, w, h);
    } finally {
      if (bigStroke) onCommittingChange?.(false);
    }
  };

  // While the brush is active we have to stop Leaflet from dragging
  // the map under us. Re-enable on stroke end / when leaving paint
  // mode.
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

  // ---- Mouse events ----------------------------------------------
  const [cursor, setCursor] = useState<{ x: number; z: number } | null>(null);
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

  useMapEvents(
    active
      ? {
          mousedown: (e) => {
            if (e.originalEvent.button !== 0) return;
            drawingRef.current = true;
            strokeBitsRef.current = mode === "erase" ? 0 : 1 << paintTier;
            strokeBBoxRef.current = null;
            const pos = latLngToDayz(e.latlng);
            lastPaintPosRef.current = pos;
            queueCursorUpdate(pos);
            paintDot(pos.x, pos.z);
          },
          mousemove: (e) => {
            const pos = latLngToDayz(e.latlng);
            queueCursorUpdate(pos);
            if (!drawingRef.current) return;
            const last = lastPaintPosRef.current;
            if (last) {
              // Connect last position to current with a thick line
              // so fast drags don't leave dotted-line gaps between
              // disc stamps. `ctx.lineCap = "round"` makes endpoints
              // look identical to a disc, so the visual is smooth.
              paintSegment(last, pos);
            } else {
              paintDot(pos.x, pos.z);
            }
            lastPaintPosRef.current = pos;
          },
          mouseup: () => {
            if (!drawingRef.current) return;
            drawingRef.current = false;
            lastPaintPosRef.current = null;
            // Fire-and-await without blocking the handler. The
            // commit is chunked + RAF-yielded so the UI stays
            // responsive; we bump `editCount` only when the whole
            // walk has finished so the panel's "N cells pending"
            // total stays accurate.
            void commitStroke().then(() => {
              onEditsChanged?.();
            });
          },
          mouseout: () => {
            setCursor(null);
          },
        }
      : {},
  );

  return (
    <>
      {/* Brush cursor — a Leaflet Circle at the latest hovered
          point. Only rendered while the painter is active and after
          the first mousemove so it doesn't ghost at (0,0). */}
      {active && cursor ? (
        <Circle
          center={[cursor.z, cursor.x]}
          radius={brushRadiusM}
          pathOptions={{
            color:
              mode === "erase"
                ? "#94a3b8"
                : `rgb(${TIER_COLOR[paintTier].join(",")})`,
            weight: 2,
            dashArray: "4 4",
            fillOpacity: 0,
          }}
          interactive={false}
        />
      ) : null}
    </>
  );
}
