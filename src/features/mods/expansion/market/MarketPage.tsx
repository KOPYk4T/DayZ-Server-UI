import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Coins,
  ExternalLink,
  FileJson2,
  Loader2,
  Package,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Users,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TokenInput } from "@/components/TokenInput";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useModsScan } from "@/hooks/useMods";
import { errorMessage } from "@/lib/utils";

import {
  DEFAULT_MARKET_CATEGORY,
  DEFAULT_MARKET_ITEM,
  type MarketCategory,
  type MarketItem,
} from "./types";
import {
  useMarketCategory,
  useMarketCategoryList,
  useMarketCategorySave,
  useTradersIndex,
} from "./useMarketData";

export function MarketPage() {
  const modsScan = useModsScan();
  const inv = modsScan.data?.expansion ?? null;
  const list = useMarketCategoryList(inv);
  const tradersIndex = useTradersIndex(inv);
  const items = useItemsSnapshot();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlName = searchParams.get("name");

  const categoryFiles = useMemo(() => {
    const all =
      list.data?.entries.filter(
        (e) => !e.isDir && e.extension === "json",
      ) ?? [];
    return [...all].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
  }, [list.data]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");

  // Honour the ?name=... URL parameter so the Traders editor can
  // deep-link to a specific category.
  useEffect(() => {
    if (!urlName || categoryFiles.length === 0) return;
    const match = categoryFiles.find(
      (e) => e.name.replace(/\.json$/i, "").toLowerCase() === urlName.toLowerCase(),
    );
    if (match) setSelectedPath(match.relativePath);
  }, [urlName, categoryFiles]);

  // Default to the first category once data loads.
  useEffect(() => {
    if (selectedPath || categoryFiles.length === 0 || urlName) return;
    setSelectedPath(categoryFiles[0].relativePath);
  }, [selectedPath, categoryFiles, urlName]);

  const filteredFiles = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    if (!q) return categoryFiles;
    return categoryFiles.filter((e) => e.name.toLowerCase().includes(q));
  }, [categoryFiles, listFilter]);

  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );

  if (!inv) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Breadcrumb />
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            DayZ Expansion isn't detected in this workspace. Pull
            first, then boot the server once so Expansion writes its
            folder layout.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Breadcrumb />
      <header className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Market categories</h1>
          <Badge variant="secondary">
            {categoryFiles.length} categor
            {categoryFiles.length === 1 ? "y" : "ies"}
          </Badge>
        </div>
      </header>
      <p className="text-xs text-muted-foreground">
        Prices, stock, and buy/sell limits per classname — each
        category is a file traders reference by name.
      </p>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] gap-4">
        <aside className="flex min-h-0 flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value)}
              placeholder="Filter categories"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {list.isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {filteredFiles.map((f) => {
                const stem = f.name.replace(/\.json$/i, "");
                const usedBy =
                  tradersIndex.data?.usage.get(stem.toLowerCase()) ?? [];
                const isSelected = selectedPath === f.relativePath;
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
                        isSelected
                          ? "bg-primary/10 font-semibold text-primary"
                          : "hover:bg-muted/60"
                      }`}
                    >
                      <Package className="h-3 w-3 shrink-0" />
                      <span className="truncate">{stem}</span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {usedBy.length > 0 ? `${usedBy.length}T` : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <NewCategoryButton
            marketPath={
              inv.dataFolders.find((d) => d.name === "Market")?.relativePath ??
              null
            }
            onCreated={(path) => {
              void list.refetch();
              setSelectedPath(path);
            }}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {selectedPath ? (
            <CategoryEditor
              path={selectedPath}
              tradersIndex={tradersIndex.data?.usage ?? new Map()}
              knownClassnames={knownClassnames}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a category on the left.
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
      <Link
        to="/app/mods"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60"
      >
        <ArrowLeft className="h-3 w-3" /> Mods
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <Link to="/app/mods/expansion" className="hover:underline">
        Expansion
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">Market</span>
    </nav>
  );
}

function NewCategoryButton({
  marketPath,
  onCreated,
}: {
  marketPath: string | null;
  onCreated: (path: string) => void;
}) {
  const save = useMarketCategorySave();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-1 h-8 text-xs"
      disabled={!marketPath || save.isPending}
      onClick={() => {
        const raw = prompt(
          "New category filename (without .json). Alphanumeric + underscore only.",
        );
        if (!raw || !marketPath) return;
        const slug = raw.replace(/[^A-Za-z0-9_]/g, "").trim();
        if (!slug) {
          toast.error("invalid name");
          return;
        }
        const path = `${marketPath}/${slug}.json`;
        save.mutate(
          { path, data: { ...DEFAULT_MARKET_CATEGORY, DisplayName: slug } },
          {
            onSuccess: () => {
              toast.success(`created ${slug}.json`);
              onCreated(path);
            },
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      }}
    >
      <Plus className="mr-1 h-3 w-3" /> New category
    </Button>
  );
}

function CategoryEditor({
  path,
  tradersIndex,
  knownClassnames,
}: {
  path: string;
  tradersIndex: Map<string, { traderName: string; tier: number | null }[]>;
  knownClassnames: string[];
}) {
  const query = useMarketCategory(path);
  const save = useMarketCategorySave();
  const getMutedState = useMutedClassnameReason();
  const [draft, setDraft] = useState<MarketCategory | null>(null);
  const [itemFilter, setItemFilter] = useState("");

  // Reset draft whenever the selected path or server copy changes.
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

  const categoryStem = path
    .split("/")
    .pop()!
    .replace(/\.json$/i, "");
  const usedBy = tradersIndex.get(categoryStem.toLowerCase()) ?? [];
  const dirty =
    query.data != null && JSON.stringify(draft) !== JSON.stringify(query.data.data);

  const updateField = <K extends keyof MarketCategory>(
    key: K,
    value: MarketCategory[K],
  ) => setDraft({ ...draft, [key]: value });

  const updateItem = (idx: number, patch: Partial<MarketItem>) => {
    const next = [...draft.Items];
    next[idx] = { ...next[idx], ...patch };
    setDraft({ ...draft, Items: next });
  };

  const removeItem = (idx: number) => {
    setDraft({ ...draft, Items: draft.Items.filter((_, i) => i !== idx) });
  };

  const addItem = () => {
    setDraft({
      ...draft,
      Items: [...draft.Items, { ...DEFAULT_MARKET_ITEM }],
    });
  };

  const onSave = () => {
    save.mutate(
      { path, data: draft },
      {
        onSuccess: () => toast.success(`saved ${categoryStem}`),
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const filteredItems = draft.Items.map((it, idx) => ({ it, idx })).filter(
    ({ it }) => {
      const q = itemFilter.trim().toLowerCase();
      return !q || it.ClassName.toLowerCase().includes(q);
    },
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>{categoryStem}</span>
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
                onClick={onSave}
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
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="displayname">Display name</Label>
              <Input
                id="displayname"
                value={draft.DisplayName}
                onChange={(e) => updateField("DisplayName", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                String-table key, e.g. <code>#STR_EXPANSION_MARKET_CATEGORY_AMMO</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="icon">Icon</Label>
              <Input
                id="icon"
                value={draft.Icon}
                onChange={(e) => updateField("Icon", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color">Color (RRGGBBAA)</Label>
              <div className="flex gap-2">
                <span
                  className="h-8 w-8 shrink-0 rounded border border-border/60"
                  style={{ background: `#${draft.Color.slice(0, 6)}` }}
                />
                <Input
                  id="color"
                  value={draft.Color}
                  onChange={(e) => updateField("Color", e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="flex items-end gap-2">
              <Switch
                id="isexchange"
                checked={draft.IsExchange === 1}
                onCheckedChange={(v) =>
                  updateField("IsExchange", v ? 1 : 0)
                }
              />
              <Label htmlFor="isexchange" className="cursor-pointer">
                Exchange category
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="initstock">Initial stock %</Label>
              <Input
                id="initstock"
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.InitStockPercent}
                onChange={(e) =>
                  updateField(
                    "InitStockPercent",
                    Number(e.target.value) || 0,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>m_Version</Label>
              <Input
                type="number"
                value={draft.m_Version}
                onChange={(e) =>
                  updateField("m_Version", Number(e.target.value) || 0)
                }
              />
            </div>
          </div>

          {usedBy.length > 0 ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold">
                <Users className="h-3 w-3" /> Used by {usedBy.length}{" "}
                trader{usedBy.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-1">
                {usedBy.map((u) => (
                  <Link
                    key={`${u.traderName}:${u.tier ?? "x"}`}
                    to={`/app/mods/expansion/traders?name=${encodeURIComponent(
                      u.traderName,
                    )}`}
                    className="inline-flex items-center gap-1 rounded border border-primary/40 bg-background px-1.5 py-0.5 font-mono text-[10px] hover:bg-primary/10"
                  >
                    {u.traderName}
                    {u.tier != null ? (
                      <span className="text-muted-foreground">
                        :{u.tier}
                      </span>
                    ) : null}
                    <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              No trader in <code>Traders/</code> references this
              category — items here won't appear in any trader's UI
              until you add <code>{categoryStem}</code> to at least
              one trader's Categories list.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center gap-2 py-3">
          <CardTitle className="text-sm">
            Items ({draft.Items.length})
          </CardTitle>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              placeholder="Filter by classname"
              className="h-7 w-56 pl-7 text-xs"
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="mr-1 h-3 w-3" /> Add item
          </Button>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              {draft.Items.length === 0
                ? "No items yet — click Add item to start."
                : "No items match the filter."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Classname</th>
                    <th className="px-2 py-1 text-right">Min price</th>
                    <th className="px-2 py-1 text-right">Max price</th>
                    <th className="px-2 py-1 text-right">Min stock</th>
                    <th className="px-2 py-1 text-right">Max stock</th>
                    <th className="px-2 py-1 text-right">Sell %</th>
                    <th className="px-2 py-1 text-right">Qty %</th>
                    <th className="px-2 py-1 text-left">Attachments</th>
                    <th className="px-2 py-1 text-left">Variants</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredItems.map(({ it, idx }) => (
                    <tr key={idx} className="align-top">
                      <td className="px-2 py-1 min-w-[200px]">
                        <ClassnamePicker
                          value={it.ClassName}
                          onChange={(v) =>
                            updateItem(idx, { ClassName: v })
                          }
                          known={knownClassnames}
                          getMutedState={getMutedState}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={it.MinPriceThreshold}
                          onChange={(e) =>
                            updateItem(idx, {
                              MinPriceThreshold:
                                Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-right text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={it.MaxPriceThreshold}
                          onChange={(e) =>
                            updateItem(idx, {
                              MaxPriceThreshold:
                                Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-right text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={it.MinStockThreshold}
                          onChange={(e) =>
                            updateItem(idx, {
                              MinStockThreshold:
                                Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-right text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={it.MaxStockThreshold}
                          onChange={(e) =>
                            updateItem(idx, {
                              MaxStockThreshold:
                                Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-right text-xs"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          step="0.1"
                          value={it.SellPricePercent}
                          onChange={(e) =>
                            updateItem(idx, {
                              SellPricePercent:
                                Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-right text-xs"
                          title="-1 = use global default"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          value={it.QuantityPercent}
                          onChange={(e) =>
                            updateItem(idx, {
                              QuantityPercent:
                                Number(e.target.value) || 0,
                            })
                          }
                          className="h-7 text-right text-xs"
                          title="-1 = use item default"
                        />
                      </td>
                      <td className="px-1 py-1 min-w-[180px]">
                        <TokenInput
                          value={it.SpawnAttachments ?? []}
                          onChange={(v) =>
                            updateItem(idx, { SpawnAttachments: v })
                          }
                          suggestions={knownClassnames}
                          placeholder="classname"
                        />
                      </td>
                      <td className="px-1 py-1 min-w-[180px]">
                        <TokenInput
                          value={it.Variants ?? []}
                          onChange={(v) =>
                            updateItem(idx, { Variants: v })
                          }
                          suggestions={knownClassnames}
                          placeholder="variant classname"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeItem(idx)}
                          title="Remove item"
                        >
                          <Trash2 className="h-3 w-3 text-severity-error" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-[10px] text-muted-foreground">
            <FileJson2 className="mr-0.5 inline h-2.5 w-2.5" />
            Any extra fields Expansion adds (custom mod metadata)
            are preserved on save. See the{" "}
            <a
              href="https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/Market"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Market wiki
            </a>{" "}
            for field semantics.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
