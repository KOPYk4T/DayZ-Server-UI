import type { SettingsSchema } from "./types";

export const questSchema: SettingsSchema = {
  name: "Quest",
  title: "Quest settings",
  description:
    "Quest system toggles, in-game text strings, and weekly/daily reset times. Individual quests, NPCs, and objectives live in the Quests/ sub-folder — those get a dedicated editor in a follow-up release.",
  expectedVersion: 10,
  fields: [
    // ---- General ----
    {
      key: "EnableQuests",
      label: "Enable quests",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "EnableQuestLogTab",
      label: "Enable quest log tab",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "CreateQuestNPCMarkers",
      label: "Create quest NPC markers",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "UseQuestNPCIndicators",
      label: "Use quest NPC indicators",
      group: "General",
      type: { kind: "bool01" },
    },
    {
      key: "GroupQuestMode",
      label: "Group quest mode",
      group: "General",
      description:
        "0 = any member, 1 = owner only, 2 = custom. See Expansion wiki for the exact semantics.",
      type: { kind: "int", min: 0 },
    },
    {
      key: "MaxActiveQuests",
      label: "Max active quests per player",
      group: "General",
      description: "-1 = unlimited.",
      type: { kind: "int", min: -1 },
    },

    // ---- Scheduling ----
    {
      key: "UseUTCTime",
      label: "Use UTC for resets",
      group: "Scheduling",
      type: { kind: "bool01" },
    },
    {
      key: "DailyResetHour",
      label: "Daily reset hour",
      group: "Scheduling",
      type: { kind: "int", min: 0, max: 23, unit: "h" },
    },
    {
      key: "DailyResetMinute",
      label: "Daily reset minute",
      group: "Scheduling",
      type: { kind: "int", min: 0, max: 59, unit: "m" },
    },
    {
      key: "WeeklyResetDay",
      label: "Weekly reset day",
      group: "Scheduling",
      description:
        "Day name — Monday / Tuesday / Wednesday / Thursday / Friday / Saturday / Sunday.",
      type: { kind: "string" },
    },
    {
      key: "WeeklyResetHour",
      label: "Weekly reset hour",
      group: "Scheduling",
      type: { kind: "int", min: 0, max: 23, unit: "h" },
    },
    {
      key: "WeeklyResetMinute",
      label: "Weekly reset minute",
      group: "Scheduling",
      type: { kind: "int", min: 0, max: 59, unit: "m" },
    },

    // ---- Message strings ----
    {
      key: "QuestAcceptedTitle",
      label: "Quest accepted title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestAcceptedText",
      label: "Quest accepted text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestCompletedTitle",
      label: "Quest completed title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestCompletedText",
      label: "Quest completed text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestFailedTitle",
      label: "Quest failed title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestFailedText",
      label: "Quest failed text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestCanceledTitle",
      label: "Quest canceled title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestCanceledText",
      label: "Quest canceled text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestTurnInTitle",
      label: "Quest turn-in title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestTurnInText",
      label: "Quest turn-in text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestObjectiveCompletedTitle",
      label: "Objective completed title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestObjectiveCompletedText",
      label: "Objective completed text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestCooldownTitle",
      label: "Cooldown title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestCooldownText",
      label: "Cooldown text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestNotInGroupTitle",
      label: "Not in group title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestNotInGroupText",
      label: "Not in group text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestNotGroupOwnerTitle",
      label: "Not group owner title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "QuestNotGroupOwnerText",
      label: "Not group owner text",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "AchievementCompletedTitle",
      label: "Achievement completed title",
      group: "Messages",
      type: { kind: "string" },
    },
    {
      key: "AchievementCompletedText",
      label: "Achievement completed text",
      group: "Messages",
      type: { kind: "string" },
    },
  ],
};
