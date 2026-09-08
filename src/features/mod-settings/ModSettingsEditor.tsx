import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ExternalLink,
  FileJson2,
  Loader2,
  RotateCcw,
  Save,
  SlidersHorizontal,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { schemaFor } from "@/features/mods/expansion/schemas";
import { TypedSettingsForm } from "@/features/mods/expansion/TypedSettingsForm";
import {
  useProfileJsonFile,
  useProfileJsonsDelete,
  useProfileJsonsWrite,
} from "@/hooks/useProfileJsons";
import { errorMessage } from "@/lib/utils";
import type { ProfileJsonFile } from "@/types/ipc";

import { GenericJsonForm } from "./GenericJsonForm";

interface Props {
  file: ProfileJsonFile;
  onDeleted?: () => void;
}

export function ModSettingsEditor({ file, onDeleted }: Props) {
  const query = useProfileJsonFile(file.relativePath);
  const write = useProfileJsonsWrite();
  const remove = useProfileJsonsDelete();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const expansionSchema = useMemo(() => {
    if (!/\/expansionmod\//i.test(file.relativePath)) return null;
    return schemaFor(file.name);
  }, [file.name, file.relativePath]);

  const [draft, setDraft] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [tab, setTab] = useState<"form" | "raw">("form");

  useEffect(() => {
    if (query.data != null) {
      setDraft(query.data);
      setJsonError(null);
    }
  }, [query.data, file.relativePath]);

  useEffect(() => {
    setTab("form");
  }, [file.relativePath]);

  const parsed = useMemo(() => safeParse(draft), [draft]);
  const dirty = query.data != null && draft !== query.data;
  const parsedVersion =
    parsed && typeof parsed.m_Version === "number"
      ? (parsed.m_Version as number)
      : null;

  const handleSave = () => {
    try {
      const top = JSON.parse(draft);
      if (!top || typeof top !== "object" || Array.isArray(top)) {
        setJsonError("top-level value must be a JSON object");
        setTab("raw");
        return;
      }
      setJsonError(null);
      write.mutate(
        { relativePath: file.relativePath, content: draft },
        {
          onSuccess: () => toast.success(`saved ${file.fileName}`),
          onError: (err) => toast.error(errorMessage(err)),
        },
      );
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
      setTab("raw");
    }
  };

  const revert = () => {
    if (query.data != null) {
      setDraft(query.data);
      setJsonError(null);
    }
  };

  const applyParsed = (obj: Record<string, unknown>) => {
    setDraft(JSON.stringify(obj, null, 4));
    setJsonError(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {expansionSchema?.title ?? file.name}
            </h2>
            {parsedVersion !== null ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                m_Version: {parsedVersion}
              </Badge>
            ) : null}
          </div>
          <code className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {file.relativePath}
          </code>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={write.isPending || remove.isPending}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={revert}
            disabled={!dirty || write.isPending || remove.isPending}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Revert
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || write.isPending || remove.isPending || query.isLoading}
          >
            {write.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" /> Save
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {file.dedicatedRoute ? (
          <Alert className="mb-4">
            <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
              This file has a dedicated Expansion editor.
              <Link
                to={file.dedicatedRoute}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
              >
                Open in Expansion
                <ExternalLink className="h-3 w-3" />
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {query.isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{errorMessage(query.error)}</AlertDescription>
          </Alert>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "form" | "raw")}
            className="gap-3"
          >
            <TabsList>
              <TabsTrigger value="form">
                <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Settings
              </TabsTrigger>
              <TabsTrigger value="raw">
                <FileJson2 className="mr-1.5 h-3.5 w-3.5" /> Raw JSON
              </TabsTrigger>
            </TabsList>
            <TabsContent value="form">
              {parsed ? (
                expansionSchema ? (
                  <TypedSettingsForm
                    schema={expansionSchema}
                    data={parsed}
                    onChange={applyParsed}
                  />
                ) : (
                  <GenericJsonForm data={parsed} onChange={applyParsed} />
                )
              ) : (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Can't render the form because the JSON doesn't parse.
                    Switch to Raw JSON to fix syntax, then come back.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
            <TabsContent value="raw">
              <Textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (jsonError) setJsonError(null);
                }}
                spellCheck={false}
                className="min-h-[50vh] resize-y font-mono text-xs leading-relaxed"
              />
              {jsonError ? (
                <Alert variant="destructive" className="mt-3">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="font-mono text-xs">
                    {jsonError}
                  </AlertDescription>
                </Alert>
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {file.fileName}?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Removes this file from the workspace and auto-commits. The
              live server is unchanged until you Copy to Local / Send to
              production. Irreversible from the UI — restore from git if
              you need it back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(file.relativePath, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    toast.success(`deleted ${file.fileName}`);
                    onDeleted?.();
                  },
                  onError: (err) => toast.error(errorMessage(err)),
                });
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete file"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return null;
}
