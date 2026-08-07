export const APP_TIME_ZONE = "Europe/Berlin";

type DateInput = string | number | Date;

const zonedDateTimeParts = (value: DateInput, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const valueOf = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? -1);
  return {
    year: valueOf("year"),
    month: valueOf("month"),
    day: valueOf("day"),
    hour: valueOf("hour"),
    minute: valueOf("minute"),
    second: valueOf("second"),
  };
};

export const zonedDateTimeInput = (
  value: DateInput = new Date(),
  timeZone = APP_TIME_ZONE,
): string => {
  const parts = zonedDateTimeParts(value, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day,
  ).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(
    parts.minute,
  ).padStart(2, "0")}`;
};

export const zonedDateTimeToIso = (
  date: string,
  time: string,
  timeZone = APP_TIME_ZONE,
): string | null => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const expected = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  const desired = Date.UTC(
    expected.year,
    expected.month - 1,
    expected.day,
    expected.hour,
    expected.minute,
  );
  const validated = new Date(desired);
  if (
    validated.getUTCFullYear() !== expected.year ||
    validated.getUTCMonth() !== expected.month - 1 ||
    validated.getUTCDate() !== expected.day ||
    expected.hour > 23 ||
    expected.minute > 59
  ) {
    return null;
  }

  try {
    let candidate = desired;
    for (let index = 0; index < 3; index += 1) {
      const displayed = zonedDateTimeParts(candidate, timeZone);
      const displayedUtc = Date.UTC(
        displayed.year,
        displayed.month - 1,
        displayed.day,
        displayed.hour,
        displayed.minute,
        displayed.second,
      );
      candidate += desired - displayedUtc;
    }
    const resolved = zonedDateTimeParts(candidate, timeZone);
    if (
      resolved.year !== expected.year ||
      resolved.month !== expected.month ||
      resolved.day !== expected.day ||
      resolved.hour !== expected.hour ||
      resolved.minute !== expected.minute
    ) {
      return null;
    }
    return new Date(candidate).toISOString();
  } catch {
    return null;
  }
};

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
