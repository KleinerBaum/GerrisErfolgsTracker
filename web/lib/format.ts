export const APP_TIME_ZONE = "Europe/Berlin";

type DateInput = string | number | Date;

const calendarDateParts = (value: DateInput) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
  };
};

const calendarDayNumber = (value: DateInput): number => {
  const { year, month, day } = calendarDateParts(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
};

export const calendarDayDifference = (
  value: DateInput,
  reference: DateInput = new Date(),
): number => calendarDayNumber(value) - calendarDayNumber(reference);

export const isSameCalendarMonth = (
  value: DateInput,
  reference: DateInput = new Date(),
): boolean => {
  const left = calendarDateParts(value);
  const right = calendarDateParts(reference);
  return left.year === right.year && left.month === right.month;
};

export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);

export const formatCurrencyRounded = (value: number): string =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(value));

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));

export const formatDateLong = (value: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

export const formatTime = (value: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const formatRelativeDate = (value: string): string => {
  const difference = calendarDayDifference(value);
  if (difference === 0) return "Heute";
  if (difference === 1) return "Morgen";
  if (difference === -1) return "Gestern";
  if (difference > 1 && difference < 7) return `In ${difference} Tagen`;
  if (difference < -1 && difference > -7)
    return `Vor ${Math.abs(difference)} Tagen`;
  return formatDate(value);
};

export const isoDateInput = (value?: string): string => {
  const date = value ? new Date(value) : new Date();
  const { year, month, day } = calendarDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
