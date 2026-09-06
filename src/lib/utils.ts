import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

/**
 * Extract a readable message from anything thrown by Tauri `invoke()`,
 * react-query, or vanilla JS.
 *
 * Tauri rejects with our `AppError` shape (`{kind, message, detail}`),
 * which is neither an `Error` instance nor meaningfully stringifiable.
 * The naive `String(err)` yields the infamous `[object Object]`. This
 * helper recognises that shape and pulls the useful fields out.
 */
export function errorMessage(err: unknown): string {
  if (err == null) return "unknown error";
  if (err instanceof Error) return err.message || err.toString();
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const obj = err as Record<string, unknown>;
    const message = typeof obj.message === "string" ? obj.message : null;
    const kind = typeof obj.kind === "string" ? obj.kind : null;
    const detail = typeof obj.detail === "string" ? obj.detail : null;
    if (message) {
      const prefix = kind ? `[${kind}] ` : "";
      return detail ? `${prefix}${message} — ${detail}` : `${prefix}${message}`;
    }
    // Fall back to a JSON dump so we never show [object Object] again.
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}
