import { Explainer } from "@/components/Explainer";

import { LOADOUTS_HOW_IT_WORKS, LOADOUTS_TAGLINE } from "./glossary";

/**
 * Orientation panel at the top of the Spawnables page — a thin
 * wrapper around the shared <Explainer> shell that reads the
 * page-specific copy from ./glossary.
 */
export function LoadoutsExplainer() {
  return (
    <Explainer
      title={LOADOUTS_HOW_IT_WORKS.title}
      subtitle={LOADOUTS_TAGLINE}
      storageKey="dzcm.loadouts.explainer.open"
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {LOADOUTS_HOW_IT_WORKS.bullets.map((b) => (
          <li
            key={b.heading}
            className="rounded-md border border-border/60 bg-card/40 p-3"
          >
            <p className="mb-1 font-semibold text-foreground">{b.heading}</p>
            <p>{b.body}</p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] italic text-muted-foreground/80">
        Hover the ⓘ icon next to any field for a full definition. Hover
        the
        <span className="mx-1 rounded bg-background px-1 py-0.5 font-mono">
          ≈n%
        </span>
        badges next to each item to see why the probability is what it
        is.
      </p>
    </Explainer>
  );
}
