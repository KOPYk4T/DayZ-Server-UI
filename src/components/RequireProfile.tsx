import { useEffect } from "react";
import { Navigate } from "react-router-dom";

import { useProfile } from "@/hooks/useProfiles";
import { useProfileStore } from "@/stores/profileStore";
import { useUIStore } from "@/stores/uiStore";

interface Props {
  children: React.ReactNode;
}

export function RequireProfile({ children }: Props) {
  const active = useProfileStore((s) => s.active);
  const setActive = useProfileStore((s) => s.setActive);
  const persistedId = useUIStore((s) => s.activeProfileId);
  const hydrate = useProfile(!active && persistedId ? persistedId : null);

  useEffect(() => {
    if (!active && hydrate.data) setActive(hydrate.data);
  }, [active, hydrate.data, setActive]);

  if (!active) {
    if (persistedId && hydrate.isLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Loading profile…
        </div>
      );
    }
    return <Navigate to="/profiles" replace />;
  }
  return <>{children}</>;
}
