import { useNavigate } from "react-router-dom";
import { Workflow } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Visual walkthrough of DayZ's Central Economy spawn pipeline. Three
 * lanes — Loot, Events, Players — each showing which mission files
 * feed the CE engine and what ends up in the world. File boxes are
 * clickable and jump to the matching editor page.
 *
 * The SVG is hand-laid-out (positions in constants below) because a
 * programmatic graph layout would be overkill for 3 × n static nodes
 * and would read worse at this density.
 */

export function SpawnFlowPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        icon={Workflow}
        title="Spawn flow"
        description="How items, events, and players end up in the world — and which editor page controls which step."
      />
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base tracking-wide">
              Three loops, one world
            </CardTitle>
            <CardDescription className="text-xs">
              DayZ runs three independent loops on the server — loot
              distribution, dynamic events, and player spawning. Each
              pulls data from a different subset of the mission files.
              Click any file to open its editor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpawnFlowDiagram />
          </CardContent>
        </Card>

        <Legend />
      </div>
    </div>
  );
}

// ---------- Diagram ----------

interface FileNode {
  /** File path as shown in the box. */
  label: string;
  /** Route to navigate to on click. */
  to: string;
  /** Optional tag badge for the role the file plays in the flow. */
  tag?: string;
}

interface Lane {
  id: string;
  title: string;
  subtitle: string;
  colour: "rust" | "olive" | "cream";
  sources: FileNode[];
  engineLabel: string;
  engineHint: string;
  output: { title: string; detail: string };
}

const LANES: Lane[] = [
  {
    id: "loot",
    title: "Loot loop",
    subtitle: "What spawns in buildings and containers",
    colour: "rust",
    sources: [
      { label: "cfglimitsdefinition.xml", to: "/app/zones-tiers", tag: "vocabulary" },
      { label: "types.xml", to: "/app/items", tag: "items" },
      { label: "cfgignorelist.xml", to: "/app/ignorelist", tag: "filter" },
      { label: "cfgspawnabletypes.xml", to: "/app/loadouts", tag: "cargo" },
      { label: "cfgrandompresets.xml", to: "/app/loadouts", tag: "pools" },
      { label: "mapgroupproto.xml", to: "/app/buildings", tag: "prototypes" },
      { label: "mapgrouppos.xml", to: "/app/buildings", tag: "placements" },
    ],
    engineLabel: "CE loot loop",
    engineHint: "picks type → matches usage → finds loot point → attaches cargo",
    output: {
      title: "Item in container",
      detail: "Loot inside a building at a tagged point",
    },
  },
  {
    id: "events",
    title: "Event loop",
    subtitle: "Vehicles, heli crashes, infected territories",
    colour: "olive",
    sources: [
      { label: "events.xml", to: "/app/events", tag: "definitions" },
      { label: "cfgeventspawns.xml", to: "/app/events", tag: "positions" },
    ],
    engineLabel: "CE event loop",
    engineHint: "ticks nominal timer → picks position → resolves child pool",
    output: {
      title: "Dynamic event instance",
      detail: "Vehicle / crash / territory in the world",
    },
  },
  {
    id: "players",
    title: "Player spawn",
    subtitle: "Where new characters arrive and what they carry",
    colour: "cream",
    sources: [
      { label: "cfgplayerspawnpoints.xml", to: "/app/player-spawns", tag: "bubbles" },
      { label: "cfgPlayerSpawnGear.json", to: "/app/gear-sets", tag: "gear" },
    ],
    engineLabel: "Spawn controller",
    engineHint: "picks fresh/hop/travel bubble → attaches gear → applies protection",
    output: {
      title: "Spawned player",
      detail: "New character with first-tick loadout",
    },
  },
];

/** Runtime-tuning files that feed every loop — rendered as a shared
 *  footer lane with arrows branching up into all three engines. */
const RUNTIME_TUNING: FileNode[] = [
  { label: "globals.xml", to: "/app/globals", tag: "ce tuning" },
  { label: "cfggameplay.json", to: "/app/gameplay", tag: "mission tuning" },
];

// Layout constants — single source of truth so the SVG stays readable.
const VB_W = 1200;
const VB_H = 820;

const COL = {
  filesX: 32,
  filesW: 340,
  engineX: 500,
  engineW: 220,
  outputX: 820,
  outputW: 340,
};

// Lane vertical bands. Leaves room at the bottom for the shared
// runtime-tuning lane.
const LANE_TOP = 70;
const LANE_GAP = 24;
const LANE_HEIGHTS = { loot: 220, events: 110, players: 110 };
const LANE_Y = {
  loot: LANE_TOP,
  events: LANE_TOP + LANE_HEIGHTS.loot + LANE_GAP,
  players:
    LANE_TOP +
    LANE_HEIGHTS.loot +
    LANE_GAP +
    LANE_HEIGHTS.events +
    LANE_GAP,
};
const RUNTIME_Y =
  LANE_Y.players + LANE_HEIGHTS.players + LANE_GAP + 8;

function SpawnFlowDiagram() {
  const navigate = useNavigate();
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full min-w-[960px]"
        role="img"
        aria-label="DayZ spawn flow — three CE loops and their source files"
      >
        {/* Subtle grid background for the tactical feel — very low
            contrast so it doesn't compete with the content. */}
        <defs>
          <pattern
            id="grid"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(232, 228, 217, 0.05)"
              strokeWidth="1"
            />
          </pattern>

          {/* Arrowheads per lane colour. SVG markers need to be defined
              once and referenced by URL. */}
          {(["rust", "olive", "cream"] as const).map((c) => (
            <marker
              key={c}
              id={`arrow-${c}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={colourHex(c)} />
            </marker>
          ))}
        </defs>

        <rect
          x="0"
          y="0"
          width={VB_W}
          height={VB_H}
          fill="url(#grid)"
          pointerEvents="none"
        />

        {/* Column headers */}
        <ColumnLabel x={COL.filesX} label="Source files" />
        <ColumnLabel x={COL.engineX} label="CE engine" />
        <ColumnLabel x={COL.outputX} label="World" />

        {LANES.map((lane) => (
          <LaneRow
            key={lane.id}
            lane={lane}
            y={LANE_Y[lane.id as keyof typeof LANE_Y]}
            height={LANE_HEIGHTS[lane.id as keyof typeof LANE_HEIGHTS]}
            onNavigate={navigate}
          />
        ))}

        {/* Shared runtime tuning row — two files wide, feeding all
            three engines above with dashed lines. */}
        <RuntimeTuningRow
          y={RUNTIME_Y}
          files={RUNTIME_TUNING}
          onNavigate={navigate}
        />
      </svg>
    </div>
  );
}

function colourHex(c: "rust" | "olive" | "cream"): string {
  switch (c) {
    case "rust":
      return "#d47028";
    case "olive":
      return "#8ba376";
    case "cream":
      return "#e8e4d9";
  }
}

function colourSoft(c: "rust" | "olive" | "cream"): string {
  switch (c) {
    case "rust":
      return "rgba(212, 112, 40, 0.35)";
    case "olive":
      return "rgba(139, 163, 118, 0.35)";
    case "cream":
      return "rgba(232, 228, 217, 0.35)";
  }
}

function ColumnLabel({ x, label }: { x: number; label: string }) {
  return (
    <text
      x={x}
      y={36}
      fill="#8ba376"
      fontFamily="JetBrains Mono, monospace"
      fontSize="10"
      letterSpacing="0.3em"
    >
      {label.toUpperCase()}
    </text>
  );
}

function LaneRow({
  lane,
  y,
  height,
  onNavigate,
}: {
  lane: Lane;
  y: number;
  height: number;
  onNavigate: (to: string) => void;
}) {
  const colour = colourHex(lane.colour);
  const soft = colourSoft(lane.colour);

  const fileRowH = 26;
  const fileGap = 4;
  const stackH = lane.sources.length * fileRowH + (lane.sources.length - 1) * fileGap;
  const firstFileY = y + (height - stackH) / 2;

  const engineY = y + height / 2;
  const outputY = y + height / 2;

  return (
    <g>
      {/* Lane label left of everything — vertical-ish marker with
          title + subtitle. */}
      <g transform={`translate(4, ${y + 14})`}>
        <rect
          x="0"
          y="0"
          width="4"
          height={height - 18}
          fill={colour}
          rx="2"
        />
      </g>
      <text
        x={COL.filesX}
        y={y - 6}
        fill="#e8e4d9"
        fontFamily="Oswald, sans-serif"
        fontSize="13"
        fontWeight="600"
        letterSpacing="0.06em"
      >
        {lane.title.toUpperCase()}
      </text>
      <text
        x={COL.filesX + 120}
        y={y - 6}
        fill="#a8a496"
        fontFamily="IBM Plex Sans, sans-serif"
        fontSize="10"
      >
        {lane.subtitle}
      </text>

      {/* File stack */}
      {lane.sources.map((src, i) => {
        const fy = firstFileY + i * (fileRowH + fileGap);
        return (
          <FileBox
            key={src.label}
            x={COL.filesX}
            y={fy}
            w={COL.filesW}
            h={fileRowH}
            file={src}
            colour={colour}
            onClick={() => onNavigate(src.to)}
          />
        );
      })}

      {/* Connector lines from each file's right edge to engine's left
          edge, with animated pulse dots travelling along each. */}
      {lane.sources.map((src, i) => {
        const fy = firstFileY + i * (fileRowH + fileGap) + fileRowH / 2;
        const pathId = `flow-${lane.id}-${i}`;
        return (
          <g key={src.label}>
            <path
              id={pathId}
              d={buildSmoothPath(
                COL.filesX + COL.filesW,
                fy,
                COL.engineX,
                engineY,
              )}
              stroke={soft}
              strokeWidth="1.5"
              fill="none"
            />
            <circle r="3" fill={colour}>
              <animateMotion
                dur={`${2.8 + (i % 3) * 0.4}s`}
                repeatCount="indefinite"
                begin={`${i * 0.35}s`}
              >
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          </g>
        );
      })}

      {/* Engine node */}
      <EngineNode
        x={COL.engineX}
        y={engineY}
        w={COL.engineW}
        label={lane.engineLabel}
        hint={lane.engineHint}
        colour={colour}
      />

      {/* Engine → output line */}
      <g>
        <line
          x1={COL.engineX + COL.engineW}
          y1={engineY}
          x2={COL.outputX}
          y2={outputY}
          stroke={colour}
          strokeWidth="2"
          markerEnd={`url(#arrow-${lane.colour})`}
        />
        <circle r="3.5" fill={colour}>
          <animateMotion dur="2s" repeatCount="indefinite">
            <mpath
              href={`#engine-to-output-${lane.id}`}
            />
          </animateMotion>
        </circle>
        <path
          id={`engine-to-output-${lane.id}`}
          d={`M ${COL.engineX + COL.engineW} ${engineY} L ${COL.outputX - 6} ${outputY}`}
          fill="none"
          stroke="none"
        />
      </g>

      {/* World output */}
      <OutputNode
        x={COL.outputX}
        y={outputY}
        w={COL.outputW}
        title={lane.output.title}
        detail={lane.output.detail}
        colour={colour}
      />
    </g>
  );
}

function buildSmoothPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  // Cubic bezier sliding into the engine node — gives the data flow
  // that "cabling" look instead of hard polylines.
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

function FileBox({
  x,
  y,
  w,
  h,
  file,
  colour,
  onClick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  file: FileNode;
  colour: string;
  onClick: () => void;
}) {
  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
    >
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx="2"
        fill="#1f2420"
        stroke="rgba(232, 228, 217, 0.14)"
        strokeWidth="1"
        className="transition-colors hover:fill-[#2a2f26]"
      />
      {/* Left-edge accent marker */}
      <rect x={x} y={y} width="3" height={h} fill={colour} />
      <text
        x={x + 12}
        y={y + h / 2 + 4}
        fill="#e8e4d9"
        fontFamily="JetBrains Mono, monospace"
        fontSize="11"
      >
        {file.label}
      </text>
      {file.tag ? (
        <text
          x={x + w - 8}
          y={y + h / 2 + 3.5}
          fill="#a8a496"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9"
          textAnchor="end"
          letterSpacing="0.15em"
        >
          {file.tag.toUpperCase()}
        </text>
      ) : null}
    </g>
  );
}

function EngineNode({
  x,
  y,
  w,
  label,
  hint,
  colour,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  hint: string;
  colour: string;
}) {
  const h = 70;
  return (
    <g transform={`translate(0, ${y - h / 2})`}>
      <rect
        x={x}
        y={0}
        width={w}
        height={h}
        rx="4"
        fill="#2a2f26"
        stroke={colour}
        strokeWidth="1.5"
      />
      <circle
        cx={x + 22}
        cy={h / 2}
        r="8"
        fill={colour}
        opacity="0.9"
      >
        <animate
          attributeName="opacity"
          values="0.5;1;0.5"
          dur="2s"
          repeatCount="indefinite"
        />
      </circle>
      <text
        x={x + 40}
        y={h / 2 - 4}
        fill="#e8e4d9"
        fontFamily="Oswald, sans-serif"
        fontSize="13"
        fontWeight="600"
        letterSpacing="0.06em"
      >
        {label.toUpperCase()}
      </text>
      <text
        x={x + 40}
        y={h / 2 + 14}
        fill="#a8a496"
        fontFamily="IBM Plex Sans, sans-serif"
        fontSize="10"
      >
        {hint}
      </text>
    </g>
  );
}

function OutputNode({
  x,
  y,
  w,
  title,
  detail,
  colour,
}: {
  x: number;
  y: number;
  w: number;
  title: string;
  detail: string;
  colour: string;
}) {
  const h = 64;
  return (
    <g transform={`translate(0, ${y - h / 2})`}>
      <rect
        x={x}
        y={0}
        width={w}
        height={h}
        rx="3"
        fill="#1a1e1a"
        stroke={colour}
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <text
        x={x + 16}
        y={h / 2 - 4}
        fill="#e8e4d9"
        fontFamily="Oswald, sans-serif"
        fontSize="13"
        fontWeight="500"
        letterSpacing="0.04em"
      >
        {title.toUpperCase()}
      </text>
      <text
        x={x + 16}
        y={h / 2 + 14}
        fill="#a8a496"
        fontFamily="IBM Plex Sans, sans-serif"
        fontSize="10"
      >
        {detail}
      </text>
    </g>
  );
}

function RuntimeTuningRow({
  y,
  files,
  onNavigate,
}: {
  y: number;
  files: FileNode[];
  onNavigate: (to: string) => void;
}) {
  const fileW = 230;
  const gap = 20;
  const totalW = files.length * fileW + (files.length - 1) * gap;
  const startX = COL.filesX + (COL.filesW - totalW) / 2 + 20;

  return (
    <g>
      <text
        x={COL.filesX}
        y={y - 14}
        fill="#6b7a4f"
        fontFamily="JetBrains Mono, monospace"
        fontSize="10"
        letterSpacing="0.3em"
      >
        RUNTIME TUNING · FEEDS ALL LOOPS
      </text>

      {files.map((f, i) => (
        <FileBox
          key={f.label}
          x={startX + i * (fileW + gap)}
          y={y}
          w={fileW}
          h={32}
          file={f}
          colour="#6b7a4f"
          onClick={() => onNavigate(f.to)}
        />
      ))}

      {/* Dashed lines branching from each runtime-tuning file up to
          the centres of each engine node. Subtle — they shouldn't
          compete with the primary lane flows. */}
      {files.map((_, i) => {
        const fromX = startX + i * (fileW + gap) + fileW / 2;
        const fromY = y;
        return (
          <g key={i}>
            {(["loot", "events", "players"] as const).map((lane) => {
              const toY =
                LANE_Y[lane] +
                LANE_HEIGHTS[lane as keyof typeof LANE_HEIGHTS] / 2;
              const toX = COL.engineX + COL.engineW / 2;
              return (
                <line
                  key={lane}
                  x1={fromX}
                  y1={fromY}
                  x2={toX}
                  y2={toY + 35}
                  stroke="rgba(107, 122, 79, 0.25)"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

// ---------- Legend ----------

function Legend() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-display text-base tracking-wide">
          Reading the diagram
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
          <LegendRow
            swatch="rust"
            label="Loot loop"
            body="CE's main loop ticks every few seconds, picks a type from types.xml honouring nominal/min, finds a matching usage zone on a loot point inside a building prototype, attaches cargo from cfgspawnabletypes, and spawns the item. cfgignorelist sidesteps types."
          />
          <LegendRow
            swatch="olive"
            label="Event loop"
            body="events.xml declares WHAT events exist (nominal, min, lifetime, child pool). cfgeventspawns.xml says WHERE each can land. The CE event scheduler picks both and drops the instance into the world."
          />
          <LegendRow
            swatch="cream"
            label="Player spawn"
            body="cfgplayerspawnpoints.xml holds the fresh/hop/travel bubble lists. cfgPlayerSpawnGear.json assigns starting gear. cfggameplay.json + globals.xml tune the rules (login protection, respawn dialog)."
          />
          <LegendRow
            swatch="olive-mid"
            label="Runtime tuning"
            body="globals.xml and cfggameplay.json cross-cut all three loops — cleanup timers, caps, respawn rules. That's why the lines from those files branch into every engine on the diagram."
          />
        </ul>
      </CardContent>
    </Card>
  );
}

function LegendRow({
  swatch,
  label,
  body,
}: {
  swatch: "rust" | "olive" | "cream" | "olive-mid";
  label: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-border p-3">
      <span
        className={cn(
          "mt-1 h-3 w-3 shrink-0 rounded-[2px]",
          swatch === "rust" && "bg-brand-rust",
          swatch === "olive" && "bg-brand-olive-light",
          swatch === "cream" && "bg-brand-cream",
          swatch === "olive-mid" && "bg-brand-olive-mid",
        )}
      />
      <div>
        <div className="font-display text-xs tracking-wide text-foreground">
          {label.toUpperCase()}
        </div>
        <p className="mt-0.5 leading-relaxed">{body}</p>
      </div>
    </li>
  );
}
