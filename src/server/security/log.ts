/**
 * Server logger with redaction. Never log tokens, passwords, emails, phone numbers or dates of
 * birth (architecture §10). Pass ids and action names only; anything that slips through is masked.
 */

const REDACT_KEYS = /pass(word)?|secret|token|authorization|cookie|email|phone|mobile|dob|birth|otp|code|url/i;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{24,}\b/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string") return value.replace(EMAIL, "[email]").replace(LONG_TOKEN, "[token]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...(data ? (redact(data) as object) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
