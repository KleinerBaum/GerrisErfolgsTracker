"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  CalendarClientError,
  createGoogleCalendar as createGoogleCalendarRequest,
  listGoogleCalendars,
  listSelectedCalendarEvents,
} from "../lib/google-calendar-client";
import {
  APP_TIME_ZONE,
  formatCurrency,
  formatDate,
  formatDateLong,
  formatRelativeDate,
  formatTime,
  isoDateInput,
  zonedDateTimeInput,
  zonedDateTimeToIso,
} from "../lib/format";
import { useModalDialog } from "../lib/use-modal-dialog";
import type { GoogleWorkspaceStatus } from "../lib/google-tasks-client";
import type {
  AppState,
  CalendarEvent,
  Cost,
  DayIntentKind,
  GoogleCalendar,
  IntegrationConfig,
  PlanningHealthReport,
} from "../lib/types";

type CalendarMode = "day" | "week" | "month" | "agenda";

type CalendarViewProps = {
  state: AppState;
  externalEvents: CalendarEvent[];
  integrations: IntegrationConfig;
  now: number;
  calendarLive: boolean;
  planningReport: PlanningHealthReport | null;
  planningBusy: boolean;
  planningError: string;
  workspaceStatus: GoogleWorkspaceStatus | null;
  onEventsChange: (events: CalendarEvent[]) => void;
  onNewEvent: () => void;
  onPlanCost: (cost: Cost) => Promise<void>;
  onPlanningRefresh: (reason: string, forceDryRun?: boolean) => Promise<unknown>;
  onPlanningModeChange: (mode: "dry-run" | "safe") => Promise<void>;
  onSetDayIntent: (date: string, kind: DayIntentKind | null) => Promise<void>;
};

const MODE_LABELS: Array<{ key: CalendarMode; label: string }> = [
  { key: "day", label: "Tag" },
  { key: "week", label: "Woche" },
  { key: "month", label: "Monat" },
  { key: "agenda", label: "Agenda" },
];

const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const HOUR_START = 7;
const HOUR_END = 22;
const SELECTED_CALENDAR_STORAGE_KEY = "gerri-calendar-selection-v1";
const CALENDAR_MODE_STORAGE_KEY = "gerri-calendar-mode-v1";
const MAX_SELECTED_CALENDARS = 12;

const logicalDate = (date: string): Date => new Date(`${date}T12:00:00.000Z`);

const dateKey = (value: Date): string => isoDateInput(value.toISOString());

const startOfDay = (value: Date): Date => logicalDate(dateKey(value));

const addDays = (value: Date, days: number): Date => {
  const [year, month, day] = dateKey(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12));
};

const startOfWeek = (value: Date): Date => {
  const date = startOfDay(value);
  const weekday = date.getUTCDay() || 7;
  return addDays(date, 1 - weekday);
};

const dayBoundary = (value: Date): Date => {
  const key = dateKey(value);
  return new Date(
    zonedDateTimeToIso(key, "00:00") ?? `${key}T00:00:00.000Z`,
  );
};

const sameDay = (left: Date, right: Date): boolean =>
  dateKey(left) === dateKey(right);

const eventsForDay = (events: CalendarEvent[], day: Date): CalendarEvent[] => {
  const from = dayBoundary(day).getTime();
  const to = dayBoundary(addDays(day, 1)).getTime();
  return events.filter((event) => {
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();
    return start < to && end > from;
  });
};

const deduplicateEvents = (events: CalendarEvent[]): CalendarEvent[] => {
  const unique = new Map<string, CalendarEvent>();
  for (const event of events) unique.set(event.id, event);
  return [...unique.values()].sort((left, right) =>
    left.startAt.localeCompare(right.startAt),
  );
};

const eventMinutesOnDay = (
  event: CalendarEvent,
  day: Date,
): { start: number; end: number } => {
  const dayStart = dayBoundary(day).getTime();
  const dayEnd = dayBoundary(addDays(day, 1)).getTime();
  const minute = (value: string, endEdge = false): number => {
    const timestamp = new Date(value).getTime();
    if (timestamp <= dayStart) return 0;
    if (timestamp >= dayEnd) return 1_440;
    const local = zonedDateTimeInput(timestamp);
    if (!local.startsWith(dateKey(day))) return endEdge ? 1_440 : 0;
    const [hours, minutes] = local.slice(11).split(":").map(Number);
    return hours * 60 + minutes;
  };
  return {
    start: minute(event.startAt),
    end: minute(event.endAt, true),
  };
};

const minutesNow = (now: number): number => {
  const [hours, minutes] = zonedDateTimeInput(now)
    .slice(11)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
};

const mergedBusyMinutes = (events: CalendarEvent[], day: Date): number => {
  const intervals = eventsForDay(events, day)
    .filter((event) => !event.allDay && event.availability !== "free")
    .map((event) => eventMinutesOnDay(event, day))
    .map(({ start, end }) => ({
      start: Math.max(8 * 60, start),
      end: Math.min(20 * 60, end),
    }))
    .filter(({ start, end }) => end > start)
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let currentStart = -1;
  let currentEnd = -1;
  for (const interval of intervals) {
    if (currentStart < 0) {
      currentStart = interval.start;
      currentEnd = interval.end;
    } else if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
    } else {
      total += currentEnd - currentStart;
      currentStart = interval.start;
      currentEnd = interval.end;
    }
  }
  return currentStart < 0 ? 0 : total + currentEnd - currentStart;
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} Std. ${remainder} Min.` : `${hours} Std.`;
};

const minuteLabel = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;

const longestFreeWindow = (
  events: CalendarEvent[],
  day: Date,
): { start: number; end: number; duration: number } => {
  const from = 8 * 60;
  const to = 20 * 60;
  const intervals = eventsForDay(events, day)
    .filter((event) => !event.allDay && event.availability !== "free")
    .map((event) => eventMinutesOnDay(event, day))
    .map((interval) => ({
      start: Math.max(from, interval.start),
      end: Math.min(to, interval.end),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
  let cursor = from;
  let best = { start: from, end: from, duration: 0 };
  for (const interval of intervals) {
    if (interval.start > cursor && interval.start - cursor > best.duration) {
      best = {
        start: cursor,
        end: interval.start,
        duration: interval.start - cursor,
      };
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (to - cursor > best.duration) {
    best = { start: cursor, end: to, duration: to - cursor };
  }
  return best;
};

const conflictCount = (events: CalendarEvent[], day: Date): number => {
  const timed = eventsForDay(events, day)
    .filter((event) => !event.allDay && event.availability !== "free")
    .map((event) => ({
      start: new Date(event.startAt).getTime(),
      end: new Date(event.endAt).getTime(),
    }))
    .sort((left, right) => left.start - right.start);
  let conflicts = 0;
  for (let index = 1; index < timed.length; index += 1) {
    if (timed[index].start < timed[index - 1].end) conflicts += 1;
  }
  return conflicts;
};

const calendarFallback = (integrations: IntegrationConfig): GoogleCalendar => ({
  id: integrations.calendarId || "primary",
  name: "Hauptkalender",
  backgroundColor: "#2fb596",
  foregroundColor: "#ffffff",
  primary: true,
  selected: true,
  accessRole: "owner",
  timeZone: "Europe/Berlin",
});

const eventStyle = (color: string): CSSProperties & { "--calendar-accent": string } =>
  ({ "--calendar-accent": color }) as CSSProperties & {
    "--calendar-accent": string;
  };

const eventColor = (
  event: CalendarEvent,
  calendars: GoogleCalendar[],
): string => {
  const calendar = calendars.find((candidate) => candidate.id === event.calendarId);
  if (calendar) return calendar.backgroundColor;
  if (event.kind === "birthday") return "#d77a8e";
  if (event.kind === "payment") return "#d6a657";
  if (event.kind === "focus") return "#aa88db";
  return "#5e9fd6";
};

function GuideCard({
  eyebrow,
  title,
  value,
  tone,
  children,
}: {
  eyebrow: string;
  title: string;
  value: string;
  tone: "green" | "blue" | "amber";
  children: ReactNode;
}) {
  return (
    <article className={`calendar-guide-card guide-${tone}`}>
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <strong>{value}</strong>
      </header>
      {children}
    </article>
  );
}

function MiniMonth({
  anchorDate,
  now,
  onSelect,
}: {
  anchorDate: Date;
  now: number;
  onSelect: (date: Date) => void;
}) {
  const today = startOfDay(new Date(now));
  const monthStart = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1, 12),
  );
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return (
    <section className="calendar-mini" aria-label="Kleiner Monatskalender">
      <strong>
        {new Intl.DateTimeFormat("de-DE", {
          timeZone: APP_TIME_ZONE,
          month: "long",
          year: "numeric",
        }).format(anchorDate)}
      </strong>
      <div className="calendar-mini-weekdays" aria-hidden="true">
        {WEEKDAY_SHORT.map((weekday) => (
          <span key={weekday}>{weekday.slice(0, 1)}</span>
        ))}
      </div>
      <div className="calendar-mini-days">
        {days.map((day) => (
          <button
            aria-label={formatDateLong(day.toISOString())}
            className={`${
              day.getUTCMonth() === anchorDate.getUTCMonth() ? "" : "outside"
            } ${sameDay(day, today) ? "today" : ""} ${
              sameDay(day, anchorDate) ? "selected" : ""
            }`}
            key={dateKey(day)}
            onClick={() => onSelect(day)}
            type="button"
          >
            {day.getUTCDate()}
          </button>
        ))}
      </div>
    </section>
  );
}

function MonthCalendar({
  anchorDate,
  events,
  calendars,
  now,
  onSelectDay,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  calendars: GoogleCalendar[];
  now: number;
  onSelectDay: (date: Date) => void;
}) {
  const today = startOfDay(new Date(now));
  const monthStart = new Date(
    Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1, 12),
  );
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return (
    <div className="calendar-month" role="grid" aria-label="Monatsansicht">
      {WEEKDAY_SHORT.map((weekday) => (
        <div className="calendar-month-weekday" key={weekday} role="columnheader">
          {weekday}
        </div>
      ))}
      {days.map((day) => {
        const dayEvents = eventsForDay(events, day);
        return (
          <div
            className={`calendar-month-day ${
              day.getUTCMonth() === anchorDate.getUTCMonth() ? "" : "outside"
            } ${sameDay(day, today) ? "today" : ""}`}
            key={dateKey(day)}
            role="gridcell"
          >
            <button
              aria-label={`${formatDateLong(day.toISOString())} öffnen`}
              onClick={() => onSelectDay(day)}
              type="button"
            >
              <span>{day.getUTCDate()}</span>
              {sameDay(day, today) ? <small>Heute</small> : null}
            </button>
            <div className="calendar-month-events">
              {dayEvents.slice(0, 3).map((event) => (
                <article
                  key={event.id}
                  style={eventStyle(eventColor(event, calendars))}
                  title={event.title}
                >
                  <span>{event.allDay ? "Ganztägig" : formatTime(event.startAt)}</span>
                  <strong>{event.title}</strong>
                </article>
              ))}
              {dayEvents.length > 3 ? <small>+ {dayEvents.length - 3} weitere</small> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekCalendar({
  anchorDate,
  events,
  calendars,
  now,
  onSelectDay,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  calendars: GoogleCalendar[];
  now: number;
  onSelectDay: (date: Date) => void;
}) {
  const today = startOfDay(new Date(now));
  const weekStart = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const hours = Array.from(
    { length: HOUR_END - HOUR_START + 1 },
    (_, index) => HOUR_START + index,
  );
  const nowTop =
    ((minutesNow(now) - HOUR_START * 60) /
      ((HOUR_END - HOUR_START) * 60)) *
    100;

  return (
    <div className="calendar-week-scroll">
      <div className="calendar-week-header">
        <span className="calendar-zone">MEZ</span>
        {days.map((day) => (
          <button
            className={sameDay(day, today) ? "today" : ""}
            key={dateKey(day)}
            onClick={() => onSelectDay(day)}
            type="button"
          >
            <span>{WEEKDAY_SHORT[(day.getUTCDay() + 6) % 7]}</span>
            <strong>{day.getUTCDate()}</strong>
          </button>
        ))}
      </div>
      <div className="calendar-week-body">
        <div className="calendar-hour-scale" aria-hidden="true">
          {hours.slice(0, -1).map((hour) => (
            <span key={hour} style={{ top: `${((hour - HOUR_START) / (HOUR_END - HOUR_START)) * 100}%` }}>
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((day) => {
          const dayEvents = eventsForDay(events, day).filter((event) => !event.allDay);
          return (
            <div className={`calendar-week-column ${sameDay(day, today) ? "today" : ""}`} key={dateKey(day)}>
              {hours.slice(0, -1).map((hour) => (
                <span className="calendar-hour-line" key={hour} />
              ))}
              {sameDay(day, today) && nowTop >= 0 && nowTop <= 100 ? (
                <span className="calendar-now-line" style={{ top: `${nowTop}%` }} />
              ) : null}
              {dayEvents.map((event, index) => {
                const interval = eventMinutesOnDay(event, day);
                const visibleStart = Math.max(HOUR_START * 60, interval.start);
                const visibleEnd = Math.min(HOUR_END * 60, interval.end);
                if (visibleEnd <= visibleStart) return null;
                const top =
                  ((visibleStart - HOUR_START * 60) /
                    ((HOUR_END - HOUR_START) * 60)) *
                  100;
                const height = Math.max(
                  2.6,
                  ((visibleEnd - visibleStart) /
                    ((HOUR_END - HOUR_START) * 60)) *
                    100,
                );
                return (
                  <article
                    className="calendar-timed-event"
                    key={event.id}
                    style={{
                      ...eventStyle(eventColor(event, calendars)),
                      top: `${top}%`,
                      height: `${height}%`,
                      left: `${5 + (index % 3) * 3}%`,
                    }}
                  >
                    <strong>{event.title}</strong>
                    <span>
                      {formatTime(event.startAt)}–{formatTime(event.endAt)}
                    </span>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayCalendar({
  day,
  events,
  calendars,
  now,
}: {
  day: Date;
  events: CalendarEvent[];
  calendars: GoogleCalendar[];
  now: number;
}) {
  const hours = Array.from(
    { length: HOUR_END - HOUR_START },
    (_, index) => HOUR_START + index,
  );
  const dayEvents = eventsForDay(events, day);
  const timedEvents = dayEvents.filter((event) => !event.allDay);
  const allDayEvents = dayEvents.filter((event) => event.allDay);
  const nowTop =
    ((minutesNow(now) - HOUR_START * 60) /
      ((HOUR_END - HOUR_START) * 60)) *
    100;
  return (
    <div className="calendar-day-view">
      <header>
        <span>
          {new Intl.DateTimeFormat("de-DE", {
            timeZone: APP_TIME_ZONE,
            weekday: "long",
          }).format(day)}
        </span>
        <strong>{day.getUTCDate()}</strong>
        <p>{formatDateLong(day.toISOString())}</p>
      </header>
      {allDayEvents.length ? (
        <div className="calendar-all-day-row">
          <span>Ganztägig</span>
          <div>
            {allDayEvents.map((event) => (
              <article
                className={event.availability === "free" ? "calendar-free-event" : undefined}
                key={event.id}
                style={eventStyle(eventColor(event, calendars))}
              >
                <span>{event.title}</span>
                {event.availability === "free" ? (
                  <small>Verfügbar · blockiert keine Zeit</small>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ) : null}
      <div className="calendar-day-timeline">
        <div className="calendar-day-hours" aria-hidden="true">
          {hours.map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
          ))}
        </div>
        <div className="calendar-day-track">
          {hours.map((hour) => (
            <span className="calendar-hour-line" key={hour} />
          ))}
          {sameDay(day, new Date(now)) && nowTop >= 0 && nowTop <= 100 ? (
            <span className="calendar-now-line" style={{ top: `${nowTop}%` }} />
          ) : null}
          {timedEvents.map((event, index) => {
            const interval = eventMinutesOnDay(event, day);
            const visibleStart = Math.max(HOUR_START * 60, interval.start);
            const visibleEnd = Math.min(HOUR_END * 60, interval.end);
            if (visibleEnd <= visibleStart) return null;
            const top =
              ((visibleStart - HOUR_START * 60) /
                ((HOUR_END - HOUR_START) * 60)) *
              100;
            const height = Math.max(
              2.8,
              ((visibleEnd - visibleStart) /
                ((HOUR_END - HOUR_START) * 60)) *
                100,
            );
            return (
              <article
                className="calendar-day-event"
                key={event.id}
                style={{
                  ...eventStyle(eventColor(event, calendars)),
                  top: `${top}%`,
                  height: `${height}%`,
                  left: `${2 + (index % 3) * 2}%`,
                }}
              >
                <span>
                  {formatTime(event.startAt)}–{formatTime(event.endAt)}
                </span>
                <strong>{event.title}</strong>
                {event.location ? <small>{event.location}</small> : null}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgendaCalendar({
  anchorDate,
  events,
  calendars,
  planningReport,
}: {
  anchorDate: Date;
  events: CalendarEvent[];
  calendars: GoogleCalendar[];
  planningReport: PlanningHealthReport | null;
}) {
  const from = startOfDay(anchorDate).getTime();
  const to = addDays(startOfDay(anchorDate), 31).getTime();
  const visibleEvents = events.filter((event) => {
    const end = new Date(event.endAt).getTime();
    const start = new Date(event.startAt).getTime();
    return end > from && start < to;
  });
  const grouped = visibleEvents.reduce<Map<string, CalendarEvent[]>>((result, event) => {
    const key = dateKey(new Date(event.startAt));
    result.set(key, [...(result.get(key) || []), event]);
    return result;
  }, new Map());
  if (!visibleEvents.length) {
    return (
      <div className="calendar-empty-state">
        <strong>
          {planningReport?.state === "intentionally_free"
            ? "Der Tag ist bewusst frei."
            : "Keine Einträge geladen – dieser Zeitraum gilt als Planungslücke."}
        </strong>
        <p>
          {planningReport?.message ||
            "Nur aktuelle Kalenderdaten und eine Tagesfreigabe bestätigen freie Zeit."}
        </p>
      </div>
    );
  }
  return (
    <div className="calendar-agenda-view">
      {[...grouped.entries()].map(([key, dayEvents]) => {
        const date = new Date(`${key}T12:00:00`);
        return (
          <section key={key}>
            <header>
              <span>{formatRelativeDate(date.toISOString())}</span>
              <strong>{formatDateLong(date.toISOString())}</strong>
              <small>{dayEvents.length} Einträge</small>
            </header>
            <div>
              {dayEvents.map((event) => (
                <article key={event.id} style={eventStyle(eventColor(event, calendars))}>
                  <time>
                    {event.allDay
                      ? "Ganztägig"
                      : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`}
                  </time>
                  <div>
                    <span>
                      {event.kind === "focus"
                        ? "Fokus"
                        : event.kind === "payment"
                          ? "Frist"
                          : "Termin"}
                    </span>
                    <strong>{event.title}</strong>
                    {event.location ? <small>{event.location}</small> : null}
                  </div>
                  <small>{event.private ? "Privat" : "Standard"}</small>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function NewCalendarDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (calendar: GoogleCalendar) => void;
}) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectUrl, setConnectUrl] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    setConnectUrl("");
    try {
      onCreated(
        await createGoogleCalendarRequest({
          name: name.trim(),
          description: description.trim(),
          timeZone: "Europe/Berlin",
        }),
      );
      onClose();
    } catch (caught) {
      if (caught instanceof CalendarClientError) {
        setConnectUrl(caught.connectUrl);
        setError(caught.message);
      } else {
        setError("Der neue Google-Kalender konnte nicht angelegt werden.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="new-calendar-title"
        aria-modal="true"
        className="capture-dialog calendar-create-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="dialog-handle" />
        <header className="dialog-heading">
          <div>
            <span className="eyebrow">Neuer Kalender</span>
            <h2 id="new-calendar-title">Google-Kalender anlegen</h2>
          </div>
          <button aria-label="Schließen" onClick={onClose} type="button">
            Schließen
          </button>
        </header>
        <form className="capture-form action-form" onSubmit={submit}>
          <label>
            Kalendername
            <input
              autoFocus
              maxLength={160}
              onChange={(event) => setName(event.target.value)}
              placeholder="z. B. Familie oder Fokuszeit"
              required
              value={name}
            />
          </label>
          <label>
            Beschreibung
            <textarea
              maxLength={1_000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Wofür soll dieser Kalender genutzt werden?"
              rows={3}
              value={description}
            />
          </label>
          <div className="calendar-create-info">
            <strong>In deinem Google-Konto</strong>
            <p>Der Kalender bleibt leer, bis du Termine hinzufügst.</p>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions">
            <button className="button button-ghost" onClick={onClose} type="button">
              Abbrechen
            </button>
            {connectUrl ? (
              <a className="button button-soft" href={connectUrl}>
                Berechtigung ergänzen
              </a>
            ) : null}
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? "Wird angelegt …" : "Kalender anlegen"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function CalendarView({
  state,
  externalEvents,
  integrations,
  now,
  calendarLive,
  planningReport,
  planningBusy,
  planningError,
  workspaceStatus,
  onEventsChange,
  onNewEvent,
  onPlanCost,
  onPlanningRefresh,
  onPlanningModeChange,
  onSetDayIntent,
}: CalendarViewProps) {
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date(now)));
  const [mode, setMode] = useState<CalendarMode>("month");
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([
    calendarFallback(integrations),
  ]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([
    integrations.calendarId || "primary",
  ]);
  const [calendarEvents, setCalendarEvents] = useState(externalEvents);
  const [catalogReady, setCatalogReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [connectUrl, setConnectUrl] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [planningCostId, setPlanningCostId] = useState("");
  const requestedWindow = useMemo(() => {
    let from = startOfDay(anchorDate);
    let to = addDays(from, 1);
    if (mode === "month") {
      from = startOfWeek(
        new Date(
          Date.UTC(
            anchorDate.getUTCFullYear(),
            anchorDate.getUTCMonth(),
            1,
            12,
          ),
        ),
      );
      to = addDays(from, 42);
    } else if (mode === "week") {
      from = startOfWeek(anchorDate);
      to = addDays(from, 7);
    } else if (mode === "agenda") {
      to = addDays(from, 31);
    }
    return {
      timeMin: dayBoundary(from).toISOString(),
      timeMax: dayBoundary(to).toISOString(),
    };
  }, [anchorDate, mode]);

  const loadCalendarCatalog = useCallback(async () => {
    setCalendarError("");
    setConnectUrl("");
    try {
      const loaded = await listGoogleCalendars();
      const nextCalendars = loaded.length
        ? loaded
        : [calendarFallback(integrations)];
      setCalendars(nextCalendars);
      setCatalogReady(true);
      let stored: string[] = [];
      try {
        const value = window.localStorage.getItem(SELECTED_CALENDAR_STORAGE_KEY);
        const parsed = value ? (JSON.parse(value) as unknown) : [];
        stored = Array.isArray(parsed)
          ? parsed.filter((id): id is string => typeof id === "string")
          : [];
      } catch {
        stored = [];
      }
      const available = new Set(nextCalendars.map((calendar) => calendar.id));
      const restored = stored.filter((id) => available.has(id)).slice(0, 12);
      const defaults = nextCalendars
        .filter((calendar) => calendar.selected || calendar.primary)
        .map((calendar) => calendar.id)
        .slice(0, 12);
      setSelectedCalendarIds(
        restored.length
          ? restored
          : defaults.length
            ? defaults
            : [nextCalendars[0].id],
      );
    } catch (caught) {
      setCatalogReady(false);
      if (caught instanceof CalendarClientError) {
        setCalendarError(caught.message);
        setConnectUrl(caught.connectUrl);
      } else {
        setCalendarError("Die Kalenderauswahl ist momentan nicht erreichbar.");
      }
    }
  }, [integrations]);

  useEffect(() => {
    let restoreTimer = 0;
    const loadTimer = window.setTimeout(() => void loadCalendarCatalog(), 0);
    try {
      const storedMode = window.localStorage.getItem(CALENDAR_MODE_STORAGE_KEY);
      if (MODE_LABELS.some((candidate) => candidate.key === storedMode)) {
        restoreTimer = window.setTimeout(
          () => setMode(storedMode as CalendarMode),
          0,
        );
      }
    } catch {
      // Die Ansichtspräferenz ist optional und bleibt nur auf diesem Gerät.
    }
    return () => {
      window.clearTimeout(loadTimer);
      window.clearTimeout(restoreTimer);
    };
  }, [loadCalendarCatalog]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CALENDAR_MODE_STORAGE_KEY, mode);
    } catch {
      // Die Ansicht funktioniert auch ohne lokalen Präferenzspeicher.
    }
  }, [mode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        SELECTED_CALENDAR_STORAGE_KEY,
        JSON.stringify(selectedCalendarIds),
      );
    } catch {
      // Die Auswahl bleibt bei gesperrtem Browserspeicher nur für diese Sitzung aktiv.
    }
  }, [selectedCalendarIds]);

  useEffect(() => {
    if (!catalogReady) return;
    if (!selectedCalendarIds.length) {
      onEventsChange([]);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      setCalendarError("");
      try {
        const loaded = await listSelectedCalendarEvents(
          selectedCalendarIds,
          requestedWindow,
        );
        if (!active) return;
        setCalendarEvents(loaded);
        const todayTime = Date.now();
        if (
          new Date(requestedWindow.timeMin).getTime() <= todayTime &&
          new Date(requestedWindow.timeMax).getTime() > todayTime
        ) {
          onEventsChange(loaded);
        }
        void onPlanningRefresh("calendar-refresh");
      } catch (caught) {
        if (!active) return;
        if (caught instanceof CalendarClientError) {
          setCalendarError(caught.message);
          setConnectUrl(caught.connectUrl);
        } else {
          setCalendarError("Die ausgewählten Termine konnten nicht geladen werden.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    catalogReady,
    onEventsChange,
    onPlanningRefresh,
    requestedWindow,
    selectedCalendarIds,
  ]);

  const events = useMemo(
    () => {
      const selected = new Set(selectedCalendarIds);
      const retainedExternalEvents = externalEvents.filter(
        (event) =>
          event.source !== "google" ||
          selected.has(event.calendarId || integrations.calendarId || "primary"),
      );
      const retainedLoadedEvents = calendarEvents.filter(
        (event) =>
          event.source !== "google" ||
          selected.has(event.calendarId || integrations.calendarId || "primary"),
      );
      return deduplicateEvents([
        ...retainedExternalEvents,
        ...retainedLoadedEvents,
        ...state.calendarEvents,
      ]);
    },
    [
      calendarEvents,
      externalEvents,
      integrations.calendarId,
      selectedCalendarIds,
      state.calendarEvents,
    ],
  );
  const today = useMemo(() => startOfDay(new Date(now)), [now]);
  const todayEvents = useMemo(() => eventsForDay(events, today), [events, today]);
  const runningEvent = todayEvents.find(
    (event) =>
      new Date(event.startAt).getTime() <= now &&
      new Date(event.endAt).getTime() > now,
  );
  const nextEvent = events.find((event) => new Date(event.startAt).getTime() > now);
  const busyMinutes = mergedBusyMinutes(events, today);
  const freeWindow = longestFreeWindow(events, today);
  const conflicts = conflictCount(events, today);
  const focusBlocks = todayEvents.filter((event) => event.kind === "focus").length;
  const upcomingCosts = state.costs
    .filter((cost) => cost.status !== "paid")
    .filter((cost) => {
      const days = Math.round(
        (startOfDay(new Date(cost.dueAt)).getTime() - today.getTime()) / 86_400_000,
      );
      return days >= 0 && days <= 14;
    })
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
  const ownedCalendars = calendars.filter((calendar) => calendar.accessRole === "owner");
  const otherCalendars = calendars.filter((calendar) => calendar.accessRole !== "owner");
  const managementReady = catalogReady;
  const activeCalendarName =
    selectedCalendarIds.length === 1
      ? calendars.find((calendar) => calendar.id === selectedCalendarIds[0])?.name ||
        "1 Kalender"
      : `${selectedCalendarIds.length} Kalender`;
  const todayPlanning = planningReport?.days.find(
    (day) => day.date === dateKey(today),
  );
  const activePlanningGaps = (planningReport?.gaps || []).filter(
    (gap) => gap.status === "open",
  );
  const canActivateSafeAutomation = Boolean(
    planningReport?.automationMode === "dry-run" &&
      planningReport.lastSyncRun?.mode === "dry-run" &&
      planningReport.lastSyncRun.status === "succeeded" &&
      planningReport.lastSyncRun.conflictCount === 0,
  );

  const navigatePeriod = (direction: -1 | 1) => {
    if (mode === "month") {
      setAnchorDate(
        new Date(
          Date.UTC(
            anchorDate.getUTCFullYear(),
            anchorDate.getUTCMonth() + direction,
            1,
            12,
          ),
        ),
      );
    } else if (mode === "week") {
      setAnchorDate(addDays(anchorDate, direction * 7));
    } else {
      setAnchorDate(addDays(anchorDate, direction));
    }
  };

  const periodTitle =
    mode === "month"
      ? new Intl.DateTimeFormat("de-DE", {
          timeZone: APP_TIME_ZONE,
          month: "long",
          year: "numeric",
        }).format(anchorDate)
      : mode === "week"
        ? `${formatDate(startOfWeek(anchorDate).toISOString())} – ${formatDate(
            addDays(startOfWeek(anchorDate), 6).toISOString(),
          )}`
        : formatDateLong(anchorDate.toISOString());

  const toggleCalendar = (calendarId: string) => {
    setCalendarError("");
    setSelectedCalendarIds((current) => {
      if (current.includes(calendarId)) {
        return current.filter((id) => id !== calendarId);
      }
      if (current.length >= MAX_SELECTED_CALENDARS) {
        setCalendarError(
          `Bitte höchstens ${MAX_SELECTED_CALENDARS} Kalender gleichzeitig auswählen.`,
        );
        return current;
      }
      return [...current, calendarId];
    });
  };

  const selectDay = (day: Date) => {
    setAnchorDate(startOfDay(day));
    setMode("day");
  };

  const handleCreatedCalendar = (calendar: GoogleCalendar) => {
    setCalendars((current) => [
      ...current.filter((candidate) => candidate.id !== calendar.id),
      calendar,
    ]);
    setSelectedCalendarIds((current) =>
      [...new Set([...current, calendar.id])].slice(0, MAX_SELECTED_CALENDARS),
    );
    setCatalogReady(true);
  };

  return (
    <div className="view-stack calendar-view">
      <section className="calendar-day-focus" aria-labelledby="calendar-day-title">
        <div className="calendar-date-medallion" aria-hidden="true">
          <span>
            {new Intl.DateTimeFormat("de-DE", {
              timeZone: APP_TIME_ZONE,
              weekday: "short",
            }).format(today)}
          </span>
          <strong>{today.getUTCDate()}</strong>
          <small>
            {new Intl.DateTimeFormat("de-DE", {
              timeZone: APP_TIME_ZONE,
              month: "short",
            }).format(today)}
          </small>
        </div>
        <div className="calendar-day-copy">
          <span className="eyebrow">Heute</span>
          <h1 id="calendar-day-title" tabIndex={-1}>
            {runningEvent
              ? `${runningEvent.title} ist jetzt dran.`
              : nextEvent && sameDay(new Date(nextEvent.startAt), today)
                ? `Dein nächster Termin beginnt um ${formatTime(nextEvent.startAt)}.`
                : todayPlanning?.state === "intentionally_free"
                  ? "Heute ist bewusst frei."
                  : planningReport?.title || "Der Planungsstand ist noch unbekannt."}
          </h1>
          <p>
            {todayEvents.length
              ? `${todayEvents.length} ${todayEvents.length === 1 ? "Eintrag" : "Einträge"}, ${formatDuration(
                  busyMinutes,
                )} gebundene Zeit und ${focusBlocks || "noch keine"} Fokusblöcke.`
              : todayPlanning?.state === "intentionally_free"
                ? "Freier Tag bestätigt."
                : "Keine Planungsblöcke. Der Tag gilt noch nicht als frei."}
          </p>
        </div>
        <div className="calendar-day-actions">
          <span
            className={`calendar-sync-pill ${
              planningReport &&
              !["unknown", "stale", "conflicted"].includes(planningReport.state)
                ? "live"
                : ""
            }`}
          >
            <i aria-hidden="true" />
            {planningReport?.state === "healthy" ||
            planningReport?.state === "intentionally_free"
              ? "Planung aktuell"
              : calendarLive
                ? "Planung unvollständig"
                : "Google-Verbindung prüfen"}
          </span>
          <div>
            <button className="button button-primary" onClick={onNewEvent} type="button">
              Termin anlegen
            </button>
            <button
              className="button button-soft"
              onClick={() => {
                setAnchorDate(today);
                setMode("day");
              }}
              type="button"
            >
              Heute ansehen
            </button>
          </div>
        </div>
      </section>

      <section
        className={`calendar-planning-command planning-health-${planningReport?.state || "unknown"}`}
        aria-labelledby="calendar-planning-health-title"
      >
        <div className="calendar-planning-summary">
          <span className="eyebrow">Planungscheck</span>
          <h2 id="calendar-planning-health-title">
            {planningReport?.title || "Planung prüfen"}
          </h2>
          <p>
            {planningError ||
              planningReport?.message ||
              "Freie Zeit bleibt bis zum Kalenderabgleich ungeklärt."}
          </p>
          <div className="calendar-planning-counts">
            <span><strong>{planningReport?.criticalCount || 0}</strong> dringend</span>
            <span><strong>{planningReport?.importantCount || 0}</strong> wichtig</span>
            <span><strong>{planningReport?.managedCalendars.filter((item) => item.status === "ready").length || 0}/4</strong> Bereichskalender</span>
          </div>
        </div>
        <div className="calendar-day-intent">
          <strong>Heute</strong>
          <p>Ist der Tag bewusst frei?</p>
          <div>
            {([
              ["intentionally_free", "Bewusst frei"],
              ["vacation", "Urlaub"],
              ["sick", "Krankheit"],
            ] as Array<[DayIntentKind, string]>).map(([kind, label]) => (
              <button
                aria-pressed={todayPlanning?.intent === kind}
                className={todayPlanning?.intent === kind ? "active" : ""}
                disabled={planningBusy}
                key={kind}
                onClick={() => void onSetDayIntent(dateKey(today), kind)}
                type="button"
              >
                {label}
              </button>
            ))}
            {todayPlanning?.intent ? (
              <button
                disabled={planningBusy}
                onClick={() => void onSetDayIntent(dateKey(today), null)}
                type="button"
              >
                Freigabe entfernen
              </button>
            ) : null}
          </div>
        </div>
        <div className="calendar-gap-priority">
          <strong>Offene Punkte</strong>
          {activePlanningGaps.length ? (
            <ol>
              {activePlanningGaps.slice(0, 5).map((gap) => (
                <li key={gap.id}>
                  <span className={`gap-severity gap-${gap.severity}`}>
                    {gap.severity === "critical" ? "D & W" : "Wichtig"}
                  </span>
                  <span><strong>{gap.title}</strong><small>{gap.detail}</small></span>
                </li>
              ))}
            </ol>
          ) : (
            <p>Planung ist geklärt.</p>
          )}
        </div>
        <div className="calendar-automation-actions">
          <button
            className="button button-soft"
            disabled={planningBusy}
            onClick={() => void onPlanningRefresh("manual-dry-run", true)}
            type="button"
          >
            {planningBusy ? "Änderungen werden geprüft …" : "Änderungen prüfen"}
          </button>
          {planningReport?.automationMode === "safe" ? (
            <button
              className="button button-soft"
              disabled={planningBusy}
              onClick={() => void onPlanningModeChange("dry-run")}
              type="button"
            >
              Automatik pausieren
            </button>
          ) : (
            <button
              className="button button-primary"
              disabled={planningBusy || !canActivateSafeAutomation}
              onClick={() => {
                if (
                  window.confirm(
                    "Der letzte Abgleich war konfliktfrei. Automatische Pflege für Gerris-Termine und Lückenaufgaben aktivieren?",
                  )
                ) {
                  void onPlanningModeChange("safe");
                }
              }}
              type="button"
            >
              Automatik aktivieren
            </button>
          )}
          <small>
            Fremde Termine bleiben schreibgeschützt. Unklare Änderungen fragst du selbst ab.
          </small>
        </div>
      </section>

      <section className="calendar-guides" aria-label="Deine Tages-Guides">
        <GuideCard
          eyebrow="Tag"
          title={
            conflicts
              ? "Überschneidungen klären"
              : todayPlanning?.state === "planned" ||
                  todayPlanning?.state === "intentionally_free"
                ? "Der Tag ist bestätigt"
                : "Planungslücke schließen"
          }
          tone="green"
          value={`${todayEvents.length}`}
        >
          <dl>
            <div>
              <dt>Gebundene Zeit</dt>
              <dd>{formatDuration(busyMinutes)}</dd>
            </div>
            <div>
              <dt>Konflikte</dt>
              <dd>{conflicts || "Keine"}</dd>
            </div>
            <div>
              <dt>Nächster Wechsel</dt>
              <dd>
                {nextEvent
                  ? formatRelativeDate(nextEvent.startAt)
                  : todayPlanning?.state === "intentionally_free"
                    ? "Bewusst frei"
                    : "Nicht bestätigt"}
              </dd>
            </div>
          </dl>
        </GuideCard>
        <GuideCard
          eyebrow="Fokus"
          title={freeWindow.duration >= 60 ? "Raum für Konzentration" : "Pausen bewusst schützen"}
          tone="blue"
          value={formatDuration(Math.max(0, freeWindow.duration))}
        >
          <p>
            Größtes freies Fenster heute: {minuteLabel(freeWindow.start)}–
            {minuteLabel(freeWindow.end)} Uhr.
          </p>
          <button onClick={onNewEvent} type="button">
            Fokuszeit reservieren
          </button>
        </GuideCard>
        <GuideCard
          eyebrow="Fristen"
          title={upcomingCosts.length ? "Zahlungen rechtzeitig sehen" : "Keine offene Zahlungsfrist"}
          tone="amber"
          value={`${upcomingCosts.length}`}
        >
          {upcomingCosts[0] ? (
            <div className="calendar-guide-cost">
              <div>
                <span>{formatRelativeDate(upcomingCosts[0].dueAt)}</span>
                <strong>{upcomingCosts[0].title}</strong>
                <small>{formatCurrency(upcomingCosts[0].amount)}</small>
              </div>
              <button
                disabled={Boolean(planningCostId)}
                onClick={async () => {
                  setPlanningCostId(upcomingCosts[0].id);
                  await onPlanCost(upcomingCosts[0]);
                  setPlanningCostId("");
                }}
                type="button"
              >
                {planningCostId ? "Wird geplant …" : "Privat erinnern"}
              </button>
            </div>
          ) : (
            <p>Für die nächsten 14 Tage ist keine offene Zahlung eingeplant.</p>
          )}
        </GuideCard>
      </section>

      <section className="panel calendar-workspace" aria-labelledby="calendar-workspace-title">
        <header className="calendar-toolbar">
          <div className="calendar-period-navigation">
            <button aria-label="Vorheriger Zeitraum" onClick={() => navigatePeriod(-1)} type="button">
              ‹
            </button>
            <button onClick={() => setAnchorDate(today)} type="button">
              Heute
            </button>
            <button aria-label="Nächster Zeitraum" onClick={() => navigatePeriod(1)} type="button">
              ›
            </button>
            <div>
              <span className="eyebrow">{activeCalendarName}</span>
              <h2 id="calendar-workspace-title">{periodTitle}</h2>
            </div>
          </div>
          <div className="calendar-mode-switch" aria-label="Kalenderansicht">
            {MODE_LABELS.map((candidate) => (
              <button
                aria-pressed={mode === candidate.key}
                className={mode === candidate.key ? "active" : ""}
                key={candidate.key}
                onClick={() => setMode(candidate.key)}
                type="button"
              >
                {candidate.label}
              </button>
            ))}
          </div>
        </header>

        <div className="calendar-workspace-layout">
          <aside className="calendar-sidebar">
            <MiniMonth anchorDate={anchorDate} now={now} onSelect={selectDay} />
            <section className="calendar-source-picker" aria-labelledby="calendar-source-title">
              <header>
                <div>
                  <span className="eyebrow">Auswahl</span>
                  <h3 id="calendar-source-title">Meine Kalender</h3>
                </div>
                <button aria-label="Neuen Kalender anlegen" onClick={() => setCreateOpen(true)} type="button">
                  +
                </button>
              </header>
              <div className="calendar-source-list">
                {ownedCalendars.map((calendar) => (
                  <label key={calendar.id}>
                    <input
                      checked={selectedCalendarIds.includes(calendar.id)}
                      onChange={() => toggleCalendar(calendar.id)}
                      type="checkbox"
                    />
                    <i style={{ backgroundColor: calendar.backgroundColor }} />
                    <span>
                      <strong>{calendar.name}</strong>
                      <small>{calendar.primary ? "Hauptkalender" : "Eigener Kalender"}</small>
                    </span>
                  </label>
                ))}
              </div>
              {otherCalendars.length ? (
                <details open>
                  <summary>Weitere Kalender</summary>
                  <div className="calendar-source-list">
                    {otherCalendars.map((calendar) => (
                      <label key={calendar.id}>
                        <input
                          checked={selectedCalendarIds.includes(calendar.id)}
                          onChange={() => toggleCalendar(calendar.id)}
                          type="checkbox"
                        />
                        <i style={{ backgroundColor: calendar.backgroundColor }} />
                        <span>
                          <strong>{calendar.name}</strong>
                          <small>{calendar.accessRole === "writer" ? "Mitbearbeiten" : "Geteilt"}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              ) : null}
              <button className="calendar-add-source" onClick={() => setCreateOpen(true)} type="button">
                <span>+</span>
                Neuen Google-Kalender anlegen
              </button>
            </section>
            <section className="calendar-connection-card">
              <span className="eyebrow">Verbindung</span>
              <strong>
                {managementReady
                  ? `${selectedCalendarIds.length} von ${calendars.length} sichtbar`
                  : calendarLive
                    ? "Termine verbunden"
                    : "Google verbinden"}
              </strong>
              <p>Auswahl und Ansicht bleiben auf diesem Gerät. Unklare Änderungen entscheidest du.</p>
              {calendarError ? <small role="alert">{calendarError}</small> : null}
              <div>
                {connectUrl || (!managementReady && workspaceStatus?.capabilities.calendar.connectUrl) ? (
                  <a
                    className="button button-soft"
                    href={connectUrl || workspaceStatus?.capabilities.calendar.connectUrl}
                  >
                    Kalenderzugriff ergänzen
                  </a>
                ) : null}
                <button disabled={loading} onClick={() => void loadCalendarCatalog()} type="button">
                  {loading ? "Wird geladen …" : "Aktualisieren"}
                </button>
              </div>
            </section>
          </aside>

          <div className="calendar-canvas" aria-busy={loading}>
            {mode === "month" ? (
              <MonthCalendar
                anchorDate={anchorDate}
                calendars={calendars}
                events={events}
                now={now}
                onSelectDay={selectDay}
              />
            ) : null}
            {mode === "week" ? (
              <WeekCalendar
                anchorDate={anchorDate}
                calendars={calendars}
                events={events}
                now={now}
                onSelectDay={selectDay}
              />
            ) : null}
            {mode === "day" ? (
              <DayCalendar
                calendars={calendars}
                day={anchorDate}
                events={events}
                now={now}
              />
            ) : null}
            {mode === "agenda" ? (
              <AgendaCalendar
                anchorDate={anchorDate}
                calendars={calendars}
                events={events}
                planningReport={planningReport}
              />
            ) : null}
            {loading ? <div className="calendar-loading">Kalender werden abgeglichen …</div> : null}
          </div>
        </div>
      </section>

      <footer className="calendar-privacy-footer">
        <div>
          <span aria-hidden="true">P</span>
          <p>
            <strong>Privat</strong>
            Termintitel werden nur für deine Ansicht geladen. Zahlungsbeträge bleiben
            im Kompass und werden nicht an Google übertragen.
          </p>
        </div>
        <a href={integrations.calendarEmbedUrl} rel="noreferrer" target="_blank">
          In Google Kalender öffnen
        </a>
      </footer>

      {createOpen ? (
        <NewCalendarDialog
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreatedCalendar}
        />
      ) : null}
    </div>
  );
}
