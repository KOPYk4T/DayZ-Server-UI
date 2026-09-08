export const ARRAY_EXPAND_CAP = 24;

export function prettyKey(key: string): string {
  if (/^[A-Z0-9_]+$/.test(key)) return key;
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

export function asBoolString(value: unknown): "true" | "false" | null {
  if (value === "true" || value === "false") return value;
  return null;
}

export function entryLabel(
  obj: Record<string, unknown>,
  index: number,
): string {
  for (const key of [
    "DayWeek",
    "dayWeek",
    "Name",
    "name",
    "Title",
    "title",
    "Key",
    "key",
    "Id",
    "id",
  ]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return `Entry ${index + 1}`;
}

export function countLabel(
  kind: "array" | "object",
  count: number,
): string {
  if (kind === "array") {
    return `${count} ${count === 1 ? "item" : "items"}`;
  }
  return `${count} ${count === 1 ? "field" : "fields"}`;
}
