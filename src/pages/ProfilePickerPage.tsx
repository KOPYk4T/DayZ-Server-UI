import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Download,
  FolderOpen,
  Globe2,
  KeyRound,
  Loader2,
  Pencil,
  Plug,
  Plus,
  ShieldAlert,
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ProfileFormDialog } from "@/features/profiles/ProfileFormDialog";
import {
  useDeleteProfile,
  useDuplicateProfile,
  useProfileList,
  usePull,
  useSecretsPresence,
  useTestConnection,
} from "@/hooks/useProfiles";
import * as tauri from "@/lib/tauri";
import { cn, errorMessage, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";
import { useUIStore } from "@/stores/uiStore";
import type { ServerProfile } from "@/types/ipc";

export function ProfilePickerPage() {
  const navigate = useNavigate();
  const { data: profiles, isLoading, isError, error, refetch } = useProfileList();
  const setActive = useProfileStore((s) => s.setActive);
  const setActiveId = useUIStore((s) => s.setActiveProfileId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServerProfile | null>(null);
  const [deleting, setDeleting] = useState<ServerProfile | null>(null);

  const openForEdit = (p: ServerProfile) => {
    setEditing(p);
    setFormOpen(true);
  };
  const openForCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openWorkspace = (p: ServerProfile) => {
    setActive(p);
    setActiveId(p.id);
    navigate("/app/dashboard");
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold tracking-tight">
            DayZ ServerUI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Server profiles
              </h1>
              <p className="text-sm text-muted-foreground">
                Pick a profile to enter the workspace, or create a new one.
              </p>
            </div>
            <Button onClick={openForCreate}>
              <Plus className="mr-2 h-4 w-4" /> New profile
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading profiles…
            </div>
          ) : isError ? (
            <Card className="border-destructive/40">
              <CardContent className="py-6 text-sm">
                <p className="font-medium text-severity-error">
                  Could not load profiles
                </p>
                <p className="text-muted-foreground">
                  {errorMessage(error)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => void refetch()}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : !profiles || profiles.length === 0 ? (
            <EmptyProfiles onCreate={openForCreate} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  onOpen={() => openWorkspace(p)}
                  onEdit={() => openForEdit(p)}
                  onDelete={() => setDeleting(p)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <ProfileFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        profile={editing}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the profile and its keychain secrets. The local
              workspace files are kept on disk — you can delete them manually.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleting ? (
              <DeleteAction
                profile={deleting}
                onDone={() => setDeleting(null)}
              />
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DeleteAction({
  profile,
  onDone,
}: {
  profile: ServerProfile;
  onDone: () => void;
}) {
  const del = useDeleteProfile();
  return (
    <AlertDialogAction
      onClick={(e) => {
        e.preventDefault();
        del.mutate(profile.id, {
          onSuccess: () => {
            toast.success("profile deleted");
            onDone();
          },
          onError: (err) =>
            toast.error(errorMessage(err)),
        });
      }}
      disabled={del.isPending}
      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
    >
      {del.isPending ? "Deleting…" : "Delete"}
    </AlertDialogAction>
  );
}

function ProfileCard({
  profile,
  onOpen,
  onEdit,
  onDelete,
}: {
  profile: ServerProfile;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const test = useTestConnection();
  const pull = usePull(profile.id);
  const duplicate = useDuplicateProfile();
  const secrets = useSecretsPresence(profile.id);
  // Only SFTP profiles need credentials in the keychain; local folder
  // mode reads / writes the disk directly.
  const credMissing =
    profile.mode === "sftp" &&
    secrets.data != null &&
    !secrets.data.hasPassword &&
    !secrets.data.hasKeyPassphrase;
  const credReadError =
    profile.mode === "sftp" && !!secrets.data?.error;

  const handleTest = () => {
    test.mutate(profile.id, {
      onSuccess: (res) => {
        if (res.ok) toast.success(res.message);
        else toast.error(res.message);
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const handlePull = () => {
    pull.mutate(undefined, {
      onSuccess: (r) => {
        if (r.skipped.length > 0) {
          // Not a failure — the main pull succeeded — but the server
          // refused some files. Surface as a warning with a preview.
          const preview = r.skipped
            .slice(0, 3)
            .map((s) => s.path.split("/").pop())
            .join(", ");
          const more =
            r.skipped.length > 3 ? ` (+${r.skipped.length - 3} more)` : "";
          toast.warning(`pulled ${profile.name} — skipped ${r.skipped.length} file(s)`, {
            description: `${preview}${more}. These files are held open by the running server and can't be read over SFTP.`,
          });
        } else {
          toast.success(`pulled ${profile.name}`, {
            description: "workspace is up to date",
          });
        }
      },
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const handleDuplicate = () => {
    duplicate.mutate(profile.id, {
      onSuccess: () => toast.success("profile duplicated"),
      onError: (err) =>
        toast.error(errorMessage(err)),
    });
  };

  const handleOpenFolder = () => {
    void tauri.profilesOpenWorkspace(profile.id).catch((err: unknown) => {
      toast.error(errorMessage(err));
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base">{profile.name}</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={profile.mode === "sftp" ? "default" : "secondary"}>
              {profile.mode.toUpperCase()}
            </Badge>
            <Badge variant="outline">{profile.map}</Badge>
            {profile.mods.length ? (
              <Badge variant="outline">
                {profile.mods.length} mod{profile.mods.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {credMissing ? (
              <Badge
                variant="outline"
                className="border-severity-error/50 text-severity-error"
                title="Keychain has no password or key passphrase for this profile. Pull/Push will fail. Edit the profile and re-enter your credentials."
              >
                <ShieldAlert className="mr-1 h-3 w-3" />
                no credentials stored
              </Badge>
            ) : credReadError ? (
              <Badge
                variant="outline"
                className="border-severity-warning/50 text-severity-warning"
                title={secrets.data?.error ?? undefined}
              >
                <ShieldAlert className="mr-1 h-3 w-3" />
                keychain unreachable
              </Badge>
            ) : secrets.data?.hasPassword ||
              secrets.data?.hasKeyPassphrase ? (
              <Badge
                variant="outline"
                className="border-severity-success/40 text-severity-success"
                title="Credentials stored in the OS keychain"
              >
                <KeyRound className="mr-1 h-3 w-3" />
                credentials stored
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Edit"
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Duplicate"
            onClick={handleDuplicate}
            disabled={duplicate.isPending}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">
        <dl className="grid grid-cols-[90px_1fr] gap-y-1">
          {profile.mode === "sftp" && profile.sftp ? (
            <>
              <dt>host</dt>
              <dd className="truncate font-mono text-foreground">
                {profile.sftp.username}@{profile.sftp.host}:{profile.sftp.port}
              </dd>
            </>
          ) : (
            <>
              <dt>root</dt>
              <dd className="truncate font-mono text-foreground">
                {profile.local?.rootPath ?? "—"}
              </dd>
            </>
          )}
          <dt>mission</dt>
          <dd className="truncate font-mono text-foreground">
            {profile.paths.mpmissionsRelative}
          </dd>
          <dt>profiles</dt>
          <dd className="truncate font-mono text-foreground">
            {profile.paths.profilesRelative}
          </dd>
          <dt>last pull</dt>
          <dd>{formatRelativeTime(profile.lastPullAt ?? undefined)}</dd>
        </dl>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t border-border/60 bg-muted/30 py-2">
        <Button size="sm" variant="default" onClick={onOpen}>
          Open workspace
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleTest}
          disabled={test.isPending}
        >
          <Plug className="mr-1.5 h-3.5 w-3.5" />
          {test.isPending ? "Testing…" : "Test"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handlePull}
          disabled={pull.isPending}
          className={cn(pull.isPending && "opacity-75")}
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {pull.isPending ? "Pulling…" : "Pull"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={handleOpenFolder}
          title="Open local workspace folder"
        >
          <FolderOpen className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

function EmptyProfiles({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Globe2 className="h-10 w-10 text-muted-foreground/60" />
        <h3 className="text-base font-medium">No profiles yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create a profile pointing at a remote SFTP server or a local
          <code className="mx-1 rounded bg-muted px-1">mpmissions/</code>
          layout.
        </p>
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create your first profile
        </Button>
      </CardContent>
    </Card>
  );
}
