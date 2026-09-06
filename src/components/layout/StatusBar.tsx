import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CircleDot, GitCommit } from "lucide-react";

import { useEventsSnapshot } from "@/hooks/useEvents";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useLoadoutsSnapshot } from "@/hooks/useLoadouts";
import { useWorkspaceStatus } from "@/hooks/useProfiles";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

export function StatusBar() {
  const active = useProfileStore((s) => s.active);
  const navigate = useNavigate();
  const { data: status } = useWorkspaceStatus(active?.id ?? null);

  const items = useItemsSnapshot();
  const events = useEventsSnapshot();
  const loadouts = useLoadoutsSnapshot();

  const { errors, warnings } = useMemo(() => {
    const all = [
      ...(items.data?.validation ?? []),
      ...(events.data?.validation ?? []),
      ...(loadouts.data?.validation ?? []),
    ];
    return {
      errors: all.filter((i) => i.severity === "error").length,
      warnings: all.filter((i) => i.severity === "warning").length,
    };
  }, [items.data, events.data, loadouts.data]);

  const openHealth = () => {
    if (active) navigate("/app/health");
  };

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-card px-3 text-[11px] text-muted-foreground">
      <button
        type="button"
        onClick={openHealth}
        disabled={!active}
        title={active ? "Open Health page" : "No profile loaded"}
        className={cn(
          "flex items-center gap-1.5 rounded px-1 transition-colors",
          active && "hover:bg-muted/50",
        )}
      >
        <CircleDot
          className={cn(
            "h-2.5 w-2.5",
            errors > 0
              ? "text-severity-error"
              : warnings > 0
                ? "text-severity-warning"
                : "text-severity-success",
          )}
        />
        <span>
          {errors} error{errors === 1 ? "" : "s"}
        </span>
        <span className="opacity-60">·</span>
        <span>
          {warnings} warning{warnings === 1 ? "" : "s"}
        </span>
      </button>

      <span className="opacity-60">·</span>

      {active ? (
        <>
          <span>
            pulled{" "}
            <strong className="text-foreground">
              {formatRelativeTime(status?.lastPullAt ?? active.lastPullAt)}
            </strong>
          </span>
          <span className="opacity-60">·</span>
          <span className="flex items-center gap-1">
            <GitCommit className="h-3 w-3" />
            {status?.unpushedCount ?? 0} unpushed
          </span>
        </>
      ) : (
        <span>no profile loaded</span>
      )}

      <span className="ml-auto opacity-60">
        {status?.workspacePath ?? "—"}
      </span>
    </footer>
  );
}
