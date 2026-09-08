import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { JsonObjectGrid } from "./JsonObjectGrid";
import { entryLabel } from "./helpers";

interface Props {
  path: string;
  items: Record<string, unknown>[];
  depth: number;
  onChange: (next: unknown[]) => void;
  source: unknown[];
}

/** Named objects in a small array (RaidDays, etc.) become tabs. */
export function JsonEntryTabs({
  path,
  items,
  depth,
  onChange,
  source,
}: Props) {
  return (
    <Tabs defaultValue="0" className="gap-3">
      <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
        {items.map((item, i) => (
          <TabsTrigger
            key={`${path}-tab-${i}`}
            value={String(i)}
            className="select-none"
          >
            {entryLabel(item, i)}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((item, i) => (
        <TabsContent
          key={`${path}-pane-${i}`}
          value={String(i)}
          className="animate-in fade-in-0 duration-200 motion-reduce:animate-none"
        >
          <JsonObjectGrid
            data={item}
            path={`${path}[${i}]`}
            depth={depth}
            onChange={(next) =>
              onChange(source.map((entry, j) => (j === i ? next : entry)))
            }
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
