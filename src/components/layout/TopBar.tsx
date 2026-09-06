import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, PencilLine, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ProfileFormDialog } from "@/features/profiles/ProfileFormDialog";
import { useProfileStore } from "@/stores/profileStore";
import { useUIStore } from "@/stores/uiStore";

export function TopBar() {
  const navigate = useNavigate();
  const activeProfile = useProfileStore((s) => s.active);
  const setActive = useProfileStore((s) => s.setActive);
  const setActiveId = useUIStore((s) => s.setActiveProfileId);
  const [editOpen, setEditOpen] = useState(false);

  const handleSwitch = () => {
    setActive(null);
    setActiveId(null);
    navigate("/profiles");
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2 text-sm">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <span className="text-muted-foreground">Profile</span>
              <span className="font-medium">
                {activeProfile?.name ?? "no profile selected"}
              </span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Server profile</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setEditOpen(true)}
              disabled={!activeProfile}
            >
              <PencilLine className="mr-2 h-4 w-4" /> Edit profile…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSwitch}>
              <RefreshCw className="mr-2 h-4 w-4" /> Switch profile
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
      <ProfileFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        profile={activeProfile}
      />
    </header>
  );
}
