import { NavLink } from "react-router-dom";
import {
  Archive,
  ArrowDownToLine,
  BookOpen,
  Boxes,
  Building2,
  EyeOff,
  Gamepad2,
  Home,
  Map as MapIcon,
  MapPin,
  MessagesSquare,
  PackageSearch,
  Rocket,
  Settings,
  Shield,
  ShirtIcon,
  Sliders,
  Target,
  Upload,
  Wrench,
} from "lucide-react";

import { useEnabledAddons } from "@/addons";
import { pickTier, useCapabilities } from "@/capabilities";
import { cn } from "@/lib/utils";
import { useIsAddonEnabled } from "@/stores/addonsStore";
import type { CapabilityTier } from "@/types/ipc";

/**
 * Sidebar information architecture.
 *
 * Four visual tiers, each styled distinctly so the hierarchy reads
 * at a glance even without borders:
 *
 *   MENU         — top-level section. Bold, uppercase, wide tracking.
 *     Category   — grouping under a menu. Small-caps, muted.
 *       Item     — a navigable route. Regular weight, icon left.
 *         sub   — an item nested one level deeper (e.g. per-mod
 *                 configurators under Mods). Dimmer icon, extra
 *                 indent, smaller text.
 *
 * Indent ladder (left padding, in tailwind units):
 *   Menu heading     pl-4   (16px)
 *   Category heading pl-6   (24px)
 *   Item             pl-6   (24px) — under Menu directly
 *   Item             pl-8   (32px) — under Category
 *   Sub-item         pl-12  (48px) — nested deeper (per-mod)
 */

// ---------- Types ----------

export type ItemDepth = "menu" | "category" | "sub";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  /** Visual depth — controls indent + subtlety. Items rendered
   *  directly under a Menu ("App", "Deployment") default to "menu";
   *  items inside a Category default to "category"; anything deeper
   *  (like detected mod entries under Mods) uses "sub". */
  depth?: ItemDepth;
}

interface Category {
  heading: string;
  items: NavItem[];
}

interface SuperGroup {
  kind: "super";
  heading: string;
  icon: React.ComponentType<{ className?: string }>;
  categories: Category[];
  /** Optional trailing node — used to slot the Mods addon's
   *  dynamic sublist into the Game supergroup. */
  extras?: React.ReactNode;
  tier?: import("@/types/ipc").CapabilityTier;
}

interface Group {
  kind: "group";
  heading: string;
  items: NavItem[];
  /** Optional capability tier this section gates on. When set, the
   *  section heading renders a small status pill ("Locked" / "Stale"
   *  / no badge when ready) sourced from `capabilitiesStatus`. */
  tier?: import("@/types/ipc").CapabilityTier;
}

type Section = Group | SuperGroup;

// ---------- Data ----------

function useNavSections(): Section[] {
  // `useIsAddonEnabled` is read but not branched on yet — addons
  // (Mods, Reskin) now render their own top-level sections via the
  // `enabledAddons` filter further down. Keeping the hook call so
  // re-enabling an addon at runtime triggers a re-render without us
  // having to plumb a new dependency.
  useIsAddonEnabled("mods");

  // Restructured per the capability-tier IA:
  //   App         — entry / setup / docs (no prerequisites)
  //   Connection  — T1+T2 (profile + pull) — the foundation
  //   Mission     — T2 — XML / JSON editing
  //   World       — T2 (and T3 for Zones & Tiers, gated per page)
  //   Mods addon  — T4, registered separately by addon
  //   Reskin addon — T3+T5, registered separately by addon
  // Routes themselves don't change — only the sidebar grouping +
  // visual hierarchy. CapabilityGate (Pass 3) handles the actual
  // gating at the page level.
  return [
    {
      kind: "group",
      heading: "App",
      items: [
        { to: "/app/dashboard", label: "Home", icon: Home },
        { to: "/app/setup", label: "Setup", icon: Wrench },
        { to: "/app/tutorials", label: "Tutorials", icon: BookOpen },
        // Health & Lint promoted to top-level App. It's a global
        // cross-file linter, not a "world" thing — operators want
        // it surfaced at the top of the sidebar so problems get
        // noticed regardless of which editor they're in.
        { to: "/app/health", label: "Health & Lint", icon: Shield },
        { to: "/app/settings", label: "Preferences", icon: Settings },
      ],
    },
    {
      kind: "group",
      heading: "Connection",
      tier: "connection",
      items: [
        // Profile picker is reachable from the top bar; removing
        // the sidebar entry collapses the duplicate path.
        { to: "/app/sync", label: "Pull", icon: ArrowDownToLine },
        { to: "/app/sync", label: "Deploy", icon: Upload },
        {
          to: "/app/backups",
          label: "History & Backups",
          icon: Archive,
        },
      ],
    },
    {
      // World moved ABOVE Mission and now leads with Map editor +
      // Zones & Tiers. Spatial editing is its own thing; mission
      // XML editing is a separate mental mode below.
      kind: "group",
      heading: "World",
      tier: "workspace",
      items: [
        { to: "/app/map", label: "Map editor", icon: MapIcon },
        {
          to: "/app/zones-tiers",
          label: "Zones & Tiers",
          icon: Shield,
        },
      ],
    },
    {
      kind: "super",
      heading: "Mission",
      icon: Gamepad2,
      tier: "workspace",
      categories: [
        {
          heading: "Settings",
          items: [
            {
              to: "/app/server-config",
              label: "Server configuration",
              icon: Wrench,
            },
            { to: "/app/gameplay", label: "Gameplay", icon: Sliders },
            {
              to: "/app/globals",
              label: "Globals & Messages",
              icon: MessagesSquare,
            },
          ],
        },
        {
          heading: "Items & Loot",
          items: [
            { to: "/app/items", label: "Types", icon: Boxes },
            { to: "/app/events", label: "Events", icon: Target },
            {
              to: "/app/loadouts",
              label: "Spawnables",
              icon: PackageSearch,
            },
            { to: "/app/gear-sets", label: "Gear sets", icon: ShirtIcon },
          ],
        },
        {
          heading: "Spawning",
          items: [
            {
              to: "/app/player-spawns",
              label: "Player spawns",
              icon: MapPin,
            },
            { to: "/app/buildings", label: "Buildings", icon: Building2 },
            {
              to: "/app/ignorelist",
              label: "CE ignore list",
              icon: EyeOff,
            },
          ],
        },
      ],
    },
  ];
}

// ---------- Shell ----------

export function Sidebar() {
  const sections = useNavSections();
  const enabledAddons = useEnabledAddons();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Brand block — horizontal Arvi wordmark per brandbook. The
          SVG already bakes in the cream + rust colour pair so it
          reads correctly against the sidebar's black surface.
          Renamed in the v2 branding from `logo-horizontal-dark` to
          `logo-arvi-horizontal-dark` to match the new family naming. */}
      <div className="flex h-16 items-center gap-2 border-b-dashed px-4">
        <img
          src="/logo-arvi-horizontal-dark.svg"
          alt="DayZ ServerUI"
          className="h-auto w-60 select-none"
          draggable={false}
        />
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {sections.map((s, i) =>
          s.kind === "group" ? (
            <MenuGroup key={s.heading + i} group={s} />
          ) : (
            <MenuSuperGroup key={s.heading + i} group={s} />
          ),
        )}

        {/* Every enabled addon with a `SidebarSection` renders as
            its own top-level block. Both Mods and Reskin do today;
            future addons just plug in the same way. */}
        {enabledAddons
          .filter((a) => !!a.SidebarSection)
          .map((addon) =>
            addon.SidebarSection ? (
              <addon.SidebarSection key={addon.id} />
            ) : null,
          )}
      </nav>
    </aside>
  );
}

// ---------- Tier 1: Menu ----------

function MenuGroup({ group }: { group: Group }) {
  return (
    <section className="mb-5">
      <MenuHeading>
        <span>{group.heading}</span>
        {group.tier ? <TierPill tier={group.tier} /> : null}
      </MenuHeading>
      <ItemList items={group.items} defaultDepth="menu" />
    </section>
  );
}

function MenuSuperGroup({ group }: { group: SuperGroup }) {
  const Icon = group.icon;
  return (
    <section className="mb-5">
      <MenuHeading>
        <Icon className="h-3.5 w-3.5 opacity-80" />
        <span>{group.heading}</span>
        {group.tier ? <TierPill tier={group.tier} /> : null}
      </MenuHeading>
      <div className="space-y-2">
        {group.categories.map((c) => (
          <CategoryBlock key={c.heading} category={c} />
        ))}
        {group.extras}
      </div>
    </section>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display mb-1 flex items-center gap-1.5 px-4 text-[12px] font-semibold tracking-[0.16em] text-foreground/90">
      {children}
    </div>
  );
}

/** Section-header capability indicator. Renders nothing when the
 *  tier is `ready` so the sidebar doesn't get visually noisy once
 *  the operator is fully set up — the badge only earns space when
 *  it's communicating a problem the user can act on. */
function TierPill({ tier }: { tier: CapabilityTier }) {
  const caps = useCapabilities();
  const status = pickTier(caps.data, tier);
  if (!status || status.state === "ready") return null;
  const map: Record<
    string,
    { label: string; className: string }
  > = {
    stale: {
      label: "stale",
      className:
        "border-severity-warning/40 text-severity-warning/90 bg-severity-warning/5",
    },
    todo: {
      label: "locked",
      className: "border-primary/40 text-primary bg-primary/5",
    },
    warn: {
      label: "attention",
      className:
        "border-severity-warning/40 text-severity-warning/90 bg-severity-warning/5",
    },
    blocked: {
      label: "blocked",
      className: "border-border/60 text-muted-foreground bg-muted/30",
    },
  };
  const m = map[status.state] ?? map.todo;
  return (
    <span
      title={`${status.title}: ${status.description}`}
      className={cn(
        "ml-auto rounded border px-1.5 py-[1px] font-mono text-[8px] uppercase tracking-[0.18em]",
        m.className,
      )}
    >
      {m.label}
    </span>
  );
}

// ---------- Tier 2: Category ----------

function CategoryBlock({ category }: { category: Category }) {
  return (
    <div>
      <CategoryHeading>{category.heading}</CategoryHeading>
      <ItemList items={category.items} defaultDepth="category" />
    </div>
  );
}

function CategoryHeading({
  children,
  icon: Icon,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-0.5 flex items-center gap-1.5 pl-6 pr-4 font-mono text-[10px] uppercase tracking-[0.2em] text-brand-olive-mid">
      {Icon ? <Icon className="h-2.5 w-2.5 opacity-70" /> : null}
      <span>{children}</span>
    </div>
  );
}

// ---------- Tier 3: Items ----------

function ItemList({
  items,
  defaultDepth,
}: {
  items: NavItem[];
  defaultDepth: ItemDepth;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item, idx) => (
        <Item
          key={`${item.to}::${idx}`}
          item={item}
          depth={item.depth ?? defaultDepth}
        />
      ))}
    </ul>
  );
}

/** Same NavLink every item renders, but the indent + subtlety come
 *  from the `depth` prop, not the data. Lets a single item appear
 *  nested deeper without the data needing to know its position. */
export function SidebarItem({
  to,
  label,
  icon,
  depth = "category",
  disabled,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  depth?: ItemDepth;
  disabled?: boolean;
}) {
  return <Item item={{ to, label, icon, disabled }} depth={depth} />;
}

function Item({ item, depth }: { item: NavItem; depth: ItemDepth }) {
  const Icon = item.icon;
  const pad = depthClass(depth);

  if (item.disabled) {
    return (
      <li>
        <span
          className={cn(
            "flex items-center gap-2 rounded-md py-1.5 pr-3 text-xs text-muted-foreground/60",
            pad,
          )}
          title="Coming in a later phase"
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="flex-1">{item.label}</span>
          <span className="text-[9px] uppercase">soon</span>
        </span>
      </li>
    );
  }

  // Subtle hint on the "Deploy" entry so the Pull/Deploy pair is
  // distinguishable even though they share a route today.
  const suffix =
    item.label === "Deploy" ? (
      <Rocket className="ml-auto h-3 w-3 opacity-70" />
    ) : null;

  return (
    <li>
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-2 rounded-md py-1.5 pr-3 transition-colors",
            pad,
            depth === "sub" ? "text-[11px]" : "text-xs",
            depth === "sub" && !item.disabled ? "text-foreground/80" : "",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/60",
          )
        }
      >
        <Icon
          className={cn(
            "shrink-0",
            depth === "sub" ? "h-3 w-3 opacity-80" : "h-3.5 w-3.5",
          )}
        />
        <span className="flex-1 truncate">{item.label}</span>
        {suffix}
      </NavLink>
    </li>
  );
}

function depthClass(depth: ItemDepth): string {
  switch (depth) {
    case "menu":
      return "pl-6";
    case "category":
      return "pl-8";
    case "sub":
      return "pl-12";
  }
}
