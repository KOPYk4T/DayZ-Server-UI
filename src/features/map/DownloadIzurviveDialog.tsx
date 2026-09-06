import { useEffect, useMemo, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import type {
  DownloadProgress,
  IzurviveMapType,
  MapDownloadResult,
  MapId,
} from "@/types/ipc";

/** Maps the profile's `MapId` to the iZurvive URL slug. `custom`
 *  falls back to Chernarus so the dialog always starts from a
 *  working value — the user can type the actual slug themselves. */
const IZURVIVE_MAP_FROM_PROFILE: Record<Exclude<MapId, "custom">, string> = {
  chernarusplus: "ChernarusPlus",
  enoch: "Livonia",
  sakhal: "Sakhal",
};

const IZURVIVE_MAP_CHOICES: { slug: string; label: string }[] = [
  { slug: "ChernarusPlus", label: "Chernarus+" },
  { slug: "Livonia", label: "Livonia" },
  { slug: "Sakhal", label: "Sakhal" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileMap: MapId;
  /** Called with the saved-file path on success — caller sets it
   *  as the active backdrop. */
  onDownloaded: (path: string) => void;
}

/** Resolution → tiles per side + stitched image size (px). Used to
 *  warn the user about file size / download time. `warn` tiers:
 *  - `null` — plain entry.
 *  - `"heavy"` — res 5, noticeable but fine on most machines.
 *  - `"very-heavy"` — res 6, needs ~1 GB RAM during stitch; slow.
 *  - `"extreme"` — res 7, ~3 GB RAM, ~60 s+ stitch, multi-minute
 *    download. Only for a one-time high-fidelity capture. */
type WarnTier = null | "heavy" | "very-heavy" | "extreme";
const RESOLUTIONS: {
  res: number;
  tilesPerSide: number;
  sizePx: number;
  totalTiles: number;
  estMb: number;
  warn: WarnTier;
}[] = [1, 2, 3, 4, 5, 6, 7].map((res) => {
  const tps = 1 << res;
  const sz = tps * 256;
  const tiles = tps * tps;
  const warn: WarnTier =
    res === 7
      ? "extreme"
      : res === 6
        ? "very-heavy"
        : res === 5
          ? "heavy"
          : null;
  return {
    res,
    tilesPerSide: tps,
    sizePx: sz,
    totalTiles: tiles,
    // Rough estimate: ~30 KB per iZurvive tile on average.
    estMb: Math.round((tiles * 30) / 1024),
    warn,
  };
});

export function DownloadIzurviveDialog({
  open,
  onOpenChange,
  profileMap,
  onDownloaded,
}: Props) {
  const [mapSlug, setMapSlug] = useState<string>(() => defaultMap(profileMap));
  const [mapType, setMapType] = useState<IzurviveMapType>("Top");
  const [resolution, setResolution] = useState<number>(4);
  const [version, setVersion] = useState<string>("1.26.0");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);

  // Reset local UI state on close so a reopen starts fresh.
  useEffect(() => {
    if (!open) {
      setBusy(false);
      setProgress(null);
    }
  }, [open]);

  // Reset map slug when the profile changes beneath us.
  useEffect(() => {
    if (!open) return;
    setMapSlug(defaultMap(profileMap));
  }, [open, profileMap]);

  // Subscribe to progress events from the Rust side while the
  // dialog is open and a download is running. The Rust command
  // emits `map-download-progress` with `{ completed, total, stage }`.
  useEffect(() => {
    if (!busy) return;
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    (async () => {
      const fn = await listen<DownloadProgress>(
        "map-download-progress",
        (ev) => {
          if (cancelled) return;
          setProgress(ev.payload);
        },
      );
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [busy]);

  const selectedRes = useMemo(
    () => RESOLUTIONS.find((r) => r.res === resolution) ?? RESOLUTIONS[3],
    [resolution],
  );

  const startDownload = async () => {
    if (busy) return;
    setBusy(true);
    setProgress(null);
    try {
      const result: MapDownloadResult = await tauri.mapDownloadIzurvive({
        map: mapSlug.trim(),
        mapType,
        resolution,
        version: version.trim(),
      });
      toast.success("Map backdrop downloaded", {
        description: `${result.width}×${result.height}px · ${(result.bytes / (1024 * 1024)).toFixed(1)} MB`,
      });
      onDownloaded(result.savedPath);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return; // don't let the user close mid-download
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-4 w-4" /> Download map from iZurvive
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fetches the iZurvive tile pyramid and stitches it into a
            single JPG for use as the Map-page backdrop. Saved under
            the app data folder; re-usable across profiles on this
            machine. Requires an active internet connection.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px]">Map</Label>
            <Select
              value={mapSlug}
              onValueChange={setMapSlug}
              disabled={busy}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IZURVIVE_MAP_CHOICES.map((m) => (
                  <SelectItem key={m.slug} value={m.slug}>
                    {m.label}{" "}
                    <span className="text-muted-foreground">({m.slug})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px]">Style</Label>
            <Select
              value={mapType}
              onValueChange={(v) => setMapType(v as IzurviveMapType)}
              disabled={busy}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Top">
                  Topographic (roads, contour lines)
                </SelectItem>
                <SelectItem value="Sat">Satellite imagery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Resolution + DayZ version each take a full row of the
              two-column grid via `col-span-2`. The Resolution
              SelectItem labels are long enough ("Res 4 · 4096×4096px
              · 1024 tiles (~50 MB download) ⚠️ heavy") that
              squeezing them into a half-row column overflowed and
              overlapped the version input. */}
          <div className="col-span-2 space-y-1.5">
            <Label className="text-[11px]">Resolution</Label>
            <Select
              value={String(resolution)}
              onValueChange={(v) => setResolution(Number(v))}
              disabled={busy}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESOLUTIONS.map((r) => (
                  <SelectItem key={r.res} value={String(r.res)}>
                    Res {r.res} · {r.sizePx}×{r.sizePx}px ·{" "}
                    {r.totalTiles} tiles (~{r.estMb} MB download)
                    {r.warn === "heavy" ? " ⚠️ heavy" : ""}
                    {r.warn === "very-heavy" ? " ⚠️ very heavy" : ""}
                    {r.warn === "extreme" ? " 🛑 extreme" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Higher resolution = sharper backdrop at high map zoom.
              Res 4 (4096×4096) is the recommended default.
            </p>
            {selectedRes.warn ? <ResolutionWarning tier={selectedRes.warn} /> : null}
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label className="text-[11px]">DayZ version</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.26.0"
              className="h-8 text-xs tabular-nums"
              disabled={busy}
            />
            <p className="text-[10px] text-muted-foreground">
              Must match an iZurvive snapshot (exact e.g. "1.25.0").
              Livonia / Sakhal may lag behind the DayZ release by a
              few minor versions.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-[11px]">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {mapSlug}-{mapType}
            </Badge>
            <span className="text-muted-foreground">
              → {selectedRes.sizePx}×{selectedRes.sizePx}px · ~{" "}
              {selectedRes.totalTiles} tiles
            </span>
          </div>
          {busy && progress ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {labelForStage(progress.stage)}
                </span>
                <span className="tabular-nums">
                  {progress.completed} / {progress.total}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${progress.total > 0 ? Math.min(100, (progress.completed / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={startDownload}
            disabled={busy || !mapSlug.trim() || !version.trim()}
          >
            {busy ? (
              <>
                <Loader2 className={cn("mr-2 h-3.5 w-3.5 animate-spin")} />
                Downloading…
              </>
            ) : (
              <>
                <Download className="mr-2 h-3.5 w-3.5" />
                Start download
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolutionWarning({ tier }: { tier: "heavy" | "very-heavy" | "extreme" }) {
  const color =
    tier === "extreme"
      ? "border-severity-error/40 bg-severity-error/5 text-severity-error"
      : tier === "very-heavy"
        ? "border-severity-warning/40 bg-severity-warning/5 text-severity-warning"
        : "border-severity-warning/30 bg-severity-warning/5 text-severity-warning";
  const body =
    tier === "extreme"
      ? "Res 7 downloads ~16 000 tiles (~480 MB over the wire) and stitches a 32768×32768 image that needs ~3 GB of free RAM. Takes several minutes and can crash the app on low-memory machines. Only use for a one-time ultra-sharp capture — once the JPG is saved, future loads are cheap."
      : tier === "very-heavy"
        ? "Res 6 downloads ~4 000 tiles (~120 MB) and needs ~1 GB of RAM to stitch a 16384×16384 image. Works fine on a modern PC but expect ~1 min of work."
        : "Res 5 downloads ~1 000 tiles (~30 MB) and stitches an 8192×8192 image. Comfortable on most machines — ~20–40 s end-to-end.";
  return (
    <div className={`mt-1 rounded-md border p-2 text-[11px] ${color}`}>
      {body}
    </div>
  );
}

function defaultMap(map: MapId): string {
  if (map === "custom") return "ChernarusPlus";
  return IZURVIVE_MAP_FROM_PROFILE[map];
}

function labelForStage(stage: DownloadProgress["stage"]): string {
  switch (stage) {
    case "downloading":
      return "Downloading tiles";
    case "stitching":
      return "Stitching";
    case "saving":
      return "Saving";
    case "done":
      return "Done";
    default:
      return stage;
  }
}
