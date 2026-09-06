import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  GitBranch,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Scroll,
  Users,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModsScan } from "@/hooks/useMods";
import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";

import { useNpcIndex, useQuestsFolder, useQuestList } from "./useQuestsData";
import type { Quest } from "./types";

/** One quest as it matters for the graph — a narrow slice of the
 *  full `Quest` shape. Fetched per-file and cached with a 10s stale
 *  window so navigating away and back doesn't re-read the tree. */
interface QuestGraphEntry {
  path: string;
  id: number;
  title: string;
  active: boolean;
  type: number;
  preQuestIds: number[];
  followUpQuest: number;
  giverIds: number[];
  turnInIds: number[];
  requiredFaction: string;
}

const NODE_W = 240;
const NODE_H = 96;
const COL_GAP_X = 120;
const ROW_GAP_Y = 28;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export function QuestGraphPage() {
  const modsScan = useModsScan();
  const inv = modsScan.data?.expansion ?? null;
  const folders = useQuestsFolder(inv);
  const list = useQuestList(folders.questsDir);
  const npcIndex = useNpcIndex(folders.npcsDir);

  const active = useProfileStore((s) => s.active);
  const profileId = active?.id ?? null;

  const questFiles = useMemo(
    () =>
      (list.data?.entries ?? []).filter(
        (e) => !e.isDir && e.extension === "json",
      ),
    [list.data],
  );

  const graphQuery = useQuery({
    queryKey:
      profileId && folders.questsDir && questFiles.length > 0
        ? [
            "expansion-quest-graph",
            profileId,
            folders.questsDir,
            questFiles.length,
          ]
        : ["none"],
    queryFn: async () => {
      if (!profileId) return [];
      const entries: QuestGraphEntry[] = [];
      await Promise.all(
        questFiles.map(async (f) => {
          try {
            const raw = await tauri.expansionSettingsRead(
              profileId,
              f.relativePath,
            );
            const q = JSON.parse(raw) as Partial<Quest> & {
              ID?: number;
            };
            if (typeof q.ID !== "number") return;
            entries.push({
              path: f.relativePath,
              id: q.ID,
              title: q.Title?.trim() || `Quest ${q.ID}`,
              active: q.Active === 1,
              type: q.Type ?? 0,
              preQuestIds: Array.isArray(q.PreQuestIDs) ? q.PreQuestIDs : [],
              followUpQuest:
                typeof q.FollowUpQuest === "number" ? q.FollowUpQuest : -1,
              giverIds: Array.isArray(q.QuestGiverIDs)
                ? q.QuestGiverIDs
                : [],
              turnInIds: Array.isArray(q.QuestTurnInIDs)
                ? q.QuestTurnInIDs
                : [],
              requiredFaction: q.RequiredFaction ?? "",
            });
          } catch {
            /* malformed file — skip, same as the index hook */
          }
        }),
      );
      entries.sort((a, b) => a.id - b.id);
      return entries;
    },
    enabled: !!(profileId && folders.questsDir && questFiles.length > 0),
    staleTime: 10_000,
  });

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

  const loading =
    list.isLoading ||
    graphQuery.isLoading ||
    npcIndex.isLoading;

  return (
    <div className="flex h-full flex-col gap-3 p-6">
      <Breadcrumb />
      <header className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Quest graph</h1>
        {graphQuery.data ? (
          <Badge variant="secondary">{graphQuery.data.length} quests</Badge>
        ) : null}
      </header>

      <p className="text-xs text-muted-foreground">
        One node per quest. Solid arrows = prerequisite chains
        (<code>PreQuestIDs</code>). Dashed arrows = follow-ups
        (<code>FollowUpQuest</code>). Columns are auto-ranked by
        prereq depth so root quests sit left, deepest chains right.
        Scroll to zoom, drag the background to pan, click a node to
        open it in the Quests editor.
      </p>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading quests…
        </div>
      ) : graphQuery.data && graphQuery.data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No quests in the workspace yet.
        </div>
      ) : graphQuery.data ? (
        <GraphCanvas
          quests={graphQuery.data}
          npcs={npcIndex.data ?? new Map()}
        />
      ) : null}
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground">
      <Link
        to="/app/mods"
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/60"
      >
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
      <span className="font-medium text-foreground">Graph</span>
    </nav>
  );
}

// ---------- Layout ----------

interface Placed extends QuestGraphEntry {
  rank: number;
  x: number;
  y: number;
}

/** For each quest, compute the set of parent quest IDs — quests
 *  whose existence forces this one to land in a later column.
 *  Parents come from two relations:
 *    1. `PreQuestIDs` — explicit prerequisite chain.
 *    2. Inverse of `FollowUpQuest` — if X.FollowUpQuest === Y, then
 *       X is a parent of Y. Without this inverse, follow-up targets
 *       rank 0 and render at the top of the leftmost column,
 *       visually disconnected from the quest that feeds them.
 *  Self-references are dropped (they'd imply a degenerate cycle). */
function computeParents(
  quests: QuestGraphEntry[],
): Map<number, Set<number>> {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const parents = new Map<number, Set<number>>();
  const add = (child: number, parent: number) => {
    if (child === parent) return;
    if (!byId.has(parent)) return;
    if (!parents.has(child)) parents.set(child, new Set());
    parents.get(child)!.add(parent);
  };
  for (const q of quests) {
    for (const pre of q.preQuestIds) add(q.id, pre);
    if (q.followUpQuest > 0) add(q.followUpQuest, q.id);
  }
  return parents;
}

/** Assign each quest a rank = longest parent-chain length. Parents
 *  include both prerequisites and inverse follow-ups (see
 *  `computeParents`). Cycles are flagged as they're encountered and
 *  forced to a finite rank so they still show up on the canvas. */
function computeRanks(
  quests: QuestGraphEntry[],
  parents: Map<number, Set<number>>,
): { rank: Map<number, number>; cycleMembers: Set<number> } {
  const rank = new Map<number, number>();
  const cycleMembers = new Set<number>();
  const visiting = new Set<number>();

  function visit(id: number): number {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) {
      cycleMembers.add(id);
      return 0;
    }
    const p = parents.get(id);
    if (!p || p.size === 0) {
      rank.set(id, 0);
      return 0;
    }
    visiting.add(id);
    let r = 0;
    for (const parent of p) r = Math.max(r, visit(parent) + 1);
    visiting.delete(id);
    rank.set(id, r);
    return r;
  }

  for (const q of quests) visit(q.id);
  return { rank, cycleMembers };
}

function layoutQuests(quests: QuestGraphEntry[]): {
  placed: Placed[];
  cycleMembers: Set<number>;
  width: number;
  height: number;
} {
  const parents = computeParents(quests);
  const { rank, cycleMembers } = computeRanks(quests, parents);

  // Bucket by rank. Columns are processed left→right so parent
  // coordinates are known by the time we lay out their children.
  const byRank = new Map<number, QuestGraphEntry[]>();
  for (const q of quests) {
    const r = rank.get(q.id) ?? 0;
    const bucket = byRank.get(r) ?? [];
    bucket.push(q);
    byRank.set(r, bucket);
  }

  const placed: Placed[] = [];
  const placedById = new Map<number, Placed>();
  let maxY = 0;
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const STEP = NODE_H + ROW_GAP_Y;
  for (const r of ranks) {
    const bucket = byRank.get(r)!;
    // Each quest's target y is the mean y of its already-placed
    // parents ("barycenter"). Quests with no placed parent fall
    // back to 0 — roots stack from the top of the column; children
    // of a deeper parent align with that parent.
    const withHint = bucket.map((q) => {
      const p = parents.get(q.id);
      if (!p || p.size === 0) return { q, hint: 0, anchored: false };
      let sum = 0;
      let count = 0;
      for (const pid of p) {
        const parent = placedById.get(pid);
        if (parent) {
          sum += parent.y;
          count += 1;
        }
      }
      if (count === 0) return { q, hint: 0, anchored: false };
      return { q, hint: sum / count, anchored: true };
    });
    // Anchored quests lay out first (ascending by target y); then
    // orphans / cycle members stack tightly after so they don't
    // steal top-of-column slots that belong to chained quests.
    withHint.sort((a, b) => {
      if (a.anchored !== b.anchored) return a.anchored ? -1 : 1;
      if (a.hint !== b.hint) return a.hint - b.hint;
      return a.q.id - b.q.id;
    });
    // Running-max sweep: each quest wants to sit at its hint y, but
    // we bump it down as needed so sibling cards don't overlap. The
    // gap between a chained quest and the one above is preserved —
    // that's what ties a follow-up visually to its source row.
    let nextY = 0;
    for (const { q, hint, anchored } of withHint) {
      const targetY = anchored ? hint : nextY;
      const y = Math.max(targetY, nextY);
      const p: Placed = {
        ...q,
        rank: r,
        x: r * (NODE_W + COL_GAP_X),
        y,
      };
      placed.push(p);
      placedById.set(q.id, p);
      nextY = y + STEP;
      maxY = Math.max(maxY, y + NODE_H);
    }
  }
  const maxRank = ranks.length === 0 ? 0 : ranks[ranks.length - 1];
  const width = (maxRank + 1) * (NODE_W + COL_GAP_X);
  return { placed, cycleMembers, width, height: maxY };
}

// ---------- Canvas ----------

function GraphCanvas({
  quests,
  npcs,
}: {
  quests: QuestGraphEntry[];
  npcs: Map<number, { name: string; path: string }>;
}) {
  const { placed, cycleMembers, width, height } = useMemo(
    () => layoutQuests(quests),
    [quests],
  );
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 24, y: 24 });
  const [zoom, setZoom] = useState(1);

  // Pan by dragging the background (not nodes). Start / end tracked
  // via pointer events — works with mouse and trackpad.
  const dragState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target.closest("[data-quest-node]")) return;
    dragState.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragState.current;
    if (!d) return;
    setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
  };
  const onPointerUp = () => {
    dragState.current = null;
  };

  // Mouse wheel zoom centred at the cursor so the bit the user is
  // looking at stays roughly under the cursor across zoom changes.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = -e.deltaY * 0.0015;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (1 + delta)));
    if (nextZoom === zoom) return;
    const ratio = nextZoom / zoom;
    setZoom(nextZoom);
    setPan((p) => ({
      x: cx - (cx - p.x) * ratio,
      y: cy - (cy - p.y) * ratio,
    }));
  };

  const resetView = () => {
    setPan({ x: 24, y: 24 });
    setZoom(1);
  };

  // Prereq edges (solid) and follow-up edges (dashed). Skip edges
  // whose counterpart isn't in the workspace — the node itself is
  // rendered as "unknown" inline so the graph is still useful.
  const prereqEdges: Array<{ fromId: number; toId: number }> = [];
  const followUpEdges: Array<{ fromId: number; toId: number }> = [];
  for (const q of placed) {
    for (const pre of q.preQuestIds) {
      if (byId.has(pre)) prereqEdges.push({ fromId: pre, toId: q.id });
    }
    if (q.followUpQuest > 0 && byId.has(q.followUpQuest)) {
      followUpEdges.push({ fromId: q.id, toId: q.followUpQuest });
    }
  }

  const viewStyle: React.CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "0 0",
    width,
    height,
  };

  return (
    <div className="relative flex-1 overflow-hidden rounded-md border border-border/60 bg-muted/10">
      <div
        ref={containerRef}
        className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      >
        <div className="absolute top-0 left-0" style={viewStyle}>
          <svg
            width={width}
            height={height}
            className="pointer-events-none absolute top-0 left-0"
          >
            <defs>
              <marker
                id="arrow-solid"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
              <marker
                id="arrow-dashed"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            {prereqEdges.map((e, i) => (
              <EdgePath
                key={`pre-${i}`}
                from={byId.get(e.fromId)!}
                to={byId.get(e.toId)!}
                color="rgb(59 130 246)" // blue-500
                marker="arrow-solid"
              />
            ))}
            {followUpEdges.map((e, i) => (
              <EdgePath
                key={`fu-${i}`}
                from={byId.get(e.fromId)!}
                to={byId.get(e.toId)!}
                color="rgb(168 85 247)" // purple-500
                marker="arrow-dashed"
                dashed
              />
            ))}
          </svg>
          {placed.map((q) => (
            <QuestNode
              key={q.id}
              quest={q}
              npcs={npcs}
              cycleMember={cycleMembers.has(q.id)}
            />
          ))}
        </div>
      </div>

      {/* Floating controls: zoom + reset. Pointer-events kept on
          so clicks don't bleed to the pan handler underneath. */}
      <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-md border border-border/60 bg-background/90 px-1 py-1 shadow-sm backdrop-blur">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() =>
            setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))
          }
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[3ch] text-center font-mono text-[10px] tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() =>
            setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))
          }
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={resetView}
          title="Reset view"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <LegendOverlay />
    </div>
  );
}

function EdgePath({
  from,
  to,
  color,
  marker,
  dashed,
}: {
  from: Placed;
  to: Placed;
  color: string;
  marker: string;
  dashed?: boolean;
}) {
  // Start at the right edge of `from`, end at the left edge of `to`.
  // Horizontal cubic Bezier so edges in the same column gutter don't
  // visually collide.
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const dx = Math.max(40, (x2 - x1) / 2);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  const d = `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`;
  return (
    <path
      d={d}
      stroke={color}
      strokeWidth={1.5}
      fill="none"
      strokeDasharray={dashed ? "5 4" : undefined}
      markerEnd={`url(#${marker})`}
      style={{ color }}
    />
  );
}

function QuestNode({
  quest,
  npcs,
  cycleMember,
}: {
  quest: Placed;
  npcs: Map<number, { name: string; path: string }>;
  cycleMember: boolean;
}) {
  const giverNames = quest.giverIds
    .map((id) => npcs.get(id)?.name)
    .filter((n): n is string => !!n);
  const turnInNames = quest.turnInIds
    .map((id) => npcs.get(id)?.name)
    .filter((n): n is string => !!n);
  const unknownGivers = quest.giverIds.filter((id) => !npcs.has(id)).length;
  const unknownTurnIns = quest.turnInIds.filter(
    (id) => !npcs.has(id),
  ).length;

  return (
    <Link
      to={`/app/mods/expansion/quests?path=${encodeURIComponent(quest.path)}`}
      data-quest-node
      className={`absolute flex flex-col gap-1 rounded-md border bg-background p-2 text-[11px] shadow-sm transition-colors hover:border-primary hover:bg-primary/5 ${
        quest.active
          ? "border-border/60"
          : "border-border/40 opacity-60"
      } ${cycleMember ? "ring-2 ring-severity-warning/60" : ""}`}
      style={{
        left: quest.x,
        top: quest.y,
        width: NODE_W,
        height: NODE_H,
      }}
      title={cycleMember ? "Prerequisite cycle detected — check PreQuestIDs" : undefined}
    >
      <div className="flex items-center gap-1.5">
        <Scroll className="h-3 w-3 shrink-0 text-primary" />
        <Badge variant="outline" className="shrink-0 font-mono text-[9px]">
          #{quest.id}
        </Badge>
        <span className="truncate font-semibold">{quest.title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 text-[10px] text-muted-foreground">
        {giverNames.length > 0 || unknownGivers > 0 ? (
          <div className="flex items-center gap-1">
            <Users className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">
              give: {giverNames.join(", ")}
              {unknownGivers > 0
                ? ` (+${unknownGivers} unknown)`
                : ""}
            </span>
          </div>
        ) : null}
        {turnInNames.length > 0 || unknownTurnIns > 0 ? (
          <div className="flex items-center gap-1">
            <Users className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">
              turn-in: {turnInNames.join(", ")}
              {unknownTurnIns > 0
                ? ` (+${unknownTurnIns} unknown)`
                : ""}
            </span>
          </div>
        ) : null}
        {quest.requiredFaction ? (
          <div className="truncate">faction: {quest.requiredFaction}</div>
        ) : null}
      </div>
    </Link>
  );
}

function LegendOverlay() {
  return (
    <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-md border border-border/60 bg-background/90 px-2 py-1.5 text-[10px] shadow-sm backdrop-blur">
      <div className="flex items-center gap-1.5">
        <svg width="22" height="8">
          <line
            x1="0"
            y1="4"
            x2="22"
            y2="4"
            stroke="rgb(59 130 246)"
            strokeWidth="1.5"
          />
        </svg>
        <span>prerequisite</span>
      </div>
      <div className="flex items-center gap-1.5">
        <svg width="22" height="8">
          <line
            x1="0"
            y1="4"
            x2="22"
            y2="4"
            stroke="rgb(168 85 247)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
        </svg>
        <span>follow-up</span>
      </div>
      <div className="flex items-center gap-1.5 text-severity-warning">
        <span className="h-2 w-2 rounded-sm ring-2 ring-severity-warning/60" />
        <span>prereq cycle</span>
      </div>
    </div>
  );
}
