import { create } from "zustand";

import * as tauri from "@/lib/tauri";
import type { ServerProfile } from "@/types/ipc";

interface ProfileState {
  active: ServerProfile | null;
  setActive: (profile: ServerProfile | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  active: null,
  setActive: (profile) => {
    set({ active: profile });
    // Mirror the change into shared backend state so capability
    // checks + any future headless caller resolve the same
    // profile. Fire-and-forget — failures don't block the UI
    // switch (the user already sees the new active profile).
    tauri.profilesSetActive(profile?.id ?? null).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("profiles_set_active failed", err);
    });
  },
}));
