import { useMemo } from "react";

import { useEventsSnapshot } from "@/hooks/useEvents";
import { useLoadoutsSnapshot } from "@/hooks/useLoadouts";

import { buildLinkIndexes, type LinkIndexes } from "./linkedIn";

/**
 * Memoised cross-reference indexes built from the events and loadouts
 * snapshots. Both underlying hooks are TanStack-cached so subsequent
 * Items-page visits don't re-fetch.
 *
 * Listen to `.isLoading` / `.isFetching` on the underlying hooks via
 * the returned `status` object when the caller wants to distinguish
 * "not loaded yet" (show placeholder) from "loaded, no references"
 * (show a definitive empty state).
 */
export function useItemLinkIndexes(): {
  indexes: LinkIndexes;
  loading: boolean;
  error: unknown;
} {
  const events = useEventsSnapshot();
  const loadouts = useLoadoutsSnapshot();

  const indexes = useMemo(
    () => buildLinkIndexes(events.data, loadouts.data),
    [events.data, loadouts.data],
  );

  return {
    indexes,
    loading:
      (events.isLoading || events.isFetching) &&
      !events.data &&
      (loadouts.isLoading || loadouts.isFetching) &&
      !loadouts.data,
    error: events.error ?? loadouts.error ?? null,
  };
}
