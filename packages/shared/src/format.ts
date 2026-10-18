import type { AreaUnit, PricePeriod } from "./domain";

/** Locale settings come from site_settings at run time; nothing here assumes a country. */
export interface LocaleSettings {
  locale: string;
  timeZone: string;
}

export function formatPrice(
  amount: number,
  currency: string,
  { locale }: Pick<LocaleSettings, "locale">,
  options: { compact?: boolean } = {},
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    notation: options.compact ? "compact" : "standard",
    maximumFractionDigits: options.compact ? 1 : 0,
  }).format(amount);
}

const PERIOD_SUFFIX: Record<PricePeriod, string> = {
  total: "",
  per_month: "/ month",
  per_year: "/ year",
  per_week: "/ week",
  per_day: "/ day",
};

export function pricePeriodSuffix(period: PricePeriod): string {
  return PERIOD_SUFFIX[period];
}

const AREA_LABEL: Record<AreaUnit, string> = {
  sq_m: "m²",
  sq_ft: "sq ft",
  acre: "acres",
  hectare: "ha",
};

export function formatArea(value: number, unit: AreaUnit, { locale }: Pick<LocaleSettings, "locale">): string {
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  return `${number} ${AREA_LABEL[unit]}`;
}

export function formatDateTime(value: Date | string, { locale, timeZone }: LocaleSettings): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

/**
 * Converts a wall-clock time ("2026-10-20T14:30" from <input type="datetime-local">) in an
 * IANA time zone to a UTC ISO string, using only Intl (no date library).
 */
/** "2026-10-20T14:30" in the given time zone, for datetime-local inputs. */
export function utcToZonedLocal(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function zonedLocalToUtc(local: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) throw new RangeError(`Invalid local date-time: ${local}`);
  const [y, mo, d, h, mi] = match.slice(1, 6).map(Number) as [number, number, number, number, number];
  const seconds = match[6] ? Number(match[6]) : 0;
  const wallClock = Date.UTC(y, mo - 1, d, h, mi, seconds);

  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value]),
    );
    const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
    return asUtc - instant;
  };

  // Two passes settle the offset around DST transitions.
  let instant = wallClock - offsetAt(wallClock);
  instant = wallClock - offsetAt(instant);
  return new Date(instant).toISOString();
}
