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
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));

export const formatDateLong = (value: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

export const formatTime = (value: string): string =>
  new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export const formatRelativeDate = (value: string): string => {
  const target = new Date(value);
  const today = new Date();
  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const difference = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
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
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
