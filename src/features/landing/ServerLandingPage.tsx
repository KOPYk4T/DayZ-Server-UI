import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  MessagesSquare,
  Terminal,
  Wrench,
} from "lucide-react";

import { LandingPage } from "@/features/landing/LandingPage";
import * as tauri from "@/lib/tauri";
import { useProfileStore } from "@/stores/profileStore";

export function ServerLandingPage() {
  const profile = useProfileStore((s) => s.active);
  const id = profile?.id ?? null;

  const serverCfg = useQuery({
    queryKey: id ? ["server-cfg", id] : ["server-cfg", "__none__"],
    queryFn: () => tauri.serverCfgGet(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const cfgStatus = serverCfg.data
    ? serverCfg.data.missingFile
      ? "missing"
      : "present"
    : "unknown";

  return (
    <LandingPage
      title="Server"
      intro="Root-level tuning — things that sit outside the mission tree and govern how the server itself behaves. Pushed alongside the mission on your next deploy."
      stats={[
        {
          label: "serverDZ.cfg",
          value: cfgStatus,
          icon: Wrench,
          hint: serverCfg.data?.fileDisplay ?? "",
        },
        {
          label: "Profile",
          value: profile?.name ?? "—",
          hint: profile?.mode?.toUpperCase() ?? "",
        },
        {
          label: "Map",
          value: profile?.map ?? "—",
          hint: profile?.customMapId ?? "",
        },
        {
          label: "Mode",
          value: profile?.mode?.toUpperCase() ?? "—",
          hint:
            profile?.mode === "sftp"
              ? `${profile.sftp?.username}@${profile.sftp?.host}`
              : (profile?.local?.rootPath ?? ""),
        },
      ]}
      sections={[
        {
          to: "/app/server-config",
          label: "Server Config",
          description:
            "serverDZ.cfg — hostname, slot count, persistence, respawn options, Steam query port.",
          icon: Wrench,
        },
        {
          to: "/app/globals",
          label: "Globals & Messages",
          description:
            "globals.xml + cfgplayerrestrictions.xml + kickwhitelists — MOTD, restricted names, admin/priority lists.",
          icon: MessagesSquare,
        },
        {
          to: "/app/server-actions",
          label: "Server Actions",
          description:
            "Remote restart, save, and RCon actions. Ships in a later phase.",
          icon: Terminal,
          disabled: true,
          badge: "soon",
        },
      ]}
      footer={
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <FileText className="mr-1.5 inline h-3 w-3" />
          <strong>Mission-level</strong> tuning (stamina, events, loot)
          lives under <strong>Mission</strong>. This area is for the
          server process itself.
        </div>
      }
    />
  );
}
