import type { SettingsSchema } from "./types";

export const socialMediaSchema: SettingsSchema = {
  name: "SocialMedia",
  title: "Social media settings",
  description:
    "News-feed items and external link tiles shown in the in-game menu. Both the NewsFeedTexts and NewsFeedLinks arrays contain nested objects (title/text/URL/icon) — edit those on the Raw JSON tab.",
  expectedVersion: 2,
  fields: [],
};
