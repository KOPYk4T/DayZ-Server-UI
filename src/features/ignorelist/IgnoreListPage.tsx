import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClassnamePicker } from "@/components/ClassnamePicker";
import { Input } from "@/components/ui/input";
import { useItemsSnapshot } from "@/hooks/useItems";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

/**
 * `cfgignorelist.xml` editor — classnames CE shouldn't spawn even
 * if they're registered in types.xml. Simple list: add / remove /
 * search. Uses the items registry for autocomplete so operators
 * pick valid names (though DayZ accepts anything).
 */
export function IgnoreListPage() {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: profileId ? ["cfg-ignorelist", profileId] : ["cfg-ignorelist", "none"],
    queryFn: () => tauri.cfgIgnorelistGet(profileId!),
    enabled: !!profileId,
  });

  const update = useMutation({
    mutationFn: (classnames: string[]) =>
      tauri.cfgIgnorelistUpdate(profileId!, classnames),
    onSuccess: (r) => {
      if (profileId) {
        qc.setQueryData(["cfg-ignorelist", profileId], r);
      }
      toast.success("cfgignorelist.xml saved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = useItemsSnapshot();
  const knownClassnames = useMemo(
    () => items.data?.items.map((i) => i.name) ?? [],
    [items.data],
  );

  const [draft, setDraft] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [addValue, setAddValue] = useState("");

  useEffect(() => {
    if (query.data) setDraft(query.data.classnames);
  }, [query.data?.classnames]);

  if (!active) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a profile first.
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const snapshot = query.data;
  if (!snapshot) return null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.classnames);
  const filterQ = filter.trim().toLowerCase();
  const visible = filterQ
    ? draft.filter((n) => n.toLowerCase().includes(filterQ))
    : draft;

  const addRow = (name?: string) => {
    const v = (name ?? addValue).trim();
    if (!v) return;
    if (draft.includes(v)) {
      toast.error(`${v} is already in the list`);
      return;
    }
    setDraft([...draft, v]);
    setAddValue("");
  };
  const removeRow = (idx: number) => {
    // idx is an index in `visible`; map back to draft.
    const target = visible[idx];
    setDraft(draft.filter((n) => n !== target));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={EyeOff}
        title="CE ignore list"
        description="cfgignorelist.xml — classnames CE skips loading at runtime."
        badges={
          <>
            <Badge variant="secondary">{draft.length}</Badge>
            {dirty ? (
              <Badge
                variant="outline"
                className="border-severity-warning/40 text-severity-warning"
              >
                unsaved
              </Badge>
            ) : null}
          </>
        }
        path={snapshot.fileDisplay}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(snapshot.classnames)}
              disabled={!dirty || update.isPending}
            >
              <RotateCcw className="mr-1 h-3 w-3" /> Revert
            </Button>
            <Button
              size="sm"
              onClick={() => update.mutate(draft)}
              disabled={!dirty || update.isPending}
            >
              {update.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Save className="mr-1 h-3 w-3" />
              )}
              Save
            </Button>
          </>
        }
      />

      <div className="flex h-full flex-col gap-3 overflow-y-auto p-6">
      <Alert>
        <EyeOff className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Classnames here are excluded from CE spawn pools — even if
          they're registered in <code>types.xml</code>. Common use:
          hide DLC / mod items you never want dropping loot.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter ignore list"
            className="h-8 w-72 pl-7 text-xs"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="w-72">
            <ClassnamePicker
              value={addValue}
              onChange={setAddValue}
              known={knownClassnames}
              placeholder="Classname to ignore"
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => addRow()}
            disabled={!addValue.trim()}
          >
            <Plus className="mr-1 h-3 w-3" /> Add
          </Button>
        </div>
      </div>

      {draft.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing on the ignore list. Add a classname above to keep
          CE from spawning it.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
          {visible.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1 font-mono text-xs"
            >
              <span className="flex-1 truncate">{name}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-severity-error"
                onClick={() => removeRow(i)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
