import { useEffect, useMemo, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import * as tauri from "@/lib/tauri";
import { errorMessage } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

import { useAddUserMod, useModsActivation } from "./useModsActivation";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

/** Dialog behind the "Add mod folder…" button on the Mods landing
 *  page. The operator picks a folder inside the profile's workspace,
 *  names it, picks a stable slug, and we persist a `UserAddedMod`
 *  entry. Used for mods detection missed (renamed, non-`@`
 *  prefixed, or a hand-authored custom bundle). */
export function AddModFolderDialog({ open, onOpenChange }: Props) {
  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;
  const activation = useModsActivation();
  const addMod = useAddUserMod();

  const [absPath, setAbsPath] = useState("");
  const [relPath, setRelPath] = useState("");
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [resolving, setResolving] = useState(false);

  // Reset on close so reopening is clean.
  useEffect(() => {
    if (!open) {
      setAbsPath("");
      setRelPath("");
      setResolveErr(null);
      setDisplayName("");
      setSlug("");
    }
  }, [open]);

  const existingIds = useMemo(() => {
    const ids = new Set<string>();
    const act = activation.data;
    if (!act) return ids;
    for (const k of Object.keys(act.activation)) ids.add(k);
    for (const u of act.userAdded) ids.add(u.id);
    return ids;
  }, [activation.data]);

  const slugValid = /^[a-z0-9_-]+$/.test(slug);
  const slugClash = slug.length > 0 && existingIds.has(slug);
  const canSubmit =
    !resolving &&
    relPath.length > 0 &&
    displayName.trim().length > 0 &&
    slugValid &&
    !slugClash &&
    !addMod.isPending;

  const pick = async () => {
    const picked = await openDialog({
      directory: true,
      multiple: false,
      title: "Pick a mod folder inside the workspace",
    });
    if (typeof picked !== "string" || !profileId) return;
    setAbsPath(picked);
    setResolving(true);
    setResolveErr(null);
    try {
      const rel = await tauri.modsActivationToRelativePath(profileId, picked);
      setRelPath(rel);
      if (!displayName) {
        // Auto-suggest a display name from the last path segment.
        const last = rel.split("/").filter(Boolean).pop() ?? "";
        setDisplayName(last);
      }
      if (!slug) {
        const last = rel.split("/").filter(Boolean).pop() ?? "";
        setSlug(slugify(last));
      }
    } catch (err) {
      setRelPath("");
      setResolveErr(errorMessage(err));
    } finally {
      setResolving(false);
    }
  };

  const submit = () => {
    if (!canSubmit) return;
    addMod.mutate(
      {
        id: slug,
        displayName: displayName.trim(),
        folderPath: relPath,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add mod folder</DialogTitle>
          <DialogDescription>
            Register a mod that auto-detection missed — typically a
            hand-authored override bundle, a renamed{" "}
            <code>@</code>-less folder, or a mod you want to track
            manually.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Folder</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={absPath || ""}
                placeholder="click Browse to pick a folder inside the workspace"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={pick}
                disabled={!profileId || resolving}
              >
                {resolving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {relPath ? (
              <p className="text-[10px] text-muted-foreground">
                Workspace-relative:{" "}
                <code className="font-mono">{relPath}</code>
              </p>
            ) : null}
            {resolveErr ? (
              <p className="text-[11px] text-severity-error">{resolveErr}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-mod-name">Display name</Label>
            <Input
              id="add-mod-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="My Override Bundle"
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-mod-slug">Slug</Label>
            <Input
              id="add-mod-slug"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="my_bundle"
              className="h-8 font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Stable identifier — lowercase letters, digits,{" "}
              <code>_</code>, <code>-</code>. Stored in{" "}
              <code>.dzmgr/mods.json</code>.
            </p>
            {slug.length > 0 && !slugValid ? (
              <p className="text-[11px] text-severity-error">
                invalid slug — must match <code>[a-z0-9_-]+</code>
              </p>
            ) : null}
            {slugClash ? (
              <p className="text-[11px] text-severity-error">
                a mod with this id already exists
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={addMod.isPending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {addMod.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lowercase, strip unsafe chars — matches the Rust-side slug
 *  regex so invalid suggestions never round-trip. */
function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
