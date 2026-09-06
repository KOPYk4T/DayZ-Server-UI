import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleDot,
  Compass,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useLocalDiff, useWorkspaceStatus } from "@/hooks/useProfiles";
import { cn } from "@/lib/utils";
import { useProfileStore } from "@/stores/profileStore";

/**
 * Getting-started walkthrough. Auto-detects the user's progress via
 * the same hooks the rest of the app uses (active profile, last pull
 * timestamp, dirty workspace, last push). Each step self-evaluates,
 * so just revisiting the page after completing a step shows it
 * checked off.
 */

type StepState = "todo" | "in_progress" | "done";

interface Step {
  n: number;
  title: string;
  description: string;
  state: StepState;
  action?: { label: string; to: string };
}

export function GettingStartedPage() {
  const profile = useProfileStore((s) => s.active);
  const navigate = useNavigate();
  const id = profile?.id ?? null;
  const status = useWorkspaceStatus(id);
  const diff = useLocalDiff(id);

  const hasProfile = !!profile;
  const hasPulled = !!(status.data?.lastPullAt || profile?.lastPullAt);
  const hasDirty =
    (diff.data?.addedCount ?? 0) +
      (diff.data?.modifiedCount ?? 0) +
      (diff.data?.deletedCount ?? 0) >
    0;
  const hasPushed = !!(status.data?.lastPushAt || profile?.lastPushAt);

  const steps: Step[] = [
    {
      n: 1,
      title: "Create a server profile",
      description:
        "Point the app at your DayZ server — either a local folder (dedicated host on the same machine) or SFTP (hosting panel).",
      state: hasProfile ? "done" : "in_progress",
      action: { label: "Open profile picker", to: "/profiles" },
    },
    {
      n: 2,
      title: "Pull the current config",
      description:
        "Mirrors mpmissions/, profiles/, and serverDZ.cfg into a local workspace and commits them to a per-profile git repo. Safe: it doesn't write back yet.",
      state: !hasProfile
        ? "todo"
        : hasPulled
          ? "done"
          : "in_progress",
      action: { label: "Go to Sync", to: "/app/sync" },
    },
    {
      n: 3,
      title: "Tour the Mission area",
      description:
        "Mission is where the bulk of editing happens — items, events, loadouts, gear sets, spawns, buildings. Start at the overview to see what lives where.",
      state: !hasPulled ? "todo" : "in_progress",
      action: { label: "Mission overview", to: "/app/mission" },
    },
    {
      n: 4,
      title: "Make an edit",
      description:
        "Any change — bump a nominal, add an event position, move a spawn. Every save commits to the workspace git so you can always roll back.",
      state: !hasPulled ? "todo" : hasDirty ? "in_progress" : "todo",
      action: { label: "Open Items", to: "/app/items" },
    },
    {
      n: 5,
      title: "Review & push",
      description:
        "Deploy → Sync shows a full diff. Confirm it and the app writes to the server; a pre-push backup captures what's about to be overwritten.",
      state: !hasDirty
        ? hasPushed
          ? "done"
          : "todo"
        : "in_progress",
      action: { label: "Review push", to: "/app/sync" },
    },
  ];

  const done = steps.filter((s) => s.state === "done").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Compass className="h-5 w-5 text-primary" /> Getting started
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            The basic loop: pull → edit → review → push. Steps auto-
            check as you complete them — come back here any time you
            feel lost.
          </p>
        </div>
        <Card className="shrink-0">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Progress
            </div>
            <div className="font-mono text-lg font-semibold tabular-nums">
              {done} / {steps.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Looking for the prep checklist?
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Setup is the single page that tracks every one-time
              action — P: drive index, mod CE imports, mod sources,
              tools detection, working directory, backdrop. Re-run
              anything from there after a DayZ update or a mod
              change.
            </p>
          </div>
          <Button onClick={() => navigate("/app/setup")} size="sm">
            Open Setup
          </Button>
        </CardContent>
      </Card>

      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.n}>
            <StepCard
              step={s}
              onAction={() => s.action && navigate(s.action.to)}
            />
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Once you're comfortable</CardTitle>
          <CardDescription>
            A few places worth exploring after the basics click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <TipRow
              label="Spawn flow"
              body="Animated diagram of the three CE loops and which editor page controls each file."
              to="/app/spawn-flow"
            />
            <TipRow
              label="Map"
              body="Visualises spawns, event positions, and building placements in one view."
              to="/app/map"
            />
            <TipRow
              label="Health"
              body="Lint + balance checks that catch CE footguns before the server starts."
              to="/app/health"
            />
            <TipRow
              label="Mods"
              body="Import a mod's CE files to register its classnames in cfgeconomycore.xml."
              to="/app/mods"
            />
            <TipRow
              label="Command palette"
              body="Ctrl+K jumps to any page, item, or event by name."
              to="/app/dashboard"
            />
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function StepCard({
  step,
  onAction,
}: {
  step: Step;
  onAction: () => void;
}) {
  const Icon =
    step.state === "done"
      ? CheckCircle2
      : step.state === "in_progress"
        ? CircleDot
        : Circle;
  const colour =
    step.state === "done"
      ? "text-severity-success"
      : step.state === "in_progress"
        ? "text-primary"
        : "text-muted-foreground";
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border/60 bg-card p-4",
        step.state === "done" && "opacity-75",
      )}
    >
      <Icon className={cn("mt-1 h-5 w-5 shrink-0", colour)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-muted-foreground">
            Step {step.n}
          </span>
        </div>
        <h3 className="text-sm font-semibold">{step.title}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {step.description}
        </p>
      </div>
      {step.action ? (
        <Button
          size="sm"
          variant={step.state === "in_progress" ? "default" : "secondary"}
          onClick={onAction}
          className="shrink-0"
          disabled={step.state === "done"}
        >
          {step.action.label}{" "}
          <ArrowRight className="ml-1.5 h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}

function TipRow({
  label,
  body,
  to,
}: {
  label: string;
  body: string;
  to: string;
}) {
  const navigate = useNavigate();
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(to)}
        className="flex w-full items-start gap-2 rounded-md border border-border/60 p-3 text-left transition-colors hover:bg-muted/30"
      >
        <Upload className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
        </div>
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
