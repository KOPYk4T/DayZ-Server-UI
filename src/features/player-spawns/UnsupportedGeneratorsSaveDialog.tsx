import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlayerSpawnPoints } from "@/types/ipc";

/** True when Save would strip `generator_deviate` / `generator_random`
 *  blocks the posbubbles editor cannot round-trip. Shared by the
 *  Player Spawns page and the Map editor so both surfaces warn. */
export function needsUnsupportedGeneratorConfirm(
  draft: PlayerSpawnPoints | null | undefined,
): boolean {
  return !!draft?.hasUnsupportedGenerators;
}

export function UnsupportedGeneratorsSaveDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save will drop unsupported blocks</DialogTitle>
          <DialogDescription className="text-xs">
            This file contains <code>generator_deviate</code> or{" "}
            <code>generator_random</code> sections that this editor
            doesn't round-trip. Saving will write out only the
            posbubbles lists and strip the other generators.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            Save anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
