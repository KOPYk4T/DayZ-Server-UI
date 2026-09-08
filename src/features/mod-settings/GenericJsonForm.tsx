import { Card, CardContent } from "@/components/ui/card";

import { JsonObjectGrid } from "./json-form/JsonObjectGrid";

/**
 * Infer a settings inspector from a JSON object. Public entry for
 * the Mod settings editor; implementation lives in `./json-form`.
 */
export function GenericJsonForm({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-5 py-4">
        <JsonObjectGrid data={data} path="" depth={0} onChange={onChange} />
      </CardContent>
    </Card>
  );
}
