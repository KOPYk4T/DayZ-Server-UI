import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Scroll,
  Search,
  Target,
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
import { FactionPicker } from "@/features/mods/expansion/pickers/FactionPicker";
import { QuestPicker } from "@/features/mods/expansion/pickers/QuestPicker";
import { useQuestIndex } from "@/features/mods/expansion/pickers/useQuestIndex";
import {
  useObjectivesIndex,
  useQuestObjectiveResolutions,
} from "./objectives/useObjectivesData";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useItemsSnapshot } from "@/hooks/useItems";
import { useModsScan } from "@/hooks/useMods";
import { errorMessage } from "@/lib/utils";

import {
  DEFAULT_QUEST,
  DEFAULT_QUEST_REWARD,
  OBJECTIVE_TYPE_LABELS,
  QUEST_TYPE_LABELS,
  type Quest,
  type QuestObjectiveRef,
  type QuestReward,
} from "./types";
import {
  useNpcIndex,
  useQuest,
  useQuestList,
  useQuestSave,
  useQuestsFolder,
} from "./useQuestsData";

export function QuestsPage() {
  const modsScan = useModsScan();
  const inv = modsScan.data?.expansion ?? null;
  const folders = useQuestsFolder(inv);
  const list = useQuestList(folders.questsDir);
  const npcIndex = useNpcIndex(folders.npcsDir);
  const items = useItemsSnapshot();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlName = searchParams.get("name");

  const questFiles = useMemo(
    () =>
      (list.data?.entries ?? [])
        .filter((e) => !e.isDir && e.extension === "json")
        .sort((a, b) => {
          // Sort numerically by ID suffix when the filename matches
          // `Quest_N.json`; fall back to lexicographic.
          const na = parseInt(a.name.match(/_(\d+)\.json$/i)?.[1] ?? "", 10);
          const nb = parseInt(b.name.match(/_(\d+)\.json$/i)?.[1] ?? "", 10);
          if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
          return a.name.localeCompare(b.name);
        }),
    [list.data],
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!urlName || questFiles.length === 0) return;
    const match = questFiles.find(
      (e) => e.name.replace(/\.json$/i, "").toLowerCase() === urlName.toLowerCase(),
    );
    if (match) setSelectedPath(match.relativePath);
  }, [urlName, questFiles]);
  useEffect(() => {
    if (selectedPath || questFiles.length === 0 || urlName) return;
    setSelectedPath(questFiles[0].relativePath);
  }, [selectedPath, questFiles, urlName]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return questFiles;
    return questFiles.filter((e) => e.name.toLowerCase().includes(q));
  }, [questFiles, filter]);

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
            DayZ Expansion isn't detected in this workspace.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Breadcrumb />
      <header className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Quests</h1>
        <Badge variant="secondary">{questFiles.length}</Badge>
        <p className="ml-2 text-xs text-muted-foreground">
          Objectives, rewards, and prerequisite chains for each{" "}
          <code>Quest_*.json</code> — see the Quest graph for how they
          link together.
        </p>
        <div className="ml-auto flex gap-2">
          <Link
            to="/app/mods/expansion/quest-npcs"
            className="inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs hover:bg-muted/60"
          >
            <Users className="h-3 w-3" /> Edit NPCs
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr] gap-4">
        <aside className="flex min-h-0 flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter quests"
              className="h-8 pl-7 text-xs"
            />
          </div>
          {list.isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Loading
            </div>
          ) : (
            <ul className="flex-1 overflow-y-auto">
              {filtered.map((f) => (
                <QuestListItem
                  key={f.relativePath}
                  path={f.relativePath}
                  name={f.name.replace(/\.json$/i, "")}
                  selected={selectedPath === f.relativePath}
                  onSelect={() => {
                    setSelectedPath(f.relativePath);
                    searchParams.delete("name");
                    setSearchParams(searchParams, { replace: true });
                  }}
                />
              ))}
            </ul>
          )}
          <NewQuestButton
            questsDir={folders.questsDir}
            existingIds={questFiles
              .map((f) => parseInt(f.name.match(/_(\d+)\.json$/i)?.[1] ?? "", 10))
              .filter((n) => Number.isFinite(n))}
            onCreated={(p) => {
              void list.refetch();
              setSelectedPath(p);
            }}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {selectedPath ? (
            <QuestEditor
              path={selectedPath}
              npcIndex={npcIndex.data ?? new Map()}
              knownClassnames={knownClassnames}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a quest on the left.
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
      <Link to="/app/mods" className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60">
        <ArrowLeft className="h-3 w-3" /> Mods
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <Link to="/app/mods/expansion" className="hover:underline">
        Expansion
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">Quests</span>
    </nav>
  );
}

function QuestListItem({
  path,
  name,
  selected,
  onSelect,
}: {
  path: string;
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  // Pre-fetch the file once the user hovers, so selection feels
  // instant. Cheap — expansionSettingsRead just reads a small JSON.
  const query = useQuest(selected ? path : null);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
          selected
            ? "bg-primary/10 font-semibold text-primary"
            : "hover:bg-muted/60"
        }`}
      >
        <Target className="h-3 w-3 shrink-0" />
        <span className="truncate">{name}</span>
        {selected && query.data ? (
          <span className="ml-auto shrink-0 max-w-[90px] truncate text-[10px] font-normal text-muted-foreground">
            {query.data.Title || "—"}
          </span>
        ) : null}
      </button>
    </li>
  );
}

function NewQuestButton({
  questsDir,
  existingIds,
  onCreated,
}: {
  questsDir: string | null;
  existingIds: number[];
  onCreated: (path: string) => void;
}) {
  const save = useQuestSave();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-1 h-8 text-xs"
      disabled={!questsDir || save.isPending}
      onClick={() => {
        if (!questsDir) return;
        const next = (Math.max(0, ...existingIds) || 0) + 1;
        const idStr = prompt("Quest ID for the new quest:", String(next));
        if (!idStr) return;
        const id = parseInt(idStr, 10);
        if (!Number.isFinite(id) || id < 0) {
          toast.error("invalid ID");
          return;
        }
        if (existingIds.includes(id)) {
          toast.error(`Quest_${id}.json already exists`);
          return;
        }
        const path = `${questsDir}/Quest_${id}.json`;
        save.mutate(
          {
            path,
            data: { ...DEFAULT_QUEST, ID: id, Title: `New quest ${id}` },
          },
          {
            onSuccess: () => {
              toast.success(`created Quest_${id}.json`);
              onCreated(path);
            },
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      }}
    >
      <Plus className="mr-1 h-3 w-3" /> New quest
    </Button>
  );
}

function QuestEditor({
  path,
  npcIndex,
  knownClassnames,
}: {
  path: string;
  npcIndex: Map<number, { name: string; path: string }>;
  knownClassnames: string[];
}) {
  const query = useQuest(path);
  const save = useQuestSave();
  const [draft, setDraft] = useState<Quest | null>(null);

  useEffect(() => {
    if (query.data) setDraft(query.data);
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

  const questStem = path.split("/").pop()!.replace(/\.json$/i, "");
  const dirty =
    query.data != null && JSON.stringify(draft) !== JSON.stringify(query.data);
  const update = <K extends keyof Quest>(k: K, v: Quest[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>
              {questStem}
              {draft.Title ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  — {draft.Title}
                </span>
              ) : null}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              ID {draft.ID}
            </Badge>
            <Badge variant="outline" className="font-mono text-[10px]">
              {QUEST_TYPE_LABELS[draft.Type] ?? `Type ${draft.Type}`}
            </Badge>
            {draft.Active === 0 ? (
              <Badge
                variant="secondary"
                className="border-severity-warning/40 text-severity-warning"
              >
                inactive
              </Badge>
            ) : null}
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
                onClick={() => query.data && setDraft(query.data)}
                disabled={!dirty || save.isPending}
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Revert
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  save.mutate(
                    { path, data: draft },
                    {
                      onSuccess: () => toast.success(`saved ${questStem}`),
                      onError: (err) => toast.error(errorMessage(err)),
                    },
                  )
                }
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
        <CardContent className="space-y-4">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Title</Label>
              <Input
                value={draft.Title}
                onChange={(e) => update("Title", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={String(draft.Type)}
                onValueChange={(v) => update("Type", Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(QUEST_TYPE_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {k} · {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Switch
                id="active"
                checked={draft.Active === 1}
                onCheckedChange={(v) => update("Active", v ? 1 : 0)}
              />
              <Label htmlFor="active" className="cursor-pointer">
                Active
              </Label>
            </div>
            <div className="col-span-full space-y-1.5">
              <Label>Objective text (shown under title in quest log)</Label>
              <Input
                value={draft.ObjectiveText}
                onChange={(e) => update("ObjectiveText", e.target.value)}
              />
            </div>
            <div className="col-span-full space-y-1.5">
              <Label>Descriptions (greeting · progress · refusal)</Label>
              {[0, 1, 2].map((i) => (
                <Textarea
                  key={i}
                  value={draft.Descriptions[i] ?? ""}
                  onChange={(e) => {
                    const next = [...draft.Descriptions];
                    while (next.length <= i) next.push("");
                    next[i] = e.target.value;
                    update("Descriptions", next);
                  }}
                  className="min-h-[60px] font-mono text-xs"
                  placeholder={
                    i === 0
                      ? "Initial greeting / briefing"
                      : i === 1
                        ? "When returning with quest still active"
                        : "If player refuses / fails preconditions"
                  }
                />
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FlagField label="Repeatable" value={draft.Repeatable} onChange={(v) => update("Repeatable", v)} />
            <FlagField label="Daily" value={draft.IsDailyQuest} onChange={(v) => update("IsDailyQuest", v)} />
            <FlagField label="Weekly" value={draft.IsWeeklyQuest} onChange={(v) => update("IsWeeklyQuest", v)} />
            <FlagField label="Group quest" value={draft.IsGroupQuest} onChange={(v) => update("IsGroupQuest", v)} />
            <FlagField label="Autocomplete" value={draft.Autocomplete} onChange={(v) => update("Autocomplete", v)} />
            <FlagField label="Cancel on death" value={draft.CancelQuestOnPlayerDeath} onChange={(v) => update("CancelQuestOnPlayerDeath", v)} />
            <FlagField label="Is achievement" value={draft.IsAchievement} onChange={(v) => update("IsAchievement", v)} />
            <FlagField label="Sequential objectives" value={draft.SequentialObjectives} onChange={(v) => update("SequentialObjectives", v)} />
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Follow-up quest</Label>
              <QuestPicker
                value={draft.FollowUpQuest}
                onChange={(n) => update("FollowUpQuest", n)}
                noneValue={-1}
              />
            </div>
            <NumberField
              label="Reputation requirement"
              value={draft.ReputationRequirement}
              onChange={(n) => update("ReputationRequirement", n)}
              hint="-1 = none"
            />
            <NumberField
              label="Reputation reward"
              value={draft.ReputationReward}
              onChange={(n) => update("ReputationReward", n)}
            />
            <div className="space-y-1.5">
              <Label>Required faction</Label>
              <FactionPicker
                value={draft.RequiredFaction}
                onChange={(v) => update("RequiredFaction", v)}
                treatEmptyAsAny
              />
            </div>
            <div className="space-y-1.5">
              <Label>Faction reward</Label>
              <FactionPicker
                value={draft.FactionReward}
                onChange={(v) => update("FactionReward", v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Object set file</Label>
              <Input
                value={draft.ObjectSetFileName}
                onChange={(e) => update("ObjectSetFileName", e.target.value)}
                placeholder="empty = none"
              />
            </div>
            <NumberField
              label="Quest color (ARGB int)"
              value={draft.QuestColor}
              onChange={(n) => update("QuestColor", n)}
            />
            <NumberField
              label="Reward behavior"
              value={draft.RewardBehavior}
              onChange={(n) => update("RewardBehavior", n)}
              hint="0 = default"
            />
          </section>

          <NpcRefList
            label="Quest giver NPCs"
            ids={draft.QuestGiverIDs}
            onChange={(v) => update("QuestGiverIDs", v)}
            npcIndex={npcIndex}
          />
          <NpcRefList
            label="Quest turn-in NPCs"
            ids={draft.QuestTurnInIDs}
            onChange={(v) => update("QuestTurnInIDs", v)}
            npcIndex={npcIndex}
          />

          <PreQuestIDList
            ids={draft.PreQuestIDs}
            onChange={(v) => update("PreQuestIDs", v)}
            currentQuestId={draft.ID}
          />

          <ObjectivesList
            value={draft.Objectives}
            onChange={(v) => update("Objectives", v)}
          />

          <RewardsList
            value={draft.Rewards}
            onChange={(v) => update("Rewards", v)}
            knownClassnames={knownClassnames}
          />
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <FlagField label="Need to select reward" value={draft.NeedToSelectReward} onChange={(v) => update("NeedToSelectReward", v)} />
            <FlagField label="Random reward" value={draft.RandomReward} onChange={(v) => update("RandomReward", v)} />
            <NumberField
              label="Random reward amount"
              value={draft.RandomRewardAmount}
              onChange={(n) => update("RandomRewardAmount", n)}
              hint="-1 = all"
            />
            <FlagField label="Rewards for group owner only" value={draft.RewardsForGroupOwnerOnly} onChange={(v) => update("RewardsForGroupOwnerOnly", v)} />
          </section>
          <p className="text-[10px] text-muted-foreground">
            Objective-type definitions live under{" "}
            <code>Quests/Objectives/&lt;type&gt;/Objective_*.json</code> —
            edit those in the{" "}
            <Link
              to="/app/mods/expansion"
              className="underline-offset-2 hover:underline"
            >
              data browser
            </Link>{" "}
            for now. Reference:{" "}
            <a
              href="https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/Quests"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Expansion Quests wiki
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function FlagField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: 0 | 1;
  onChange: (v: 0 | 1) => void;
}) {
  return (
    <div className="flex items-end gap-2">
      <Switch
        checked={value === 1}
        onCheckedChange={(v) => onChange(v ? 1 : 0)}
      />
      <Label className="cursor-pointer">{label}</Label>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  linkHint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  linkHint?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      {linkHint ? (
        <p className="text-[10px] text-primary">→ {linkHint}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function NpcRefList({
  label,
  ids,
  onChange,
  npcIndex,
}: {
  label: string;
  ids: number[];
  onChange: (v: number[]) => void;
  npcIndex: Map<number, { name: string; path: string }>;
}) {
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Every NPC in the workspace that isn't already in this list —
  // ordered by numeric ID so the picker feels consistent whether
  // you're browsing ID ranges or searching by name.
  const available = useMemo(() => {
    const entries: Array<[number, { name: string; path: string }]> = [];
    npcIndex.forEach((ref, id) => {
      if (!ids.includes(id)) entries.push([id, ref]);
    });
    entries.sort(([a], [b]) => a - b);
    return entries;
  }, [npcIndex, ids]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available.slice(0, 80);
    return available
      .filter(
        ([id, ref]) =>
          String(id) === q || ref.name.toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [search, available]);

  const addNpc = (id: number) => {
    if (ids.includes(id)) return;
    onChange([...ids, id]);
    setPickerOpen(false);
    setSearch("");
  };

  const addByIdInput = () => {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n)) {
      toast.error("ID must be a number");
      return;
    }
    if (ids.includes(n)) {
      toast.error("Already in the list");
      return;
    }
    onChange([...ids, n]);
    setDraft("");
  };

  return (
    <section className="space-y-1.5">
      <Label>{label}</Label>
      {ids.length === 0 ? (
        <p className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
          None. Pick an NPC below.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {ids.map((id, idx) => {
            const ref = npcIndex.get(id);
            return (
              <li
                key={`${id}-${idx}`}
                className="flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs"
              >
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono">{id}</span>
                {ref ? (
                  <span className="text-muted-foreground">— {ref.name}</span>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-severity-warning/40 text-[9px] text-severity-warning"
                    title="NPC with this ID not found in the workspace — it may not exist yet, or the file was removed."
                  >
                    unknown
                  </Badge>
                )}
                {ref ? (
                  <Link
                    to={`/app/mods/expansion/quest-npcs?name=QuestNPC_${id}`}
                    className="text-primary hover:underline"
                    title="Open in NPC editor"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange(ids.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-severity-error"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={npcIndex.size === 0}
            >
              <Plus className="mr-1 h-3 w-3" />
              Pick an NPC
              <Badge
                variant="secondary"
                className="ml-1.5 h-4 text-[10px] font-mono tabular-nums"
              >
                {available.length}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <div className="flex items-center gap-2 border-b border-border/60 p-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter by id or name"
                className="flex-1 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {npcIndex.size === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No NPCs in the workspace yet. Create one on the{" "}
                  <Link
                    to="/app/mods/expansion/quest-npcs"
                    className="text-primary hover:underline"
                  >
                    Quest NPCs page
                  </Link>
                  .
                </div>
              ) : available.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Every NPC in the workspace is already in this list.
                </div>
              ) : matches.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No NPCs match. Clear the filter or add by ID below.
                </div>
              ) : (
                <ul>
                  {matches.map(([id, ref]) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => addNpc(id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
                      >
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[10px]"
                        >
                          #{id}
                        </Badge>
                        <Users className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{ref.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
              {npcIndex.size} NPC{npcIndex.size === 1 ? "" : "s"} in the
              workspace · {available.length} available to add.
            </div>
          </PopoverContent>
        </Popover>

        {/* Manual ID escape hatch — for referencing NPCs that don't
         *  exist yet (authored in a later session). */}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          or add by ID:
        </span>
        <Input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addByIdInput();
            }
          }}
          placeholder="NPC ID"
          className="h-7 w-24 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={addByIdInput}
          disabled={!draft.trim()}
        >
          Add
        </Button>
      </div>
    </section>
  );
}

function PreQuestIDList({
  ids,
  onChange,
  currentQuestId,
}: {
  ids: number[];
  onChange: (v: number[]) => void;
  /** The quest being edited. Hidden from the picker so you can't
   *  self-reference — a quest blocked on itself can never unlock. */
  currentQuestId: number;
}) {
  const { entries, byId, isLoading } = useQuestIndex();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [manualDraft, setManualDraft] = useState("");

  const available = useMemo(
    () =>
      entries.filter(
        (e) => e.id !== currentQuestId && !ids.includes(e.id),
      ),
    [entries, ids, currentQuestId],
  );

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available.slice(0, 80);
    return available
      .filter((e) => String(e.id) === q || e.title.toLowerCase().includes(q))
      .slice(0, 80);
  }, [search, available]);

  const addId = (id: number) => {
    if (ids.includes(id)) return;
    onChange([...ids, id]);
    setPickerOpen(false);
    setSearch("");
  };

  const addByManualInput = () => {
    const n = parseInt(manualDraft, 10);
    if (!Number.isFinite(n)) {
      toast.error("ID must be a number");
      return;
    }
    if (n === currentQuestId) {
      toast.error("A quest can't be its own prerequisite");
      return;
    }
    if (ids.includes(n)) {
      toast.error("Already in the list");
      return;
    }
    onChange([...ids, n]);
    setManualDraft("");
  };

  return (
    <section className="space-y-1.5">
      <Label>Pre-requisite quest IDs</Label>
      {ids.length === 0 ? (
        <p className="rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground">
          None. Pick a quest below — players will need to complete it
          before this one can start.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {ids.map((id, idx) => {
            const ref = byId.get(id);
            return (
              <li
                key={`${id}-${idx}`}
                className="flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs"
              >
                <Scroll className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono">{id}</span>
                {ref ? (
                  <span className="text-muted-foreground">
                    — {ref.title}
                  </span>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-severity-warning/40 text-[9px] text-severity-warning"
                    title="Quest with this ID not found in the workspace — it may not exist yet, or the file was removed."
                  >
                    unknown
                  </Badge>
                )}
                {ref ? (
                  <Link
                    to={`/app/mods/expansion/quests?path=${encodeURIComponent(ref.path)}`}
                    className="text-primary hover:underline"
                    title="Open this quest"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange(ids.filter((_, j) => j !== idx))}
                  className="text-muted-foreground hover:text-severity-error"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={entries.length === 0 && !isLoading}
            >
              <Plus className="mr-1 h-3 w-3" />
              Pick a quest
              <Badge
                variant="secondary"
                className="ml-1.5 h-4 text-[10px] font-mono tabular-nums"
              >
                {available.length}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[360px] p-0" align="start">
            <div className="flex items-center gap-2 border-b border-border/60 p-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter by id or title"
                className="flex-1 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {isLoading && entries.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Loading quest index…
                </div>
              ) : entries.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No quests in the workspace yet.
                </div>
              ) : available.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Every other quest is already a prerequisite.
                </div>
              ) : matches.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No quests match. Clear the filter or add by ID below.
                </div>
              ) : (
                <ul>
                  {matches.map((q) => (
                    <li key={q.id}>
                      <button
                        type="button"
                        onClick={() => addId(q.id)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
                      >
                        <Badge
                          variant="outline"
                          className="shrink-0 font-mono text-[10px]"
                        >
                          #{q.id}
                        </Badge>
                        <Scroll className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{q.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
              {entries.length} quest{entries.length === 1 ? "" : "s"} in
              the workspace · {available.length} available to add.
            </div>
          </PopoverContent>
        </Popover>

        {/* Manual ID escape hatch — for quests authored in a later
         *  session that don't yet exist on disk. */}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          or add by ID:
        </span>
        <Input
          type="number"
          value={manualDraft}
          onChange={(e) => setManualDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addByManualInput();
            }
          }}
          placeholder="Quest ID"
          className="h-7 w-24 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={addByManualInput}
          disabled={!manualDraft.trim()}
        >
          Add
        </Button>
      </div>
    </section>
  );
}

function ObjectivesList({
  value,
  onChange,
}: {
  value: QuestObjectiveRef[];
  onChange: (v: QuestObjectiveRef[]) => void;
}) {
  const resolutions = useQuestObjectiveResolutions(value);
  const { entries: allObjectives } = useObjectivesIndex();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const update = (idx: number, patch: Partial<QuestObjectiveRef>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  // Objectives in the workspace that aren't already referenced by
  // this quest. Operator can still duplicate-add by typing an ID
  // manually below, but the visual picker hides already-used
  // objectives.
  const available = useMemo(() => {
    const used = new Set(
      value.map((o) => `${o.ObjectiveType}:${o.ID}`),
    );
    return allObjectives.filter((e) => {
      if (e.objectiveType === null) return false;
      // Pull the ID out of the filename (`Objective_T_4.json` → 4)
      // since the index doesn't load the file to get it.
      const match = e.fileName.match(/_(\d+)\.json$/);
      if (!match) return false;
      const id = parseInt(match[1], 10);
      return !used.has(`${e.objectiveType}:${id}`);
    });
  }, [allObjectives, value]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available.slice(0, 100);
    return available
      .filter(
        (e) =>
          e.fileName.toLowerCase().includes(q) ||
          e.typeFolder.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [available, search]);

  const addObjective = (objectiveType: number, id: number) => {
    onChange([
      ...value,
      { ConfigVersion: 28, ID: id, ObjectiveType: objectiveType },
    ]);
    setPickerOpen(false);
    setSearch("");
  };

  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label>Objectives ({value.length})</Label>
        <p className="text-[10px] text-muted-foreground">
          Each reference points at{" "}
          <code>Quests/Objectives/&lt;type&gt;/Objective_&lt;ID&gt;.json</code>.{" "}
          <Link
            to="/app/mods/expansion/objectives"
            className="text-primary hover:underline"
          >
            Open objectives editor →
          </Link>
        </p>
      </div>
      {value.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          No objectives. Every real quest needs at least one.
        </p>
      ) : (
        <ul className="space-y-1">
          {value.map((obj, idx) => {
            const resKey = `${obj.ObjectiveType}:${obj.ID}`;
            const res = resolutions.get(resKey);
            return (
              <li
                key={idx}
                className="grid grid-cols-[auto_110px_150px_1fr_auto] items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  #{idx + 1}
                </span>
                <Input
                  type="number"
                  value={obj.ID}
                  onChange={(e) =>
                    update(idx, { ID: Number(e.target.value) || 0 })
                  }
                  className="h-7 text-xs"
                  title="Objective ID"
                />
                <Select
                  value={String(obj.ObjectiveType)}
                  onValueChange={(v) =>
                    update(idx, { ObjectiveType: Number(v) })
                  }
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OBJECTIVE_TYPE_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {k} · {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="min-w-0 truncate">
                  {res === null || res === undefined ? (
                    <Badge
                      variant="outline"
                      className="border-severity-warning/40 text-[9px] text-severity-warning"
                      title="No Objective_*.json matches this ObjectiveType + ID combination in the workspace."
                    >
                      unresolved
                    </Badge>
                  ) : (
                    <Link
                      to={`/app/mods/expansion/objectives?path=${encodeURIComponent(res.path)}`}
                      className="inline-flex items-center gap-1 truncate text-primary hover:underline"
                      title={res.path}
                    >
                      <Target className="h-3 w-3 shrink-0" />
                      <span className="truncate">{res.title}</span>
                    </Link>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onChange(value.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-3 w-3 text-severity-error" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={allObjectives.length === 0}
            >
              <Plus className="mr-1 h-3 w-3" />
              Pick an objective
              <Badge
                variant="secondary"
                className="ml-1.5 h-4 text-[10px] font-mono tabular-nums"
              >
                {available.length}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[380px] p-0" align="start">
            <div className="flex items-center gap-2 border-b border-border/60 p-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter by filename / type"
                className="flex-1 bg-transparent text-xs outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {allObjectives.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No objectives in the workspace yet. Create one on the{" "}
                  <Link
                    to="/app/mods/expansion/objectives"
                    className="text-primary hover:underline"
                  >
                    Objectives page
                  </Link>
                  .
                </div>
              ) : available.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  Every workspace objective is already referenced by
                  this quest.
                </div>
              ) : filteredAvailable.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">
                  No objectives match.
                </div>
              ) : (
                <ul>
                  {filteredAvailable.map((e) => {
                    const match = e.fileName.match(/_(\d+)\.json$/);
                    if (!match || e.objectiveType === null) return null;
                    const id = parseInt(match[1], 10);
                    return (
                      <li key={e.relativePath}>
                        <button
                          type="button"
                          onClick={() => addObjective(e.objectiveType!, id)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/50"
                        >
                          <Badge
                            variant="outline"
                            className="shrink-0 font-mono text-[10px]"
                          >
                            #{id}
                          </Badge>
                          <Target className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="truncate">{e.fileName}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {e.typeFolder}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t border-border/60 p-2 text-[10px] text-muted-foreground">
              {allObjectives.length} objective
              {allObjectives.length === 1 ? "" : "s"} in the workspace ·{" "}
              {available.length} available to add.
            </div>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() =>
            onChange([
              ...value,
              { ConfigVersion: 28, ID: 1, ObjectiveType: 3 },
            ])
          }
          title="Add a blank reference — useful when the objective file will be authored later."
        >
          <Plus className="mr-1 h-3 w-3" /> Add blank
        </Button>
      </div>
    </section>
  );
}

function RewardsList({
  value,
  onChange,
  knownClassnames,
}: {
  value: QuestReward[];
  onChange: (v: QuestReward[]) => void;
  knownClassnames: string[];
}) {
  const update = (idx: number, patch: Partial<QuestReward>) => {
    const next = [...value];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const getMutedState = useMutedClassnameReason();

  return (
    <section className="space-y-1.5">
      <Label>Rewards ({value.length})</Label>
      {value.length === 0 ? null : (
        <ul className="space-y-1">
          {value.map((r, idx) => (
            <li
              key={idx}
              className="grid grid-cols-[1fr_80px_80px_80px_80px_auto] items-end gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
            >
              <div className="space-y-0.5">
                <Label className="text-[10px]">Classname</Label>
                <ClassnamePicker
                  value={r.ClassName}
                  onChange={(v) => update(idx, { ClassName: v })}
                  known={knownClassnames}
                  getMutedState={getMutedState}
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Amount</Label>
                <Input
                  type="number"
                  value={r.Amount}
                  onChange={(e) =>
                    update(idx, { Amount: Number(e.target.value) || 0 })
                  }
                  className="h-7 text-right text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Chance</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={1}
                  value={r.Chance}
                  onChange={(e) =>
                    update(idx, { Chance: Number(e.target.value) })
                  }
                  className="h-7 text-right text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Damage %</Label>
                <Input
                  type="number"
                  value={r.DamagePercent}
                  onChange={(e) =>
                    update(idx, {
                      DamagePercent: Number(e.target.value) || 0,
                    })
                  }
                  className="h-7 text-right text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[10px]">Health %</Label>
                <Input
                  type="number"
                  value={r.HealthPercent}
                  onChange={(e) =>
                    update(idx, {
                      HealthPercent: Number(e.target.value) || 0,
                    })
                  }
                  className="h-7 text-right text-xs"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onChange(value.filter((_, i) => i !== idx))}
              >
                <Trash2 className="h-3 w-3 text-severity-error" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => onChange([...value, { ...DEFAULT_QUEST_REWARD }])}
      >
        <Plus className="mr-1 h-3 w-3" /> Add reward
      </Button>
      <p className="text-[10px] text-muted-foreground">
        <ArrowRight className="mr-0.5 inline h-2.5 w-2.5" />
        Attachments on reward items fall back to the Raw JSON editor
        via the data browser — nested attachments aren't typed yet.
      </p>
    </section>
  );
}

