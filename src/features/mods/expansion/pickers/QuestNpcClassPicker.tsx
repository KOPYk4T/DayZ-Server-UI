import { ClassnamePicker } from "./ClassnamePicker";
import {
  EXPANSION_QUEST_NPCS_AI,
  EXPANSION_QUEST_NPCS_STATIC,
} from "./expansion-classes";

interface Props {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const GROUPS = [
  { heading: "Static (non-walking) NPC", options: EXPANSION_QUEST_NPCS_STATIC },
  { heading: "AI (walking) NPC", options: EXPANSION_QUEST_NPCS_AI },
];

/** Picker for an Expansion quest-giver NPC classname. Grouped
 *  static / AI variants — same 31-name roster as traders, but
 *  separate inheritance chain (`ExpansionQuestNPCBase` /
 *  `ExpansionQuestNPCAIBase`). */
export function QuestNpcClassPicker(props: Props) {
  return (
    <ClassnamePicker
      {...props}
      placeholder={props.placeholder ?? "quest NPC classname"}
      options={GROUPS}
    />
  );
}
