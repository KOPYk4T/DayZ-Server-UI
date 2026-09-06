import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  Save,
  Search,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useModsScan } from "@/hooks/useMods";
import { errorMessage } from "@/lib/utils";
import { FactionPicker } from "@/features/mods/expansion/pickers/FactionPicker";
import { LoadoutPicker } from "@/features/mods/expansion/pickers/LoadoutPicker";
import { QuestNpcClassPicker } from "@/features/mods/expansion/pickers/QuestNpcClassPicker";

import { DEFAULT_QUEST_NPC, type QuestNPC } from "./types";
import { useNpc, useNpcList, useNpcSave, useQuestsFolder } from "./useQuestsData";

export function NpcsPage() {
  const modsScan = useModsScan();
  const inv = modsScan.data?.expansion ?? null;
  const folders = useQuestsFolder(inv);
  const list = useNpcList(folders.npcsDir);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlName = searchParams.get("name");

  const npcFiles = useMemo(
    () =>
      (list.data?.entries ?? [])
        .filter((e) => !e.isDir && e.extension === "json")
        .sort((a, b) => {
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
    if (!urlName || npcFiles.length === 0) return;
    const match = npcFiles.find(
      (e) => e.name.replace(/\.json$/i, "").toLowerCase() === urlName.toLowerCase(),
    );
    if (match) setSelectedPath(match.relativePath);
  }, [urlName, npcFiles]);
  useEffect(() => {
    if (selectedPath || npcFiles.length === 0 || urlName) return;
    setSelectedPath(npcFiles[0].relativePath);
  }, [selectedPath, npcFiles, urlName]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return npcFiles;
    return npcFiles.filter((e) => e.name.toLowerCase().includes(q));
  }, [npcFiles, filter]);

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
        <Users className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Quest NPCs</h1>
        <Badge variant="secondary">{npcFiles.length}</Badge>
        <p className="ml-2 text-xs text-muted-foreground">
          The NPCs quests reference — position, faction, and behavior
          for each <code>QuestNPC_*.json</code>.
        </p>
        <Link
          to="/app/mods/expansion/quests"
          className="ml-auto inline-flex items-center gap-1 rounded border border-border/60 px-2 py-1 text-xs hover:bg-muted/60"
        >
          Edit quests
        </Link>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr] gap-4">
        <aside className="flex min-h-0 flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter NPCs"
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
                <li key={f.relativePath}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPath(f.relativePath);
                      searchParams.delete("name");
                      setSearchParams(searchParams, { replace: true });
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                      selectedPath === f.relativePath
                        ? "bg-primary/10 font-semibold text-primary"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {f.name.replace(/\.json$/i, "")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <NewNpcButton
            npcsDir={folders.npcsDir}
            existingIds={npcFiles
              .map((f) =>
                parseInt(f.name.match(/_(\d+)\.json$/i)?.[1] ?? "", 10),
              )
              .filter((n) => Number.isFinite(n))}
            onCreated={(p) => {
              void list.refetch();
              setSelectedPath(p);
            }}
          />
        </aside>

        <main className="min-h-0 overflow-y-auto">
          {selectedPath ? (
            <NpcEditor path={selectedPath} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select an NPC on the left.
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
      <Link to="/app/mods/expansion/quests" className="hover:underline">
        Quests
      </Link>
      <ChevronRight className="h-3 w-3 opacity-50" />
      <span className="font-medium text-foreground">NPCs</span>
    </nav>
  );
}

function NewNpcButton({
  npcsDir,
  existingIds,
  onCreated,
}: {
  npcsDir: string | null;
  existingIds: number[];
  onCreated: (path: string) => void;
}) {
  const save = useNpcSave();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-1 h-8 text-xs"
      disabled={!npcsDir || save.isPending}
      onClick={() => {
        if (!npcsDir) return;
        const next = (Math.max(0, ...existingIds) || 0) + 1;
        const idStr = prompt("NPC ID:", String(next));
        if (!idStr) return;
        const id = parseInt(idStr, 10);
        if (!Number.isFinite(id) || id < 0) {
          toast.error("invalid ID");
          return;
        }
        if (existingIds.includes(id)) {
          toast.error(`QuestNPC_${id}.json already exists`);
          return;
        }
        const path = `${npcsDir}/QuestNPC_${id}.json`;
        save.mutate(
          {
            path,
            data: {
              ...DEFAULT_QUEST_NPC,
              ID: id,
              NPCName: `NPC ${id}`,
              Waypoints: [[0, 0, 0]],
            },
          },
          {
            onSuccess: () => {
              toast.success(`created QuestNPC_${id}.json`);
              onCreated(path);
            },
            onError: (err) => toast.error(errorMessage(err)),
          },
        );
      }}
    >
      <Plus className="mr-1 h-3 w-3" /> New NPC
    </Button>
  );
}

function NpcEditor({ path }: { path: string }) {
  const query = useNpc(path);
  const save = useNpcSave();
  const [draft, setDraft] = useState<QuestNPC | null>(null);

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

  const stem = path.split("/").pop()!.replace(/\.json$/i, "");
  const dirty =
    query.data != null && JSON.stringify(draft) !== JSON.stringify(query.data);
  const update = <K extends keyof QuestNPC>(k: K, v: QuestNPC[K]) =>
    setDraft({ ...draft, [k]: v });

  const updateVec = (
    key: "Position" | "Orientation",
    axis: 0 | 1 | 2,
    v: number,
  ) => {
    const next = [...draft[key]] as [number, number, number];
    next[axis] = v;
    update(key, next);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>
              {stem}
              {draft.NPCName ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  — {draft.NPCName}
                </span>
              ) : null}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              ID {draft.ID}
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
                      onSuccess: () => toast.success(`saved ${stem}`),
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
              <Label>NPC name (displayed to players)</Label>
              <Input
                value={draft.NPCName}
                onChange={(e) => update("NPCName", e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Classname</Label>
              <QuestNpcClassPicker
                value={draft.ClassName}
                onChange={(v) => update("ClassName", v)}
              />
            </div>
            <div className="col-span-full space-y-1.5">
              <Label>Default dialogue (shown when the NPC has nothing to say)</Label>
              <Input
                value={draft.DefaultNPCText}
                onChange={(e) => update("DefaultNPCText", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Faction</Label>
              <FactionPicker
                value={draft.NPCFaction}
                onChange={(v) => update("NPCFaction", v)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Loadout file (in Loadouts/)</Label>
              <LoadoutPicker
                value={draft.NPCLoadoutFile}
                onChange={(v) => update("NPCLoadoutFile", v)}
                placeholder="e.g. NBCLoadout"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Input
                type="number"
                value={draft.NPCType}
                onChange={(e) =>
                  update("NPCType", Number(e.target.value) || 0)
                }
              />
              <p className="text-[10px] text-muted-foreground">
                2 = AI NPC (most common)
              </p>
            </div>
            <div className="flex items-end gap-2">
              <Switch
                checked={draft.Active === 1}
                onCheckedChange={(v) => update("Active", v ? 1 : 0)}
              />
              <Label className="cursor-pointer">Active</Label>
            </div>
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>
                Position (x / y / z, metres)
              </Label>
              <MapPin className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["X", "Z (height)", "Y"] as const).map((label, axis) => (
                <div key={label} className="space-y-0.5">
                  <Label className="text-[10px]">{label}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.Position[axis]}
                    onChange={(e) =>
                      updateVec(
                        "Position",
                        axis as 0 | 1 | 2,
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              DayZ coord order is (x, y, z) where y is height. Waypoints
              below use the same axis layout.
            </p>
          </section>

          <section className="space-y-1.5">
            <Label>Orientation (yaw / pitch / roll)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["Yaw", "Pitch", "Roll"] as const).map((label, axis) => (
                <div key={label} className="space-y-0.5">
                  <Label className="text-[10px]">{label}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={draft.Orientation[axis]}
                    onChange={(e) =>
                      updateVec(
                        "Orientation",
                        axis as 0 | 1 | 2,
                        Number(e.target.value) || 0,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label>Waypoints ({draft.Waypoints.length})</Label>
              <p className="text-[10px] text-muted-foreground">
                First waypoint should match the NPC's spawn position.
              </p>
            </div>
            {draft.Waypoints.map((wp, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2 rounded-md border border-border/60 px-2 py-1 text-xs"
              >
                <span className="font-mono text-muted-foreground">
                  #{idx + 1}
                </span>
                {(["X", "Z", "Y"] as const).map((label, axis) => (
                  <div key={label} className="space-y-0.5">
                    <Label className="text-[10px]">{label}</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={wp[axis]}
                      onChange={(e) => {
                        const next = draft.Waypoints.map((p, i) =>
                          i === idx
                            ? (() => {
                                const np = [...p] as [number, number, number];
                                np[axis] = Number(e.target.value) || 0;
                                return np;
                              })()
                            : p,
                        );
                        update("Waypoints", next);
                      }}
                      className="h-7 text-right text-xs"
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    update(
                      "Waypoints",
                      draft.Waypoints.filter((_, i) => i !== idx),
                    )
                  }
                  disabled={draft.Waypoints.length <= 1}
                >
                  <Trash2 className="h-3 w-3 text-severity-error" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() =>
                update("Waypoints", [
                  ...draft.Waypoints,
                  [...draft.Position],
                ])
              }
            >
              <Plus className="mr-1 h-3 w-3" /> Add waypoint (copy from position)
            </Button>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Emote ID</Label>
              <Input
                type="number"
                value={draft.NPCEmoteID}
                onChange={(e) =>
                  update("NPCEmoteID", Number(e.target.value) || 0)
                }
              />
            </div>
            <div className="flex items-end gap-2">
              <Switch
                checked={draft.NPCEmoteIsStatic === 1}
                onCheckedChange={(v) =>
                  update("NPCEmoteIsStatic", v ? 1 : 0)
                }
              />
              <Label className="cursor-pointer">Emote is static</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Interaction emote</Label>
              <Input
                type="number"
                value={draft.NPCInteractionEmoteID}
                onChange={(e) =>
                  update(
                    "NPCInteractionEmoteID",
                    Number(e.target.value) || 0,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quest start emote</Label>
              <Input
                type="number"
                value={draft.NPCQuestStartEmoteID}
                onChange={(e) =>
                  update("NPCQuestStartEmoteID", Number(e.target.value) || 0)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quest complete emote</Label>
              <Input
                type="number"
                value={draft.NPCQuestCompleteEmoteID}
                onChange={(e) =>
                  update(
                    "NPCQuestCompleteEmoteID",
                    Number(e.target.value) || 0,
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quest cancel emote</Label>
              <Input
                type="number"
                value={draft.NPCQuestCancelEmoteID}
                onChange={(e) =>
                  update(
                    "NPCQuestCancelEmoteID",
                    Number(e.target.value) || 0,
                  )
                }
              />
            </div>
          </section>

          <p className="text-[10px] text-muted-foreground">
            Emote IDs are Expansion-defined integers — see the{" "}
            <a
              href="https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/Quests"
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Quests wiki
            </a>
            . Loadout file references one of the JSON files in{" "}
            <code>Loadouts/</code> — edit those via the{" "}
            <Link
              to="/app/mods/expansion/loadouts"
              className="underline-offset-2 hover:underline"
            >
              Loadouts editor
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
