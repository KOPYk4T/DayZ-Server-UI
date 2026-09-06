import { CheckCircle2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

interface Props {
  ok: boolean;
  label: string;
  missingLabel: string;
}

/** Small pill with a check/cross and a label. `ok` picks between
 *  severity-success and severity-warning styling — used anywhere we
 *  surface a pass/fail state (scan results, connection probes, …). */
export function StatusBadge({ ok, label, missingLabel }: Props) {
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? "border-severity-success/40 text-severity-success"
          : "border-severity-warning/40 text-severity-warning"
      }
    >
      {ok ? (
        <CheckCircle2 className="mr-1 h-3 w-3" />
      ) : (
        <XCircle className="mr-1 h-3 w-3" />
      )}
      {ok ? label : missingLabel}
    </Badge>
  );
}
