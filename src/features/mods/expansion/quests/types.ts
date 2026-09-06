/**
 * DayZ-Expansion quest + quest-NPC shapes — see the Expansion wiki
 * Quests section for field semantics and objective-type numbers:
 * https://github.com/salutesh/DayZ-Expansion-Scripts/wiki/
 *
 * Quest files live at `profiles/ExpansionMod/Quests/Quests/Quest_<ID>.json`,
 * NPC files at `profiles/ExpansionMod/Quests/NPCs/QuestNPC_<ID>.json`.
 * Objective definitions live under `Quests/Objectives/<Type>/Objective_*.json`;
 * each entry in a quest's `Objectives` array references one of those
 * files by `{ ObjectiveType, ID }`.
 */

/** Known quest `Type` values from the wiki. Values outside this set
 *  pass through unchanged on save. */
export const QUEST_TYPE_LABELS: Record<number, string> = {
  0: "Travel",
  1: "Action",
  2: "Delivery",
  3: "Treasure Hunt",
  4: "Collection",
  5: "Target",
  6: "AI Camp",
  7: "AI Patrol",
  8: "AI VIP",
  9: "Raid",
};

/** Known objective-type values. Numbers match the `ObjectiveType`
 *  field inside each `Objective_*.json` file — verified against
 *  every example under `examples/ExpansionMod/Quests/Objectives/`.
 *  Unknown integers pass through unchanged on save. */
export const OBJECTIVE_TYPE_LABELS: Record<number, string> = {
  2: "Target",
  3: "Travel",
  4: "Collection",
  5: "Delivery",
  6: "Treasure Hunt",
  7: "AI Patrol",
  8: "AI Camp",
  9: "AI VIP",
  10: "Action",
  11: "Crafting",
};

/** Subfolder under `Quests/Objectives/` per type. Used by the
 *  objectives editor to place new files in the right place. */
export const OBJECTIVE_TYPE_FOLDER: Record<number, string> = {
  2: "Target",
  3: "Travel",
  4: "Collection",
  5: "Delivery",
  6: "TreasureHunt",
  7: "AIPatrol",
  8: "AICamp",
  9: "AIVIP",
  10: "Action",
  11: "Crafting",
};

export interface QuestRewardAttachment {
  ClassName: string;
  Amount?: number;
  Attachments?: QuestRewardAttachment[];
  DamagePercent?: number;
  HealthPercent?: number;
  QuestID?: number;
  Chance?: number;
  [extra: string]: unknown;
}

export interface QuestReward {
  ClassName: string;
  Amount: number;
  Attachments: QuestRewardAttachment[];
  DamagePercent: number;
  HealthPercent: number;
  QuestID: number;
  Chance: number;
  [extra: string]: unknown;
}

export interface QuestItem {
  ClassName: string;
  Amount: number;
  [extra: string]: unknown;
}

export interface QuestObjectiveRef {
  ConfigVersion: number;
  ID: number;
  ObjectiveType: number;
  [extra: string]: unknown;
}

export interface Quest {
  ConfigVersion: number;
  ID: number;
  Type: number;
  Title: string;
  Descriptions: string[];
  ObjectiveText: string;
  FollowUpQuest: number;
  Repeatable: 0 | 1;
  IsDailyQuest: 0 | 1;
  IsWeeklyQuest: 0 | 1;
  CancelQuestOnPlayerDeath: 0 | 1;
  Autocomplete: 0 | 1;
  IsGroupQuest: 0 | 1;
  ObjectSetFileName: string;
  QuestItems: QuestItem[];
  Rewards: QuestReward[];
  NeedToSelectReward: 0 | 1;
  RandomReward: 0 | 1;
  RandomRewardAmount: number;
  RewardsForGroupOwnerOnly: 0 | 1;
  RewardBehavior: number;
  QuestGiverIDs: number[];
  QuestTurnInIDs: number[];
  IsAchievement: 0 | 1;
  Objectives: QuestObjectiveRef[];
  QuestColor: number;
  ReputationReward: number;
  ReputationRequirement: number;
  PreQuestIDs: number[];
  RequiredFaction: string;
  FactionReward: string;
  PlayerNeedQuestItems: 0 | 1;
  DeleteQuestItems: 0 | 1;
  SequentialObjectives: 0 | 1;
  FactionReputationRequirements: Record<string, number>;
  FactionReputationRewards: Record<string, number>;
  SuppressQuestLogOnCompetion: 0 | 1;
  Active: 0 | 1;
  [extra: string]: unknown;
}

export interface QuestNPC {
  ConfigVersion: number;
  ID: number;
  ClassName: string;
  Position: [number, number, number];
  Orientation: [number, number, number];
  NPCName: string;
  DefaultNPCText: string;
  Waypoints: [number, number, number][];
  NPCEmoteID: number;
  NPCEmoteIsStatic: 0 | 1;
  NPCLoadoutFile: string;
  NPCInteractionEmoteID: number;
  NPCQuestCancelEmoteID: number;
  NPCQuestStartEmoteID: number;
  NPCQuestCompleteEmoteID: number;
  NPCFaction: string;
  NPCType: number;
  Active: 0 | 1;
  [extra: string]: unknown;
}

export const DEFAULT_QUEST: Quest = {
  ConfigVersion: 22,
  ID: 0,
  Type: 1,
  Title: "",
  Descriptions: ["", "", ""],
  ObjectiveText: "",
  FollowUpQuest: -1,
  Repeatable: 0,
  IsDailyQuest: 0,
  IsWeeklyQuest: 0,
  CancelQuestOnPlayerDeath: 0,
  Autocomplete: 0,
  IsGroupQuest: 0,
  ObjectSetFileName: "",
  QuestItems: [],
  Rewards: [],
  NeedToSelectReward: 0,
  RandomReward: 0,
  RandomRewardAmount: -1,
  RewardsForGroupOwnerOnly: 1,
  RewardBehavior: 0,
  QuestGiverIDs: [],
  QuestTurnInIDs: [],
  IsAchievement: 0,
  Objectives: [],
  QuestColor: 0,
  ReputationReward: 0,
  ReputationRequirement: -1,
  PreQuestIDs: [],
  RequiredFaction: "",
  FactionReward: "",
  PlayerNeedQuestItems: 1,
  DeleteQuestItems: 1,
  SequentialObjectives: 1,
  FactionReputationRequirements: {},
  FactionReputationRewards: {},
  SuppressQuestLogOnCompetion: 0,
  Active: 1,
};

export const DEFAULT_QUEST_NPC: QuestNPC = {
  ConfigVersion: 6,
  ID: 0,
  ClassName: "ExpansionQuestNPCAI",
  Position: [0, 0, 0],
  Orientation: [0, 0, 0],
  NPCName: "",
  DefaultNPCText: "",
  Waypoints: [[0, 0, 0]],
  NPCEmoteID: 0,
  NPCEmoteIsStatic: 0,
  NPCLoadoutFile: "",
  NPCInteractionEmoteID: 1,
  NPCQuestCancelEmoteID: 60,
  NPCQuestStartEmoteID: 58,
  NPCQuestCompleteEmoteID: 39,
  NPCFaction: "",
  NPCType: 2,
  Active: 1,
};

export const DEFAULT_QUEST_REWARD: QuestReward = {
  ClassName: "",
  Amount: 1,
  Attachments: [],
  DamagePercent: 0,
  HealthPercent: 0,
  QuestID: -1,
  Chance: 1.0,
};
