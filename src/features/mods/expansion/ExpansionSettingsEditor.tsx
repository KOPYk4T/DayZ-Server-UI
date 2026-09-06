import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileJson2,
  Loader2,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import type { ExpansionSettingsFile } from "@/types/ipc";

import { schemaFor, type SettingsSchema } from "./schemas";
import { TypedSettingsForm } from "./TypedSettingsForm";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  file: ExpansionSettingsFile | null;
}

export function ExpansionSettingsEditor({ open, onOpenChange, file }: Props) {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const qc = useQueryClient();

  const query = useQuery<string>({
    queryKey:
      file && profileId
        ? ["expansion-settings", profileId, file.relativePath]
        : ["expansion-settings", "__none__"],
    queryFn: () => tauri.expansionSettingsRead(profileId!, file!.relativePath),
    enabled: !!(open && file && profileId),
    staleTime: 0,
  });

  const schema = useMemo(
    () => (file ? schemaFor(file.name) : null),
    [file],
  );

  // Raw text holds the authoritative editable JSON. The typed view
  // derives a parsed object from this and emits new JSON text on
  // every change, keeping both views in sync.
  const [draft, setDraft] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [tab, setTab] = useState<"typed" | "raw">(schema ? "typed" : "raw");

  useEffect(() => {
    if (query.data != null) {
      setDraft(query.data);
      setJsonError(null);
    }
  }, [query.data]);

  useEffect(() => {
    setTab(schema ? "typed" : "raw");
  }, [schema, open, file?.relativePath]);

  const parsed = useMemo(() => safeParse(draft), [draft]);
  const parsedVersion =
    parsed && typeof parsed.m_Version === "number"
      ? (parsed.m_Version as number)
      : null;

  const dirty = query.data != null && draft !== query.data;

  const save = useMutation({
    mutationFn: () => {
      if (!profileId || !file)
        return Promise.reject(new Error("no profile or file"));
      return tauri.expansionSettingsWrite(
        profileId,
        file.relativePath,
        draft,
      );
    },
    onSuccess: () => {
      if (file && profileId) {
        qc.invalidateQueries({
          queryKey: ["expansion-settings", profileId, file.relativePath],
        });
      }
      qc.invalidateQueries({ queryKey: ["mods"] });
      toast.success(`saved ${file?.fileName ?? "settings"}`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const handleSave = () => {
    try {
      const top = JSON.parse(draft);
      if (!top || typeof top !== "object" || Array.isArray(top)) {
        setJsonError("top-level value must be a JSON object");
        return;
      }
      setJsonError(null);
      save.mutate();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err));
      // If we're on the typed tab and the JSON is broken, switch to
      // raw so the user can actually see and fix the problem.
      setTab("raw");
    }
  };

  const revert = () => {
    if (query.data != null) {
      setDraft(query.data);
      setJsonError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {schema ? schema.title : file ? file.name : "Expansion settings"}
            {parsedVersion !== null ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                m_Version: {parsedVersion}
              </Badge>
            ) : null}
            {file ? (
              <code className="text-[11px] font-normal text-muted-foreground">
                {file.relativePath}
              </code>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {schema?.description ?? (
              <>
                Edit the raw JSON. Save validates syntax, writes to the
                workspace, and auto-commits.
              </>
            )}{" "}
            You still need to <strong>Push</strong> from the Sync page for
            changes to land on the server, then restart so Expansion
            re-reads the file.
          </DialogDescription>
        </DialogHeader>

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
          <EditorBody
            schema={schema}
            tab={tab}
            setTab={setTab}
            draft={draft}
            setDraft={(next) => {
              setDraft(next);
              if (jsonError) setJsonError(null);
            }}
            parsed={parsed}
            applyParsed={(obj) => {
              // Re-serialise with 4-space indent, matching the input
              // style Expansion writes and keeping diffs tiny.
              setDraft(JSON.stringify(obj, null, 4));
              setJsonError(null);
            }}
            jsonError={jsonError}
          />
        )}

        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={revert}
            disabled={!dirty || save.isPending}
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Revert
          </Button>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              Close
            </Button>
            <Button
              onClick={handleSave}
              disabled={!dirty || save.isPending || query.isLoading}
            >
              {save.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorBody({
  schema,
  tab,
  setTab,
  draft,
  setDraft,
  parsed,
  applyParsed,
  jsonError,
}: {
  schema: SettingsSchema | null;
  tab: "typed" | "raw";
  setTab: (t: "typed" | "raw") => void;
  draft: string;
  setDraft: (next: string) => void;
  parsed: Record<string, unknown> | null;
  applyParsed: (next: Record<string, unknown>) => void;
  jsonError: string | null;
}) {
  // No typed schema available → raw-only editor (same as the old
  // generic path).
  if (!schema) {
    return (
      <>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-[50vh] resize-y font-mono text-xs leading-relaxed"
        />
        {jsonError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-mono text-xs">
              {jsonError}
            </AlertDescription>
          </Alert>
        ) : null}
      </>
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "typed" | "raw")}
      className="gap-3"
    >
      <TabsList>
        <TabsTrigger value="typed">
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" /> Settings
        </TabsTrigger>
        <TabsTrigger value="raw">
          <FileJson2 className="mr-1.5 h-3.5 w-3.5" /> Raw JSON
        </TabsTrigger>
      </TabsList>
      <TabsContent value="typed">
        <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border/60 p-3">
          {parsed ? (
            <TypedSettingsForm
              schema={schema}
              data={parsed}
              onChange={applyParsed}
            />
          ) : (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Can't render the typed form because the JSON doesn't parse.
                Switch to the Raw JSON tab to fix syntax, then come back.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </TabsContent>
      <TabsContent value="raw">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="min-h-[50vh] resize-y font-mono text-xs leading-relaxed"
        />
        {jsonError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-mono text-xs">
              {jsonError}
            </AlertDescription>
          </Alert>
        ) : null}
      </TabsContent>
    </Tabs>
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
