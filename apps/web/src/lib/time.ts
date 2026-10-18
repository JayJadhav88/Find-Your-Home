// Server-side time helpers. Kept out of components so render functions stay pure; callers
// must already be request-time (after connection() or a runtime API).

const DAY_MS = 86_400_000;

export function daysAgoMs(days: number): number {
  return Date.now() - days * DAY_MS;
}

export function daysAgoIso(days: number): string {
  return new Date(daysAgoMs(days)).toISOString();
}
