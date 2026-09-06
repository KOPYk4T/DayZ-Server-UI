import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface Props {
  title: string;
  phase: number;
  description?: string;
}

export function Placeholder({ title, phase, description }: Props) {
  return (
    <div className="p-6">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Construction className="h-10 w-10 text-muted-foreground/60" />
          <h2 className="text-lg font-medium">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {description ?? `Scheduled for PDR phase ${phase}.`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
