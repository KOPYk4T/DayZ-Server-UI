/**
 * Typed-editor schema for a DayZ-Expansion `*Settings.json` file.
 *
 * Schemas describe the fields we know how to render as a typed form.
 * Any field in the actual JSON that isn't in the schema passes
 * through on save untouched, so the round-trip preserves fields from
 * newer Expansion versions that the schema doesn't know about yet.
 *
 * Dispatch: `schemaFor(name)` in `./index.ts` returns the schema for
 * a given settings-file name, or `null`. When `null`, the editor
 * falls back to the raw-JSON textarea.
 */

export type FieldKind =
  | { kind: "bool01" }
  | { kind: "int"; min?: number; max?: number; step?: number; unit?: string }
  | { kind: "float"; min?: number; max?: number; step?: number; unit?: string }
  | { kind: "string" }
  | { kind: "stringArray"; placeholder?: string };

export interface FieldSpec {
  /** Top-level JSON key on the settings object. */
  key: string;
  label: string;
  description?: string;
  /** UI grouping for the form. Same-group fields render together. */
  group?: string;
  type: FieldKind;
}

export interface SettingsSchema {
  /** Matches `ExpansionSettingsFile.name` — e.g. `"Core"`. */
  name: string;
  title: string;
  description?: string;
  /** The `m_Version` this schema was authored against. UI warns on
   *  mismatch so the user knows some fields may be new / removed in
   *  their Expansion build. */
  expectedVersion?: number;
  fields: FieldSpec[];
}
