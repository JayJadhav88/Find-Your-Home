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
