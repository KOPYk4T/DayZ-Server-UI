import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Code,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { errorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonacoXmlViewer } from "@/components/MonacoXmlViewer";
import {
  useItemRawXml,
  useItemsDelete,
  useItemsDisable,
  useItemsUpsert,
  useSerializePreview,
} from "@/hooks/useItems";
import { ItemForm } from "@/features/items/ItemForm";
import { ItemLinkedInPanel } from "@/features/items/ItemLinkedInPanel";
import { getItemLinks } from "@/features/items/linkedIn";
import { useItemLinkIndexes } from "@/features/items/useItemLinks";
import { WikiItemImage } from "@/features/wiki-images/WikiItemImage";
import type { ItemType, ItemsSnapshot } from "@/types/ipc";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  item: ItemType | null;
  snapshot?: ItemsSnapshot;
  onCloned: (cloneName: string) => void;
  /** Navigate within the items list (e.g. when a Linked-In row points
   *  at another item that itself has a registry entry). */
  onSelectItem?: (name: string) => void;
}

export function ItemDetailDrawer({
  open,
  onOpenChange,
  item,
  snapshot,
  onCloned,
  onSelectItem,
}: Props) {
  const [draft, setDraft] = useState<ItemType | null>(item);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    setDraft(item);
  }, [item?.name]);

  const isVanilla = item?.source === "vanilla";
  const isCustom = item?.source === "custom";

  const upsert = useItemsUpsert();
  const del = useItemsDelete();
  const disable = useItemsDisable();
  const preview = useSerializePreview();

  const rawXml = useItemRawXml(open && item ? item.name : null);

  const [previewXml, setPreviewXml] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !draft) {
      setPreviewXml(null);
      return;
    }
    preview.mutate([draft], {
      onSuccess: (xml) => setPreviewXml(xml),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  const dirty = useMemo(() => {
    if (!item || !draft) return false;
    return JSON.stringify(item) !== JSON.stringify(draft);
  }, [item, draft]);

  const save = () => {
    if (!draft) return;
    upsert.mutate([draft], {
      onSuccess: () => {
        toast.success(`saved ${draft.name}`, {
          description: isVanilla
            ? "override written to custom/types_custom.xml"
            : undefined,
        });
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const clone = () => {
    if (!item) return;
    const base = draft ?? item;
    const candidate = nextCloneName(
      base.name,
      new Set(snapshot?.items.map((i) => i.name) ?? []),
    );
    const cloned: ItemType = {
      ...base,
      name: candidate,
      source: "custom",
      modId: null,
      file: "",
    };
    upsert.mutate([cloned], {
      onSuccess: () => {
        toast.success(`created ${candidate}`);
        onCloned(candidate);
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const runDelete = () => {
    if (!item) return;
    del.mutate([item.name], {
      onSuccess: () => {
        toast.success(`removed override for ${item.name}`);
        setConfirmDelete(false);
        onOpenChange(false);
      },
      onError: (err) => {
        toast.error(errorMessage(err));
        setConfirmDelete(false);
      },
    });
  };

  const runDisable = () => {
    if (!item) return;
    disable.mutate([item.name], {
      onSuccess: () => {
        toast.success(`disabled ${item.name}`, {
          description: "override set nominal and min to 0",
        });
        setConfirmDisable(false);
      },
      onError: (err) => {
        toast.error(errorMessage(err));
        setConfirmDisable(false);
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:w-[44rem] md:w-[52rem] lg:w-[58rem] xl:w-[64rem] !max-w-[92vw]"
      >
        <SheetHeader className="border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            {item ? (
              <WikiItemImage classname={item.name} size="md" />
            ) : null}
            <SheetTitle className="font-mono">{item?.name ?? ""}</SheetTitle>
            {item ? (
              <Badge variant="outline" className="uppercase">
                {item.source}
              </Badge>
            ) : null}
          </div>
          <SheetDescription className="text-xs">
            {item?.file || "—"}
          </SheetDescription>
        </SheetHeader>

        {item && draft ? (
          <Tabs defaultValue="form" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-6 mt-3 w-fit">
              <TabsTrigger value="form">
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Fields
              </TabsTrigger>
              <LinkedInTabTrigger itemName={item.name} />
              <TabsTrigger value="diff">
                <Code className="mr-1.5 h-3.5 w-3.5" /> XML preview
              </TabsTrigger>
              <TabsTrigger value="raw">Raw</TabsTrigger>
            </TabsList>

            <TabsContent
              value="linked"
              className="min-h-0 flex-1 overflow-y-auto pb-24"
            >
              <ItemLinkedInPanel
                itemName={item.name}
                onNavigateToItem={(next) => {
                  if (onSelectItem && next !== item.name) onSelectItem(next);
                }}
              />
            </TabsContent>

            <TabsContent
              value="form"
              className="min-h-0 flex-1 overflow-y-auto px-6 pb-24 pt-4"
            >
              {isVanilla ? (
                <p className="mb-3 rounded-md border border-severity-warning/30 bg-severity-warning/5 p-2 text-xs text-severity-warning">
                  Vanilla item — saving will write an override to{" "}
                  <code>custom/types_custom.xml</code>, leaving{" "}
                  <code>db/types.xml</code> untouched.
                </p>
              ) : null}
              <ItemForm
                value={draft}
                onChange={setDraft}
                categories={snapshot?.categories ?? []}
                usages={snapshot?.usages ?? []}
                values={snapshot?.values ?? []}
                tags={snapshot?.tags ?? []}
                classnameLocked
              />
            </TabsContent>

            <TabsContent value="diff" className="min-h-0 flex-1 px-0 pb-16">
              <div className="h-full min-h-[300px] border-t border-border/60">
                <MonacoXmlViewer
                  value={previewXml ?? ""}
                  readOnly
                  language="xml"
                />
              </div>
            </TabsContent>

            <TabsContent value="raw" className="min-h-0 flex-1 px-0 pb-16">
              <div className="h-full min-h-[300px] border-t border-border/60">
                <MonacoXmlViewer
                  value={rawXml.data ?? ""}
                  readOnly
                  language="xml"
                />
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex-1 p-6 text-sm text-muted-foreground">
            Pick an item from the list.
          </div>
        )}

        {item ? (
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border/60 bg-card/60 px-6 py-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={clone}
                disabled={upsert.isPending}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Clone
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDisable(true)}
                disabled={disable.isPending}
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Disable
              </Button>
              {isCustom ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={del.isPending}
                  className="text-severity-error"
                  title="Remove this item's entry from custom/types_custom.xml"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove override
                </Button>
              ) : null}
            </div>
            <Button
              size="sm"
              onClick={save}
              disabled={!dirty || upsert.isPending}
              className="ml-auto"
            >
              {upsert.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save
            </Button>
          </div>
        ) : null}
      </SheetContent>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove override?</AlertDialogTitle>
            <AlertDialogDescription>
              Deletes this item's entry from{" "}
              <code>custom/types_custom.xml</code>. The vanilla definition
              (if any) takes over again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runDelete}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable this item?</AlertDialogTitle>
            <AlertDialogDescription>
              Writes an override with <code>nominal</code> and{" "}
              <code>min</code> set to 0 so the CE stops spawning it. The item
              entry stays present so you can re-enable later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runDisable} disabled={disable.isPending}>
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function nextCloneName(base: string, existing: Set<string>): string {
  let candidate = `${base}_custom`;
  let n = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_custom_${n}`;
    n += 1;
  }
  return candidate;
}

function LinkedInTabTrigger({ itemName }: { itemName: string }) {
  const { indexes } = useItemLinkIndexes();
  const links = getItemLinks(indexes, itemName);
  const count =
    (links.loadout ? 1 : 0) +
    links.usedInLoadouts.length +
    links.usedInEvents.length +
    links.usedInPresets.length;
  return (
    <TabsTrigger value="linked">
      <Link2 className="mr-1.5 h-3.5 w-3.5" /> Linked In
      {count > 0 ? (
        <Badge
          variant="outline"
          className="ml-1.5 h-4 min-w-[1.25rem] justify-center border-primary/40 px-1 text-[9px] text-primary"
        >
          {count}
        </Badge>
      ) : null}
    </TabsTrigger>
  );
}
