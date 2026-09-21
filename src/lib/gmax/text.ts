/**
 * Never let "undefined" / "null" leak into the UI or the Web2APK title.
 * Missing API fields, Expo constants, and zip converters all stringify to that.
 */
export function safeText(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value !== "string") {
    if (typeof value === "object") return fallback;
    const coerced = String(value).trim();
    if (!coerced || coerced === "undefined" || coerced === "null") return fallback;
    return coerced;
  }
  const s = value.trim();
  if (!s || s === "undefined" || s === "null" || s === "[object Object]") {
    return fallback;
  }
  return s;
}

export function safeUrl(value: unknown): string {
  const s = safeText(value);
  if (!s) return "";
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function greetingFor(hour: number, name: string): { line: string; name: string } {
  const line =
    hour < 12 ? "Good morning," : hour < 18 ? "Good afternoon," : "Good evening,";
  return { line, name: safeText(name) };
}
