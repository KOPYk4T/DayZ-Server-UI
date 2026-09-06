import { ClassnamePicker } from "./ClassnamePicker";
import {
  EXPANSION_TRADER_NPCS_AI,
  EXPANSION_TRADER_NPCS_STATIC,
  EXPANSION_TRADER_OBJECTS,
} from "./expansion-classes";

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const GROUPS = [
  { heading: "Static (non-walking) NPC", options: EXPANSION_TRADER_NPCS_STATIC },
  { heading: "AI (walking) NPC", options: EXPANSION_TRADER_NPCS_AI },
  { heading: "Static objects", options: EXPANSION_TRADER_OBJECTS },
];

/** Picker for an Expansion trader entity classname. Grouped into
 *  static NPCs / AI NPCs / static objects so an operator can spot
 *  the variant they want without scanning the full 70+ flat list. */
export function TraderClassPicker(props: Props) {
  return (
    <ClassnamePicker
      {...props}
      placeholder={props.placeholder ?? "trader classname"}
      options={GROUPS}
    />
  );
}
