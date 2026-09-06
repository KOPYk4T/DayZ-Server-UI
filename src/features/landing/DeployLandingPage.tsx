import {
  Activity,
  Archive,
  FileText,
  GitBranch,
  Upload,
} from "lucide-react";

import { LandingPage } from "@/features/landing/LandingPage";
import {
  useBackups,
  useLocalDiff,
  useWorkspaceStatus,
} from "@/hooks/useProfiles";
import { formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

export function DeployLandingPage() {
  const profile = useProfileStore((s) => s.active);
  const id = profile?.id ?? null;
  const status = useWorkspaceStatus(id);
  const diff = useLocalDiff(id);
  const backups = useBackups(id);

  const unsaved =
    (diff.data?.addedCount ?? 0) +
    (diff.data?.modifiedCount ?? 0) +
    (diff.data?.deletedCount ?? 0);

  return (
    <LandingPage
      title="Deploy"
      intro="Ship your workspace to the server and keep the rollback surface clean. Pull to refresh the local copy, push to upload a reviewed diff, and restore from a pre-push backup if something slipped."
      stats={[
        {
          label: "Last pull",
          value: formatRelativeTime(
            status.data?.lastPullAt ?? profile?.lastPullAt,
          ),
          icon: Upload,
        },
        {
          label: "Last push",
          value: formatRelativeTime(
            status.data?.lastPushAt ?? profile?.lastPushAt,
          ),
          icon: Upload,
        },
        {
          label: "Unsaved changes",
          value: unsaved,
          icon: GitBranch,
          hint: diff.isFetching ? "scanning…" : "files vs last pull",
        },
        {
          label: "Backups",
          value: backups.data?.length ?? 0,
          icon: Archive,
          hint: "pre-push snapshots",
        },
      ]}
      sections={[
        {
          to: "/app/sync",
          label: "Sync (pull / push)",
          description:
            "Pull the server's current config into the workspace, review the diff, and push a reviewed change back. Every step is gated on an explicit confirm.",
          icon: Upload,
          stat:
            unsaved === 0
              ? "clean"
              : `${unsaved} file${unsaved === 1 ? "" : "s"} dirty`,
        },
        {
          to: "/app/backups",
          label: "Backups",
          description:
            "Every local-mode push first archives the files it's about to overwrite. Last ten kept; older ones auto-prune.",
          icon: Archive,
          stat: `${backups.data?.length ?? 0} snapshot(s)`,
        },
        {
          to: "/app/health",
          label: "Health",
          description:
            "Lint + balance checks across items, events, loadouts. Fix errors here before pushing to keep the CE log clean.",
          icon: Activity,
        },
      ]}
      footer={
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <FileText className="mr-1.5 inline h-3 w-3" />
          Every workspace save auto-commits to a per-profile git
          repo. You can revert any edit from the workspace folder
          (open via Sync → <strong>Open folder</strong>) before the
          next push.
        </div>
      }
    />
  );
}
