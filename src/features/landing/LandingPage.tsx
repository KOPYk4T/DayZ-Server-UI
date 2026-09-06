import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared landing-page shell used by the three working-area
 * overviews (Mission / Server / Deploy). A landing is just:
 *
 * - a title + blurb explaining what this area edits
 * - an optional row of headline stats
 * - a card grid linking into every sub-page with a one-line
 *   description + a stat snippet
 *
 * Each consumer assembles its own stats/sections arrays and hands
 * them to `<LandingPage>`; no landing-specific layout lives in the
 * consumers.
 */

export interface LandingStat {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface LandingCard {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  stat?: string;
  /** When set, badge rendered to the right of the title. */
  badge?: string;
  /** Opt out of navigation and show a "coming soon" style. */
  disabled?: boolean;
}

export interface LandingPageProps {
  title: string;
  intro: string;
  stats?: LandingStat[];
  sections: LandingCard[];
  /** Raw React node rendered below the card grid — for any area-
   *  specific callout (e.g. "push ready" banner on Deploy). */
  footer?: React.ReactNode;
}

export function LandingPage({
  title,
  intro,
  stats,
  sections,
  footer,
}: LandingPageProps) {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {intro}
        </p>
      </div>

      {stats && stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((c) => (
          <SectionCard key={c.to} card={c} />
        ))}
      </div>

      {footer}
    </div>
  );
}

function StatCard({ stat }: { stat: LandingStat }) {
  const Icon = stat.icon;
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          {Icon ? <Icon className="h-3 w-3" /> : null}
          {stat.label}
        </div>
        <div className="mt-1 text-xl font-semibold tabular-nums">
          {stat.value}
        </div>
        {stat.hint ? (
          <div className="mt-1 truncate text-[11px] text-muted-foreground">
            {stat.hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SectionCard({ card }: { card: LandingCard }) {
  const navigate = useNavigate();
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={() => !card.disabled && navigate(card.to)}
      disabled={card.disabled}
      className={cn(
        "group flex h-full flex-col rounded-lg border border-border/60 bg-card p-4 text-left transition-colors",
        card.disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-border hover:bg-muted/30",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{card.label}</span>
        {card.badge ? (
          <Badge variant="outline" className="ml-auto text-[9px]">
            {card.badge}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{card.description}</p>
      <div className="mt-auto flex items-center justify-between pt-3 text-[11px]">
        <span className="font-mono tabular-nums text-muted-foreground">
          {card.stat ?? "\u00a0"}
        </span>
        {!card.disabled ? (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        ) : null}
      </div>
    </button>
  );
}

/** Exports for unit-ish imports — used by the area-specific
 *  landings to share helper types without pulling the component. */
export type { LandingStat as _LandingStat };

// Re-export Card primitives so consumers can build richer sections
// inside a landing page if needed. (Mission doesn't use them today
// but the Deploy page surfaces a full Card for the workspace status
// block.)
export { Card, CardContent, CardDescription, CardHeader, CardTitle };
