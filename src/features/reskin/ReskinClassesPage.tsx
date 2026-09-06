import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Boxes,
  Database,
  FileCode,
  Layers,
  Loader2,
  Palette,
  Search,
  X,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useItemsSnapshot } from "@/hooks/useItems";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage } from "@/lib/utils";
import type {
  SkinnableClass,
  VanillaClassSummary,
} from "@/types/ipc";

const ALL_CONTAINERS = "__all__";

export function ReskinClassesPage() {
  const navigate = useNavigate();
  const list = useQuery<VanillaClassSummary[]>({
    queryKey: ["reskin", "vanilla-index", "list"],
    queryFn: () => tauri.reskinVanillaClassList(),
    staleTime: 60_000,
  });
  // Items snapshot gives us the CE-registered classnames for the
  // active profile. Any name not already in the reskin index gets
  // merged in as a non-reskinnable row so the Classes page scope
  // matches what the Items page shows — if the operator sees
  // `Animal_UrsusArctos` on Items, they'll see it here too.
  const items = useItemsSnapshot();

  const [query, setQuery] = useState("");
  const [container, setContainer] = useState<string>(ALL_CONTAINERS);
  // Default to reskinnable-only so the wizard-adjacent view stays
  // focused. The toggle lets operators browse the full set — items
  // without skin slots included — when they want to pick a parent
  // for a Config Class.
  const [reskinnableOnly, setReskinnableOnly] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // Union of (reskin-index list) and (items-registry classnames).
  // Items that overlap a name already in the reskin list are
  // skipped — the reskin-index entry has parent/container info the
  // items entry doesn't.
  const merged = useMemo<VanillaClassSummary[]>(() => {
    const out = [...(list.data ?? [])];
    const seen = new Set(out.map((c) => c.name.toLowerCase()));
    for (const it of items.data?.items ?? []) {
      if (seen.has(it.name.toLowerCase())) continue;
      seen.add(it.name.toLowerCase());
      out.push({
        name: it.name,
        parent: null,
        container: null,
        selectionCount: 0,
        reskinnable: false,
        source: "items",
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [list.data, items.data]);

  const containers = useMemo(() => {
    const s = new Set<string>();
    for (const c of merged) {
      if (c.container) s.add(c.container);
    }
    return Array.from(s).sort();
  }, [merged]);

  const totalReskinnable = useMemo(
    () => merged.filter((c) => c.reskinnable).length,
    [merged],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return merged.filter((r) => {
      if (reskinnableOnly && !r.reskinnable) return false;
      if (container !== ALL_CONTAINERS && r.container !== container) {
        return false;
      }
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [merged, query, container, reskinnableOnly]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Boxes}
        title="Server Modpack · Vanilla classes"
        description={
          <>
            Reskinnable classes parsed from the P: drive, merged with
            classes registered in this mission's{" "}
            <code>types.xml</code> so the list matches what the Items
            page shows. Toggle "Reskinnable only" to narrow down when
            you're looking for a reskin source — items that aren't
            reskinnable are still listed so you can pick them as
            parents for Config Classes.
          </>
        }
        badges={
          <>
            <Badge variant="outline" className="text-[10px]">
              <Database className="mr-1.5 h-3 w-3" />
              {merged.length} classes
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] border-primary/40 text-primary"
              title="Classes that expose hiddenSelections slots the reskin wizard can target."
            >
              <Palette className="mr-1.5 h-3 w-3" />
              {totalReskinnable} reskinnable
            </Badge>
          </>
        }
      />

      {list.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading index…
        </div>
      ) : list.error ? (
        <div className="p-6">
          <Alert>
            <AlertDescription>{errorMessage(list.error)}</AlertDescription>
          </Alert>
        </div>
      ) : list.data && list.data.length === 0 ? (
        <div className="p-6">
          <Alert>
            <AlertDescription>
              No classes in the local index yet. Build it from the{" "}
              <strong>Reskin · Setup</strong> page, then return here.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: filters + list — its own scroll container */}
          <aside className="flex h-full min-h-0 w-80 shrink-0 flex-col overflow-hidden border-r border-border/60">
            <div className="shrink-0 space-y-2 border-b border-border/60 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by classname…"
                  className="h-8 pl-8 text-xs"
                />
                {query ? (
                  <button
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted"
                    onClick={() => setQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <Select value={container} onValueChange={setContainer}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CONTAINERS}>
                    All containers
                  </SelectItem>
                  {containers.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                <Checkbox
                  checked={reskinnableOnly}
                  onCheckedChange={(v) =>
                    setReskinnableOnly(v === true)
                  }
                  id="reskinnable-only"
                />
                <Label
                  htmlFor="reskinnable-only"
                  className="cursor-pointer text-[11px] font-normal"
                >
                  Reskinnable only
                </Label>
              </label>
              <div className="text-[11px] text-muted-foreground">
                {filtered.length} of {list.data?.length ?? 0} shown
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-border/60">
                {filtered.map((c) => (
                  <li key={c.name}>
                    <button
                      onClick={() => setSelected(c.name)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                        selected === c.name
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-muted/50",
                      )}
                    >
                      <Boxes
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          c.source === "modpack"
                            ? "text-accent"
                            : "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate font-mono">
                            {c.name}
                          </span>
                          {c.source === "modpack" ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[8px] border-accent/40 text-accent"
                              title="Authored in Modpack → Config Classes"
                            >
                              modpack
                            </Badge>
                          ) : c.source === "mod" ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[8px] border-primary/40 text-primary"
                              title={`Scanned from mod: ${c.sourceMod ?? "(unknown)"}`}
                            >
                              {c.sourceMod ?? "mod"}
                            </Badge>
                          ) : c.source === "items" ? (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[8px] text-muted-foreground"
                              title="Registered in the mission's types.xml — appears in the Items page too. Not reskinnable (no hiddenSelections slots)."
                            >
                              items
                            </Badge>
                          ) : null}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {c.container ?? "—"}
                          {c.parent ? (
                            <>
                              {" · "}
                              <span className="font-mono">
                                : {c.parent}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      {c.reskinnable ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px] border-primary/40 text-primary"
                          title={`${c.selectionCount} reskinnable slot(s)`}
                        >
                          <Palette className="mr-0.5 h-2.5 w-2.5" />
                          {c.selectionCount}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px] text-muted-foreground"
                          title="No hiddenSelections slots — can't be reskinned. Use Modpack → Config Classes to modify stats instead."
                        >
                          no skin
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Right: detail — its own scroll container */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {selected ? (
              <ClassDetail
                name={selected}
                summary={merged.find((c) => c.name === selected) ?? null}
                onCreateConfigClass={() =>
                  navigate(
                    `/app/reskin/config?parent=${encodeURIComponent(selected)}`,
                  )
                }
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Pick a class on the left to preview its selection slots.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassDetail({
  name,
  summary,
  onCreateConfigClass,
}: {
  name: string;
  /** The row summary from the merged list — carries the source flag
   *  so the detail view can tell apart an "items-sourced" name (no
   *  P: drive detail, types.xml only) from a genuinely missing
   *  class. */
  summary: VanillaClassSummary | null;
  onCreateConfigClass: () => void;
}) {
  const isItemsOnly = summary?.source === "items";
  const detail = useQuery<SkinnableClass | null>({
    queryKey: ["reskin", "vanilla-index", "class", name],
    // Skip the backend lookup for items-sourced entries — we know
    // up-front they won't be in the P: drive index, so the query
    // would pointlessly return null. Saves a roundtrip and avoids
    // a misleading "not found" flash.
    queryFn: () =>
      isItemsOnly
        ? Promise.resolve(null)
        : tauri.reskinVanillaClassGet(name),
    staleTime: 60_000,
  });

  if (detail.isLoading && !isItemsOnly) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading class…
      </div>
    );
  }
  if (detail.error) {
    return (
      <Alert>
        <AlertDescription>{errorMessage(detail.error)}</AlertDescription>
      </Alert>
    );
  }

  // Items-registered class that has no P: drive detail. Render a
  // tailored view that explains the situation and offers the
  // Config Class shortcut — no P: drive metadata to show.
  if (isItemsOnly) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-mono text-xl font-semibold tracking-tight">
            {name}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Registered in this mission's <code>types.xml</code>.
            Scanned from CE, not from the P: drive index.
          </p>
        </div>
        <Alert>
          <FileCode className="h-4 w-4" />
          <AlertDescription>
            <p className="text-xs">
              We don't have the <code>.p3d</code>-side metadata for
              this class on disk — animals and some other entities
              live outside the P: drive parse scope because they have
              no hidden-selection slots (their visual variants ship as
              separate model files, not texture swaps).
            </p>
            <p className="mt-2 text-xs">
              To customise its stats or behaviour, subclass it via{" "}
              <strong>Modpack → Config Classes → New class</strong>.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px]"
              onClick={onCreateConfigClass}
            >
              <FileCode className="mr-1.5 h-3 w-3" />
              Create a Config Class deriving from {name}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const c = detail.data;
  if (!c) {
    return (
      <div className="text-sm text-muted-foreground">
        Class not found in the local index. Rebuild the index if the
        P: drive changed.
      </div>
    );
  }

  const rows = buildSelectionRows(c);
  const reskinnable = rows.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-mono text-xl font-semibold tracking-tight">
          {c.name}
        </h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {c.parent ? (
            <span className="inline-flex items-center gap-1">
              inherits from{" "}
              <code className="font-mono text-foreground">{c.parent}</code>
            </span>
          ) : (
            <span>no declared parent</span>
          )}
          {c.containers.length ? (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-mono">
                {c.containers.join(" › ")}{" "}
                <ArrowRight className="h-3 w-3" /> {c.name}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {!reskinnable ? (
        <Alert>
          <FileCode className="h-4 w-4" />
          <AlertDescription>
            <p className="text-xs">
              <strong>
                This class has no <code>hiddenSelections</code> slots.
              </strong>{" "}
              It can't be reskinned (no texture surfaces to target) —
              this is common for animals, some vehicles, and base
              script classes whose visual variation lives in different
              <code>.p3d</code> models, not texture swaps.
            </p>
            <p className="mt-2 text-xs">
              What you <em>can</em> do: subclass it via{" "}
              <strong>Modpack → Config Classes → New class</strong>{" "}
              and tweak its stats, scale, HP, or spawn parameters —
              everything that isn't a texture replacement.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-7 text-[11px]"
              onClick={onCreateConfigClass}
            >
              <FileCode className="mr-1.5 h-3 w-3" />
              Create a Config Class deriving from {c.name}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" /> Selection slots
          </CardTitle>
          <CardDescription>
            Each slot is a named surface on the model. A reskin supplies
            a new <code className="font-mono">.paa</code> at the same
            index.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              The class declares selection arrays but every slot is
              empty.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-left text-[11px] uppercase text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">#</th>
                    <th className="py-1.5 pr-3 font-medium">Selection</th>
                    <th className="py-1.5 pr-3 font-medium">
                      Default texture
                    </th>
                    <th className="py-1.5 font-medium">Default material</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const kind = classifyTexture(row.texture);
                    const procedural =
                      kind === "procedural" ? parseProcedural(row.texture) : null;
                    return (
                      <tr
                        key={i}
                        className="border-b border-border/40 last:border-0"
                      >
                        <td className="py-1.5 pr-3 font-mono text-muted-foreground">
                          {i}
                        </td>
                        <td className="py-1.5 pr-3 font-mono">
                          {row.selection || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-[11px]">
                          {kind === "empty" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : procedural ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block h-3 w-3 shrink-0 rounded-sm border border-border/60"
                                style={{
                                  backgroundColor: proceduralCss(procedural),
                                }}
                              />
                              <Badge
                                variant="outline"
                                className="text-[9px]"
                                title={row.texture}
                              >
                                procedural
                              </Badge>
                            </span>
                          ) : (
                            row.texture
                          )}
                        </td>
                        <td className="py-1.5 font-mono text-[11px]">
                          {row.material || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 ? (
            <div className="mt-3 rounded-md border border-border/60 bg-muted/30 p-2 text-[11px] text-muted-foreground">
              A reskin of this class has{" "}
              <strong>
                {rows.filter((r) => classifyTexture(r.texture) === "file").length}{" "}
                extractable .paa slot(s)
              </strong>
              ,{" "}
              {rows.filter((r) => classifyTexture(r.texture) === "procedural").length}{" "}
              procedural colour slot(s), and{" "}
              {rows.filter((r) => classifyTexture(r.texture) === "empty").length}{" "}
              optional slot(s). You can override any of them in the
              reskin wizard — procedural and empty slots just need a
              custom .paa since there's nothing to extract.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

interface SelectionRow {
  selection: string;
  texture: string;
  material: string;
}

function buildSelectionRows(c: SkinnableClass): SelectionRow[] {
  const width = Math.max(
    c.hiddenSelections.length,
    c.hiddenSelectionsTextures.length,
    c.hiddenSelectionsMaterials.length,
  );
  const out: SelectionRow[] = [];
  for (let i = 0; i < width; i++) {
    out.push({
      selection: c.hiddenSelections[i] ?? "",
      texture: c.hiddenSelectionsTextures[i] ?? "",
      material: c.hiddenSelectionsMaterials[i] ?? "",
    });
  }
  return out;
}

// Texture classification — mirrors the wizard's logic so the browse
// view and the wizard agree on what's extractable.
type TextureKind = "empty" | "procedural" | "file";

interface ProceduralColor {
  r: number;
  g: number;
  b: number;
  a: number;
  type: string;
}

function classifyTexture(raw: string | null | undefined): TextureKind {
  const t = (raw ?? "").trim();
  if (!t) return "empty";
  if (t.startsWith("#")) return "procedural";
  return "file";
}

function parseProcedural(raw: string): ProceduralColor | null {
  const m = raw.match(/^#\([^)]+\)color\(([^)]+)\)$/i);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => s.trim());
  if (parts.length < 3) return null;
  const r = Number(parts[0]);
  const g = Number(parts[1]);
  const b = Number(parts[2]);
  const a = parts.length >= 4 ? Number(parts[3]) : 1;
  const type = parts.length >= 5 ? parts[4] : "";
  if ([r, g, b, a].some((v) => !Number.isFinite(v))) return null;
  return { r, g, b, a, type };
}

function proceduralCss(color: ProceduralColor): string {
  const to255 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${to255(color.r)}, ${to255(color.g)}, ${to255(color.b)}, ${color.a.toFixed(2)})`;
}
