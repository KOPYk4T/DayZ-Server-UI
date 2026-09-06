import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Archive,
  Boxes,
  Building2,
  EyeOff,
  FileCog,
  GitBranch,
  LayoutDashboard,
  Map as MapIcon,
  MapPin,
  MessagesSquare,
  PackageSearch,
  Puzzle,
  Search,
  Settings,
  Shield,
  Shirt,
  Sliders,
  Target,
  Terminal,
  Wrench,
} from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useEventsSnapshot } from "@/hooks/useEvents";
import { useItemsSnapshot } from "@/hooks/useItems";
import { cn } from "@/lib/utils";
import { useIsAddonEnabled } from "@/stores/addonsStore";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: "Navigate" | "Types" | "Events";
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
  run: () => void;
}

interface RouteEntry {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  /** When set, this route only surfaces in the palette while the
   *  named addon is enabled. Prevents navigating to paths the router
   *  doesn't mount. */
  requiresAddon?: string;
}

const ROUTES: RouteEntry[] = [
  { to: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/sync", label: "Sync", icon: GitBranch, keywords: "pull push backup" },
  // Search keywords keep "items" so legacy muscle memory (Ctrl+K, "items")
  // still resolves; the displayed label is the new name.
  { to: "/app/items", label: "Types", icon: Boxes, keywords: "items types cfgspawnabletypes economy loot classnames" },
  { to: "/app/events", label: "Events", icon: Target, keywords: "cfgeventspawns eventspawns" },
  { to: "/app/loadouts", label: "Loadouts", icon: PackageSearch, keywords: "cfgrandompresets" },
  { to: "/app/gear-sets", label: "Gear Sets", icon: Shirt, keywords: "player spawn loadout" },
  { to: "/app/player-spawns", label: "Player Spawns", icon: MapPin },
  { to: "/app/zones-tiers", label: "Zones & Tiers", icon: Shield },
  { to: "/app/buildings", label: "Buildings", icon: Building2, keywords: "mapgrouppos" },
  { to: "/app/map", label: "Map", icon: MapIcon },
  { to: "/app/globals", label: "Globals & Messages", icon: MessagesSquare, keywords: "cfgplayerrestrictions" },
  { to: "/app/gameplay", label: "Gameplay", icon: Sliders, keywords: "cfggameplay stamina" },
  { to: "/app/ignorelist", label: "CE ignore list", icon: EyeOff, keywords: "cfgignorelist" },
  { to: "/app/server-config", label: "Server Config", icon: Wrench, keywords: "serverdz.cfg" },
  { to: "/app/mods", label: "Mods", icon: Puzzle, keywords: "workshop expansion", requiresAddon: "mods" },
  { to: "/app/health", label: "Health", icon: Activity },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Global Ctrl/Cmd+K hotkey.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if (isK && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Fetch index sources lazily — the queries are cheap (already cached
  // by React Query when the pages have been visited), but we guard on
  // `enabled` via the hook semantics. Both hooks run unconditionally
  // here; they no-op if no profile is active.
  const items = useItemsSnapshot();
  const events = useEventsSnapshot();
  const modsEnabled = useIsAddonEnabled("mods");

  const allItems: PaletteItem[] = useMemo(() => {
    const out: PaletteItem[] = [];
    for (const r of ROUTES) {
      if (r.requiresAddon === "mods" && !modsEnabled) continue;
      out.push({
        id: `nav:${r.to}`,
        label: r.label,
        group: "Navigate",
        icon: r.icon,
        keywords: `${r.label} ${r.keywords ?? ""}`,
        run: () => navigate(r.to),
      });
    }
    for (const it of items.data?.items ?? []) {
      out.push({
        id: `item:${it.name}`,
        label: it.name,
        hint: it.category ?? undefined,
        group: "Types",
        icon: Boxes,
        keywords: `${it.name} ${it.category ?? ""} ${(it.usage ?? []).join(" ")}`,
        run: () => navigate(`/app/items?name=${encodeURIComponent(it.name)}`),
      });
    }
    for (const ev of events.data?.events ?? []) {
      out.push({
        id: `event:${ev.name}`,
        label: ev.name,
        hint: "event",
        group: "Events",
        icon: Target,
        keywords: `${ev.name}`,
        run: () => navigate(`/app/events?name=${encodeURIComponent(ev.name)}`),
      });
    }
    return out;
  }, [items.data, events.data, navigate, modsEnabled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems.slice(0, 60);
    const scored: { item: PaletteItem; score: number }[] = [];
    for (const it of allItems) {
      const hay = it.keywords.toLowerCase();
      const idx = hay.indexOf(q);
      if (idx < 0) continue;
      // Earlier match + shorter label ranks higher.
      scored.push({ item: it, score: idx * 10 + it.label.length });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 60).map((s) => s.item);
  }, [allItems, query]);

  // Reset selection when the filter changes so the highlighted row is
  // always a valid index.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Scroll the active row into view when navigating via keyboard.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(
      `[data-palette-idx="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    // Let the dialog mount + focus trap settle before we grab focus.
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  const run = (item: PaletteItem) => {
    setOpen(false);
    item.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = filtered[activeIndex];
      if (picked) run(picked);
    }
  };

  // Group rendering: walk filtered list in order, emit a group header
  // when the group changes. Keeps filtering-aware ordering intact.
  const rendered: React.ReactNode[] = [];
  let lastGroup: string | null = null;
  filtered.forEach((it, idx) => {
    if (it.group !== lastGroup) {
      rendered.push(
        <div
          key={`hdr:${it.group}`}
          className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {it.group}
        </div>,
      );
      lastGroup = it.group;
    }
    const Icon = it.icon;
    rendered.push(
      <button
        key={it.id}
        data-palette-idx={idx}
        onClick={() => run(it)}
        onMouseEnter={() => setActiveIndex(idx)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
          idx === activeIndex
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted/50",
        )}
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{it.label}</span>
        {it.hint ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            {it.hint}
          </span>
        ) : null}
      </button>,
    );
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="w-full !max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border/60 px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Go to page, item, event…"
            className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No results.
            </div>
          ) : (
            rendered
          )}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-3">
            <Archive className="h-3 w-3" />
            <span>Ctrl+K to toggle · ↑↓ select · Enter run</span>
          </span>
          <span className="flex items-center gap-1">
            <FileCog className="h-3 w-3" />
            <Terminal className="h-3 w-3" />
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
