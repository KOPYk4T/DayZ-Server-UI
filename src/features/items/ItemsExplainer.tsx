import { Explainer } from "@/components/Explainer";
import { WikiItemImage } from "@/features/wiki-images/WikiItemImage";
import { cn } from "@/lib/utils";

/**
 * Two self-contained examples: sardines = OR (several usages),
 * KA-M = AND (usage + tier). Places sit under each item so the
 * can has a job, not just the rifle.
 */
export function ItemsExplainer() {
  return (
    <Explainer
      title="How usage and tier combine"
      subtitle="Two examples. Same list = OR. Usage + tier = AND."
      storageKey="dzcm.items.explainer.open"
    >
      <p className="max-w-3xl text-sm leading-relaxed text-foreground">
        A loot point has two stamps: the <strong>building</strong>{" "}
        (usage) and <strong>how far inland</strong> (tier). Several
        flags of the same kind are OR. Usage and tier together are
        AND.
      </p>

      <div className="space-y-3">
        <Example
          n={1}
          purpose="Several usages — OR"
          classname="SardinesCan"
          name="Canned Sardines"
          lists={
            <>
              <Chip>Town</Chip>
              <Join>or</Join>
              <Chip>Village</Chip>
              <Join>or</Join>
              <Chip>Coast</Chip>
            </>
          }
          why="The can only lists usages, no tier. Any Town, Village or Coast building works — inland does not matter."
          places={[
            { place: "Village house", detail: "Village", ok: true, why: "usage matches" },
            { place: "Town house", detail: "Town", ok: true, why: "usage matches" },
            { place: "Military barracks", detail: "Military", why: "not on the list" },
          ]}
        />
        <Example
          n={2}
          purpose="Usage + tier — AND"
          classname="AKM"
          name="KA-M"
          lists={
            <>
              <Chip>Military</Chip>
              <Join and>and</Join>
              <Chip tone="tier">Tier3</Chip>
              <Join>or</Join>
              <Chip tone="tier">Tier4</Chip>
            </>
          }
          why="The rifle lists both stamps. The building must be Military, and the map cell must be Tier3 or Tier4."
          places={[
            { place: "NWAF barracks", detail: "Military · Tier4", ok: true, why: "both match" },
            { place: "Coastal barracks", detail: "Military · Tier1", why: "right building, wrong tier" },
            { place: "Inland village house", detail: "Village · Tier4", why: "right tier, wrong building" },
          ]}
        />
      </div>

      <p className="max-w-3xl">
        The filters on the left follow the same rules. Town + Village
        under Usage = items that list either. Military + Tier4 = items
        that list both.
      </p>
      <p className="text-[11px] italic text-muted-foreground/80">
        Inventory art from{" "}
        <a
          href="https://dayz.wiki.gg/"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          DayZ Wiki
        </a>
        .
      </p>
    </Explainer>
  );
}

function Example({
  n,
  purpose,
  classname,
  name,
  lists,
  why,
  places,
}: {
  n: number;
  purpose: string;
  classname: string;
  name: string;
  lists: React.ReactNode;
  why: string;
  places: { place: string; detail: string; why: string; ok?: boolean }[];
}) {
  return (
    <article className="rounded-md border border-border/60 bg-card/40">
      <header className="border-b border-border/40 px-4 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-rust">
          Example {n} of 2 · {purpose}
        </p>
      </header>
      <div className="grid gap-4 p-4 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
        <div className="flex items-center justify-center rounded-md bg-black/40 p-2">
          <WikiItemImage classname={classname} size="lg" preview={false} />
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-lg font-semibold leading-tight tracking-tight text-foreground">
              {name}
            </p>
            <p className="font-mono text-[11px] text-muted-foreground">
              classname {classname}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">{lists}</div>
          <p>{why}</p>
          <ul className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/50">
            {places.map((p) => (
              <li
                key={p.place}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5"
              >
                <span className="min-w-36 font-medium text-foreground">
                  {p.place}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.detail}
                </span>
                <span className="ml-auto flex items-baseline gap-2">
                  <span
                    className={cn(
                      "rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide",
                      p.ok
                        ? "bg-severity-success/20 text-severity-success"
                        : "bg-severity-error/15 text-severity-error",
                    )}
                  >
                    {p.ok ? "spawns" : "no"}
                  </span>
                  <span className="text-muted-foreground">{p.why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function Chip({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "tier";
}) {
  return (
    <span
      className={cn(
        "rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-foreground",
        tone === "tier"
          ? "border-brand-rust/40 bg-brand-rust/10"
          : "border-border bg-background/70",
      )}
    >
      {children}
    </span>
  );
}

function Join({
  children,
  and: isAnd,
}: {
  children: React.ReactNode;
  and?: boolean;
}) {
  return (
    <span
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wide",
        isAnd ? "text-brand-rust" : "text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
