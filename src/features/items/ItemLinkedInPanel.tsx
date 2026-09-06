import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Box,
  Layers,
  Loader2,
  Package,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getItemLinks } from "./linkedIn";
import type {
  EventChildRef,
  PresetMembershipRef,
  SpawnableItemRef,
} from "./linkedIn";
import { useItemLinkIndexes } from "./useItemLinks";

interface Props {
  itemName: string;
  /** Called with a classname to navigate within the Items page itself
   *  (e.g. click a spawnable row whose parent is another item). */
  onNavigateToItem?: (name: string) => void;
}

export function ItemLinkedInPanel({ itemName, onNavigateToItem }: Props) {
  const navigate = useNavigate();
  const { indexes, loading } = useItemLinkIndexes();
  const links = getItemLinks(indexes, itemName);

  if (loading && !links.hasAny) {
    return (
      <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Indexing events, spawnables, and presets…
      </div>
    );
  }

  return (
    <div className="space-y-4 px-6 py-4 text-xs">
      <p className="leading-relaxed text-muted-foreground">
        Every place this classname is currently referenced across the
        loaded config. Changes to those rules take effect on the next
        server restart, same as anything else.
      </p>

      {/* Loadout on this item */}
      <Section
        icon={<Package className="h-3.5 w-3.5" />}
        title="Spawnable loadout"
        description="A cfgspawnabletypes entry where this classname is the parent — i.e. CE fills its slots and cargo on every spawn."
      >
        {links.loadout ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
            <span>
              Has a loadout:{" "}
              <strong>
                {links.loadout.attachments.length} attachments
              </strong>
              ,{" "}
              <strong>{links.loadout.cargo.length} cargo</strong> groups.
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="ml-auto"
              onClick={() =>
                navigate(
                  `/app/loadouts?tab=spawnables&name=${encodeURIComponent(itemName)}`,
                )
              }
            >
              Open loadout <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border/60 p-2 text-muted-foreground">
            No loadout — this item spawns bare. To give it attachments or
            cargo you'd create an entry on the Loadouts page with this
            classname as the parent.
          </p>
        )}
      </Section>

      {/* Used in other loadouts */}
      {links.usedInLoadouts.length > 0 ? (
        <Section
          icon={<Package className="h-3.5 w-3.5" />}
          title={`Used in ${links.usedInLoadouts.length} other loadout${
            links.usedInLoadouts.length === 1 ? "" : "s"
          }`}
          description="Other spawnables that include this classname as an attachment or cargo item — i.e. this item is loot that spawns inside / on those parents."
        >
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {links.usedInLoadouts.map((ref, i) => (
              <RefRow
                key={`${ref.parentName}-${ref.where}-${ref.groupIndex}-${i}`}
                title={ref.parentName}
                subtitle={describeSpawnableRef(ref)}
                onClick={() => {
                  if (onNavigateToItem && indexes.loadoutByParent.has(ref.parentName)) {
                    // If the parent is also in the items registry, stay on
                    // Items and open the parent item's drawer.
                    onNavigateToItem(ref.parentName);
                  } else {
                    navigate(
                      `/app/loadouts?tab=spawnables&name=${encodeURIComponent(ref.parentName)}`,
                    );
                  }
                }}
              />
            ))}
          </ul>
          <p className="mt-1 text-[10px] italic text-muted-foreground/80">
            Clicking a row opens the parent's loadout so you can see /
            edit where this item is placed.
          </p>
        </Section>
      ) : null}

      {/* Event children */}
      {links.usedInEvents.length > 0 ? (
        <Section
          icon={<Target className="h-3.5 w-3.5" />}
          title={`Child of ${links.usedInEvents.length} event${
            links.usedInEvents.length === 1 ? "" : "s"
          }`}
          description="Dynamic events whose <children> list includes this classname — i.e. the item spawns from events like helicrashes, police cars, shipwrecks, hordes, etc."
        >
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {links.usedInEvents.map((ref, i) => (
              <RefRow
                key={`${ref.eventName}-${ref.childIndex}-${i}`}
                title={ref.eventName}
                subtitle={describeEventRef(ref)}
                onClick={() =>
                  navigate(
                    `/app/events?name=${encodeURIComponent(ref.eventName)}`,
                  )
                }
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {/* Preset memberships */}
      {links.usedInPresets.length > 0 ? (
        <Section
          icon={<Layers className="h-3.5 w-3.5" />}
          title={`In ${links.usedInPresets.length} random preset${
            links.usedInPresets.length === 1 ? "" : "s"
          }`}
          description="Random presets whose item pool lists this classname. Any spawnable group referencing one of these presets rolls this item with the shown weight."
        >
          <ul className="divide-y divide-border/50 rounded-md border border-border/60">
            {links.usedInPresets.map((ref, i) => (
              <RefRow
                key={`${ref.presetName}-${i}`}
                title={ref.presetName}
                subtitle={describePresetRef(ref)}
                onClick={() =>
                  navigate(
                    `/app/loadouts?tab=presets&name=${encodeURIComponent(ref.presetName)}`,
                  )
                }
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {!links.hasAny ? (
        <div className="rounded-md border border-dashed border-border/60 p-4 text-muted-foreground">
          <p>
            This item isn't referenced anywhere in the loaded events,
            spawnables, or presets. If you expect it to spawn naturally,
            the usual missing link is a <strong>usage</strong> and{" "}
            <strong>value</strong> tag on its types.xml entry (that's how
            CE picks items for building loot points — see the Fields tab).
            Event-only items need a child entry in a relevant event, and
            loot pack items need inclusion in a cargo group or preset.
          </p>
          <p className="mt-2">
            References in Gear Sets arrive in a later phase and will show
            up here too.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h4 className="text-xs font-semibold uppercase tracking-wide">
          {title}
        </h4>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {children}
    </section>
  );
}

function RefRow({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors hover:bg-accent/40",
        )}
      >
        <span className="flex-1 truncate">
          <span className="font-mono text-foreground">{title}</span>
          <span className="ml-2 text-muted-foreground">{subtitle}</span>
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
      </button>
    </li>
  );
}

function describeSpawnableRef(ref: SpawnableItemRef): string {
  const loc = ref.where === "attachments" ? "attachment" : "cargo";
  const slot = ref.slotName ? ` (${ref.slotName})` : "";
  return `as ${loc} · group #${ref.groupIndex + 1}${slot}`;
}

function describeEventRef(ref: EventChildRef): string {
  const which = ref.extended ? "childEx" : "child";
  const loot =
    ref.lootmin > 0 || ref.lootmax > 0
      ? `loot ${ref.lootmin}–${ref.lootmax}`
      : "no loot";
  return `${which} #${ref.childIndex + 1} · min/max ${ref.min}/${ref.max} · ${loot}`;
}

function describePresetRef(ref: PresetMembershipRef): string {
  return `${ref.kind} · chance ${ref.chance.toFixed(2)}`;
}

/**
 * Compact icon strip for rendering inline in the Items table. Each
 * non-zero indicator is a small icon with a count; zero indicators
 * render as dimmed placeholders so rows stay vertically aligned.
 */
export function ItemLinkBadges({
  counts,
}: {
  counts: {
    hasLoadout: boolean;
    inLoadouts: number;
    inEvents: number;
    inPresets: number;
  };
}) {
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Indicator
        icon={<Package className="h-3 w-3" />}
        count={(counts.hasLoadout ? 1 : 0) + counts.inLoadouts}
        title={`${counts.hasLoadout ? "Has a loadout" : "No loadout"}; used in ${counts.inLoadouts} other loadout(s)`}
      />
      <Indicator
        icon={<Target className="h-3 w-3" />}
        count={counts.inEvents}
        title={`Child of ${counts.inEvents} event(s)`}
      />
      <Indicator
        icon={<Box className="h-3 w-3" />}
        count={counts.inPresets}
        title={`Member of ${counts.inPresets} preset(s)`}
      />
    </div>
  );
}

function Indicator({
  icon,
  count,
  title,
}: {
  icon: React.ReactNode;
  count: number;
  title: string;
}) {
  if (count === 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 opacity-25"
        title={title}
        aria-label={title}
      >
        {icon}
      </span>
    );
  }
  return (
    <Badge
      variant="outline"
      className="h-4 gap-0.5 border-primary/30 px-1 text-[10px] font-normal text-foreground"
      title={title}
    >
      {icon}
      {count}
    </Badge>
  );
}
