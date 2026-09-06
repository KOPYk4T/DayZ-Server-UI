import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Coins,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassnamePicker } from "@/components/ClassnamePicker";
import { useMutedClassnameReason } from "@/features/mods/useMutedClassnameReason";
import { FactionPicker } from "@/features/mods/expansion/pickers/FactionPicker";
import { QuestPicker } from "@/features/mods/expansion/pickers/QuestPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TokenInput } from "@/components/TokenInput";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useModsScan } from "@/hooks/useMods";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { ExpansionDirListing } from "@/types/ipc";

import { DEFAULT_TRADER, joinCategoryRef, splitCategoryRef, type Trader } from "./types";

export function TradersPage() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();
  const modsScan = useModsScan();
  const inv = modsScan.data?.expansion ?? null;
  const items = useItemsSnapshot();

  const tradersFolder = inv
    ? inv.dataFolders.find((d) => d.name === "Traders")?.relativePath
    : null;
  const marketFolder = inv
    ? inv.dataFolders.find((d) => d.name === "Market")?.relativePath
    : null;

  const tradersList = useQuery({
    queryKey:
      profileId && tradersFolder
        ? ["expansion-traders-list", profileId]
        : ["none"],
    queryFn: () => tauri.expansionListDir(profileId!, tradersFolder!),
    enabled: !!(profileId && tradersFolder),
    staleTime: 5_000,
  });

  // Fetch Market category filenames so the category picker can
  // validate / autocomplete against what actually exists.
  const marketList = useQuery({
    queryKey:
      profileId && marketFolder
        ? ["expansion-market-list", profileId]
        : ["none"],
    queryFn: (): Promise<ExpansionDirListing> =>
      tauri.expansionListDir(profileId!, marketFolder!),
    enabled: !!(profileId && marketFolder),
    staleTime: 5_000,
  });
  const marketCategoryNames = useMemo(
    () =>
      (marketList.data?.entries ?? [])
        .filter((e) => !e.isDir && e.extension === "json")
        .map((e) => e.name.replace(/\.json$/i, ""))
        .sort(),
    [marketList.data],
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const urlName = searchParams.get("name");

  const traderFiles = useMemo(() => {
    const all =
      tradersList.data?.entries.filter(
        (e) => !e.isDir && e.extension === "json",
      ) ?? [];
    return [...all].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  }, [tradersList.data]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!urlName || traderFiles.length === 0) return;
    const match = traderFiles.find(
      (e) => e.name.replace(/\.json$/i, "").toLowerCase() === urlName.toLowerCase(),
    );
    if (match) setSelectedPath(match.relativePath);
  }, [urlName, traderFiles]);
  useEffect(() => {
    if (selectedPath || traderFiles.length === 0 || urlName) return;
    setSelectedPath(traderFiles[0].relativePath);
  }, [selectedPath, traderFiles, urlName]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return traderFiles;
    return traderFiles.filter((e) => e.name.toLowerCase().includes(q));
  }, [traderFiles, filter]);

  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );

  const createTrader = useMutation({
    mutationFn: async (slug: string) => {
      if (!profileId || !tradersFolder) throw new Error("no folder");
      const path = `${tradersFolder}/${slug}.json`;
      const data: Trader = { ...DEFAULT_TRADER, DisplayName: slug };
      await tauri.expansionSettingsWrite(
        profileId,
        path,
        JSON.stringify(data, null, 4),
      );
      return path;
    },
    onSuccess: (path) => {
      qc.invalidateQueries({ queryKey: ["expansion-traders-list", profileId] });
      setSelectedPath(path);
      toast.success("trader created");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!inv) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Breadcrumb />
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            DayZ Expansion isn't detected in this workspace.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Breadcrumb />
      <header className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Traders</h1>
        <Badge variant="secondary">{traderFiles.length}</Badge>
      </header>
      <p className="text-xs text-muted-foreground">
        NPC trader placements and which Market categories each one
        buys/sells from.
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr] gap-4">
        <aside className="flex min-h-0 flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter traders"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {tradersList.isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {filtered.map((f) => {
                const stem = f.name.replace(/\.json$/i, "");
                return (
                  <li key={f.relativePath}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPath(f.relativePath);
                        searchParams.delete("name");
                        setSearchParams(searchParams, { replace: true });
                      }}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                        selectedPath === f.relativePath
                          ? "bg-primary/10 font-semibold text-primary"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <Store className="h-3 w-3 shrink-0" />
                      <span className="truncate">{stem}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1 h-8 text-xs"
            disabled={!tradersFolder || createTrader.isPending}
            onClick={() => {
              const raw = prompt(
                "New trader filename (without .json). Alphanumeric + underscore only.",
              );
              if (!raw) return;
              const slug = raw.replace(/[^A-Za-z0-9_]/g, "").trim();
              if (!slug) {
                toast.error("invalid name");
                return;
              }
              createTrader.mutate(slug);
            }}
          >
            <Plus className="mr-1 h-3 w-3" /> New trader
          </Button>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {selectedPath ? (
            <TraderEditor
              path={selectedPath}
              marketCategoryNames={marketCategoryNames}
              knownClassnames={knownClassnames}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a trader on the left.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link to="/app/mods" className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60">
        <ArrowLeft className="h-3 w-3" /> Mods
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <Link to="/app/mods/expansion" className="hover:underline">
        Expansion
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">Traders</span>
    </nav>
  );
}

function TraderEditor({
  path,
  marketCategoryNames,
  knownClassnames,
}: {
  path: string;
  marketCategoryNames: string[];
  knownClassnames: string[];
}) {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: profileId ? ["expansion-trader", profileId, path] : ["none"],
    queryFn: async () => {
      const raw = await tauri.expansionSettingsRead(profileId!, path);
      return { raw, data: JSON.parse(raw) as Trader };
    },
    enabled: !!profileId,
  });

  const save = useMutation({
    mutationFn: async (data: Trader) => {
      if (!profileId) throw new Error("no profile");
      await tauri.expansionSettingsWrite(
        profileId,
        path,
        JSON.stringify(data, null, 4),
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["expansion-trader", profileId, path],
      });
      toast.success("saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [draft, setDraft] = useState<Trader | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data.data);
  }, [query.data, path]);

  if (query.isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{errorMessage(query.error)}</AlertDescription>
      </Alert>
    );
  }

  const traderStem = path.split("/").pop()!.replace(/\.json$/i, "");
  const dirty =
    query.data != null && JSON.stringify(draft) !== JSON.stringify(query.data.data);

  const update = <K extends keyof Trader>(key: K, value: Trader[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>{traderStem}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {path}
            </Badge>
            {dirty ? (
              <Badge
                variant="secondary"
                className="border-severity-warning/40 text-severity-warning"
              >
                unsaved
              </Badge>
            ) : null}
            <div className="ml-auto flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => query.data && setDraft(query.data.data)}
                disabled={!dirty || save.isPending}
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Revert
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => save.mutate(draft)}
                disabled={!dirty || save.isPending}
              >
                {save.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3 w-3" />
                )}
                Save
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="dn">Display name</Label>
              <Input
                id="dn"
                value={draft.DisplayName}
                onChange={(e) => update("DisplayName", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                String-table key (e.g.{" "}
                <code>#STR_EXPANSION_MARKET_TRADER_AIRCRAFT</code>).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icon">Trader icon</Label>
              <Input
                id="icon"
                value={draft.TraderIcon}
                onChange={(e) => update("TraderIcon", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>m_Version</Label>
              <Input
                type="number"
                value={draft.m_Version}
                onChange={(e) =>
                  update("m_Version", Number(e.target.value) || 0)
                }
              />
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Min reputation</Label>
              <Input
                type="number"
                value={draft.MinRequiredReputation}
                onChange={(e) =>
                  update(
                    "MinRequiredReputation",
                    Number(e.target.value) || 0,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max reputation</Label>
              <Input
                type="number"
                value={draft.MaxRequiredReputation}
                onChange={(e) =>
                  update(
                    "MaxRequiredReputation",
                    Number(e.target.value) || 0,
                  )
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Use a very large number (2147483647 / int32 max) for
                "no cap".
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Required faction</Label>
              <FactionPicker
                value={draft.RequiredFaction}
                onChange={(v) => update("RequiredFaction", v)}
                treatEmptyAsAny
              />
            </div>
            <div className="space-y-1.5">
              <Label>Required completed quest</Label>
              <QuestPicker
                value={draft.RequiredCompletedQuestID}
                onChange={(n) =>
                  update("RequiredCompletedQuestID", n)
                }
                noneValue={-1}
              />
              <p className="text-[10px] text-muted-foreground">
                Pick a quest from the workspace or type -1 to leave
                the trader open to any player.
              </p>
            </div>
          </section>

          <section className="space-y-1.5">
            <Label>Currencies</Label>
            <TokenInput
              value={draft.Currencies ?? []}
              onChange={(v) => update("Currencies", v)}
              suggestions={knownClassnames}
              placeholder="expansionbanknotehryvnia"
            />
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-end gap-2">
                <Switch
                  id="dcv"
                  checked={draft.DisplayCurrencyValue === 1}
                  onCheckedChange={(v) =>
                    update("DisplayCurrencyValue", v ? 1 : 0)
                  }
                />
                <Label htmlFor="dcv" className="cursor-pointer">
                  Display currency value
                </Label>
              </div>
              <div className="flex items-end gap-2">
                <Switch
                  id="uco"
                  checked={draft.UseCategoryOrder === 1}
                  onCheckedChange={(v) =>
                    update("UseCategoryOrder", v ? 1 : 0)
                  }
                />
                <Label htmlFor="uco" className="cursor-pointer">
                  Use category order
                </Label>
              </div>
              <div className="space-y-1">
                <Label>Display currency name</Label>
                <Input
                  value={draft.DisplayCurrencyName}
                  onChange={(e) =>
                    update("DisplayCurrencyName", e.target.value)
                  }
                  placeholder="empty = default"
                />
              </div>
            </div>
          </section>

          <CategoryPicker
            value={draft.Categories ?? []}
            onChange={(v) => update("Categories", v)}
            marketCategoryNames={marketCategoryNames}
          />

          <ItemsMapEditor
            value={draft.Items ?? {}}
            onChange={(v) => update("Items", v)}
            knownClassnames={knownClassnames}
          />

          <p className="text-[10px] text-muted-foreground">
            <a
              href="https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/Market"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Expansion Market wiki
            </a>{" "}
            documents tier suffixes (<code>:1</code>..<code>:3</code>)
            and faction semantics.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryPicker({
  value,
  onChange,
  marketCategoryNames,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  marketCategoryNames: string[];
}) {
  const [draftName, setDraftName] = useState("");
  const [draftTier, setDraftTier] = useState<string>("none");

  const add = () => {
    const name = draftName.trim();
    if (!name) return;
    const tier = draftTier === "none" ? null : Number(draftTier);
    const ref = joinCategoryRef(name, tier);
    if (value.includes(ref)) return;
    onChange([...value, ref]);
    setDraftName("");
    setDraftTier("none");
  };

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm">
          Categories ({value.length})
        </Label>
        <Badge variant="outline" className="text-[10px]">
          <Users className="mr-1 h-2.5 w-2.5" />
          linked to <code className="ml-1 font-mono">Market/</code>
        </Badge>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          No categories yet. This trader shows nothing to players
          until at least one Market category is added.
        </p>
      ) : (
        <ul className="space-y-1">
          {value.map((ref, idx) => {
            const { name, tier } = splitCategoryRef(ref);
            const exists = marketCategoryNames.some(
              (m) => m.toLowerCase() === name.toLowerCase(),
            );
            return (
              <li
                key={`${ref}-${idx}`}
                className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-xs"
              >
                <Package className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="font-mono">{name}</span>
                {tier != null ? (
                  <Badge variant="outline" className="text-[10px]">
                    tier {tier}
                  </Badge>
                ) : null}
                {!exists ? (
                  <Badge
                    variant="outline"
                    className="border-severity-warning/40 text-[10px] text-severity-warning"
                    title="No Market/<name>.json file — this category won't render"
                  >
                    missing
                  </Badge>
                ) : null}
                {exists ? (
                  <Link
                    to={`/app/mods/expansion/market?name=${encodeURIComponent(name)}`}
                    className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-primary hover:bg-primary/10"
                  >
                    Edit category
                    <ArrowRight className="h-2.5 w-2.5" />
                  </Link>
                ) : (
                  <span className="ml-auto" />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => remove(idx)}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label className="text-[11px]">Add category</Label>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            list="market-categories"
            placeholder="category name (matches a file under Market/)"
            className="h-8 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <datalist id="market-categories">
            {marketCategoryNames.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-[11px]">Tier</Label>
          <Select value={draftTier} onValueChange={setDraftTier}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">none</SelectItem>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={add}
        >
          <Plus className="mr-1 h-3 w-3" /> Add
        </Button>
      </div>
    </section>
  );
}

function ItemsMapEditor({
  value,
  onChange,
  knownClassnames,
}: {
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  knownClassnames: string[];
}) {
  const entries = useMemo(() => Object.entries(value), [value]);
  const [newClass, setNewClass] = useState("");
  const getMutedState = useMutedClassnameReason();

  const addEntry = () => {
    const key = newClass.trim();
    if (!key) return;
    if (key in value) return;
    onChange({ ...value, [key]: 1 });
    setNewClass("");
  };

  const removeEntry = (k: string) => {
    const next = { ...value };
    delete next[k];
    onChange(next);
  };

  const updatePriority = (k: string, n: number) => {
    onChange({ ...value, [k]: n });
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-sm">
          Extra items ({entries.length})
        </Label>
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
        <p className="text-[10px] text-muted-foreground">
          Items sold by this trader outside any category. Priority 0 =
          hidden on price board; 1 = shown.
        </p>
      </div>
      {entries.length > 0 ? (
        <ul className="divide-y divide-border/50 rounded-md border border-border/60">
          {entries.map(([k, n]) => (
            <li key={k} className="flex items-center gap-2 px-2 py-1 text-xs">
              <Coins className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{k}</span>
              <Input
                type="number"
                value={n}
                onChange={(e) =>
                  updatePriority(k, Number(e.target.value) || 0)
                }
                className="ml-auto h-7 w-20 text-right text-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => removeEntry(k)}
                title="Remove"
              >
                <Trash2 className="h-3 w-3 text-severity-error" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <ClassnamePicker
            value={newClass}
            onChange={setNewClass}
            known={knownClassnames}
            placeholder="classname"
            getMutedState={getMutedState}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          onClick={addEntry}
          disabled={!newClass.trim()}
        >
          <Plus className="mr-1 h-3 w-3" /> Add item
        </Button>
      </div>
    </section>
  );
}
