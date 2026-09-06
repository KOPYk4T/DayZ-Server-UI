import type { SettingsSchema } from "./types";
import { aiSchema } from "./ai";
import { airdropSchema } from "./airdrop";
import { bookSchema } from "./book";
import { chatSchema } from "./chat";
import { coreSchema } from "./core";
import { damageSystemSchema } from "./damageSystem";
import { garageSchema } from "./garage";
import { generalSchema } from "./general";
import { logsSchema } from "./logs";
import { missionSchema } from "./mission";
import { monitoringSchema } from "./monitoring";
import { nameTagsSchema } from "./nameTags";
import { notificationSchema } from "./notification";
import { notificationSchedulerSchema } from "./notificationScheduler";
import { partySchema } from "./party";
import { personalStorageSchema } from "./personalStorage";
import { playerListSchema } from "./playerList";
import { questSchema } from "./quest";
import { raidSchema } from "./raid";
import { socialMediaSchema } from "./socialMedia";
import { territorySchema } from "./territory";
import { vehicleSchema } from "./vehicle";

export type { FieldKind, FieldSpec, SettingsSchema } from "./types";

/** Registry of all typed schemas, keyed by the short name used in
 *  `ExpansionSettingsFile.name` (i.e. the file stem with the
 *  `Settings` suffix stripped). Every Expansion sub-module ships a
 *  schema; files without a schema get the raw-JSON editor.
 *
 *  Schemas cover the **flat and array-of-string** fields each
 *  sub-module owns. Nested objects / arrays-of-objects (Market
 *  categories, Quest definitions, kill-feed schedule entries, etc.)
 *  pass through on save untouched and are edited via the Raw JSON
 *  tab. */
const SCHEMAS: Record<string, SettingsSchema> = {
  AI: aiSchema,
  Airdrop: airdropSchema,
  Book: bookSchema,
  Chat: chatSchema,
  Core: coreSchema,
  DamageSystem: damageSystemSchema,
  Garage: garageSchema,
  General: generalSchema,
  Logs: logsSchema,
  Mission: missionSchema,
  Monitoring: monitoringSchema,
  NameTags: nameTagsSchema,
  Notification: notificationSchema,
  NotificationScheduler: notificationSchedulerSchema,
  Party: partySchema,
  PersonalStorageNew: personalStorageSchema,
  PlayerList: playerListSchema,
  Quest: questSchema,
  Raid: raidSchema,
  SocialMedia: socialMediaSchema,
  Territory: territorySchema,
  Vehicle: vehicleSchema,
};

export function schemaFor(name: string): SettingsSchema | null {
  return SCHEMAS[name] ?? null;
}

/** Names that currently ship a typed editor, in sorted order. */
export const TYPED_SCHEMA_NAMES: string[] = Object.keys(SCHEMAS).sort();
