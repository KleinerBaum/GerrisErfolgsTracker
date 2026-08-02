"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  CalendarClientError,
  listGoogleCalendars,
} from "../lib/google-calendar-client";
import { APP_TIME_ZONE } from "../lib/format";
import type { CalendarEvent, GoogleCalendar } from "../lib/types";

const EVENT_DURATION_OPTIONS = [
  15,
  30,
  45,
  60,
  90,
  120,
  180,
  240,
  360,
  480,
  720,
  1_440,
  2_160,
  2_880,
  4_320,
  5_760,
  7_200,
  10_080,
  14_400,
  20_160,
] as const;

const EVENT_KIND_OPTIONS: Array<{
  value: CalendarEvent["kind"];
  label: string;
}> = [
  { value: "appointment", label: "Persönlicher Termin" },
  { value: "birthday", label: "Geburtstagserinnerung" },
  { value: "focus", label: "Fokuszeit / Zeitblock" },
  { value: "payment", label: "Zahlung / Frist" },
  { value: "job_interview", label: "Bewerbungsgespräch" },
  { value: "employment_agency", label: "Arbeitsagentur / Jobcenter" },
  { value: "networking", label: "Netzwerk / Karrierekontakt" },
  { value: "learning", label: "Weiterbildung / Lernen" },
  { value: "family", label: "Familie / Kinder" },
  { value: "school_childcare", label: "Schule / Kita" },
  { value: "health", label: "Gesundheit / Vorsorge" },
  { value: "public_office", label: "Behörde / Finanzen" },
];

function todayInput(): string {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysToInput(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function nextBirthdayOccurrence(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const today = todayInput();
  const currentYear = Number(today.slice(0, 4));

  for (let year = currentYear; year <= currentYear + 8; year += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
      candidate.getUTCFullYear() !== year ||
      candidate.getUTCMonth() !== month - 1 ||
      candidate.getUTCDate() !== day
    ) {
      continue;
    }
    const date = candidate.toISOString().slice(0, 10);
    if (date >= today) return date;
  }
  return null;
}

function birthdayDateLabel(value: string): string {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function eventDurationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} Minuten`;
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "Tag" : "Tage"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "Stunde" : "Stunden"}`);
  if (remainingMinutes) parts.push(`${remainingMinutes} Minuten`);
  return parts.join(" ");
}

function eventEndLabel(date: string, time: string, duration: number): string {
  const start = new Date(`${date}T${time}:00`);
  if (Number.isNaN(start.getTime())) return "Ende wird automatisch berechnet";
  const end = new Date(start.getTime() + duration * 60_000);
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(end);
}

export function CalendarEventForm({
  onClose,
  onSave,
  toast,
}: {
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
  toast: (message: string) => void;
}) {
  const [kind, setKind] = useState<CalendarEvent["kind"]>("appointment");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayInput());
  const [time, setTime] = useState("09:00");
  const [durationIndex, setDurationIndex] = useState(3);
  const [allDay, setAllDay] = useState(false);
  const [isPrivate, setIsPrivate] = useState(true);
  const [shareByEmail, setShareByEmail] = useState(false);
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [reminder, setReminder] = useState(30);
  const [birthdayName, setBirthdayName] = useState("");
  const [birthdayDate, setBirthdayDate] = useState("");
  const [birthdayRelation, setBirthdayRelation] = useState("");
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [calendarId, setCalendarId] = useState("primary");
  const [calendarSelectionLoading, setCalendarSelectionLoading] = useState(true);
  const [calendarSelectionConnectUrl, setCalendarSelectionConnectUrl] =
    useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectUrl, setConnectUrl] = useState("");
  const isBirthday = kind === "birthday";
  const duration = EVENT_DURATION_OPTIONS[durationIndex] || 60;
  const durationSummary = allDay
    ? "Ganzer Tag"
    : `${eventDurationLabel(duration)} · Ende ${eventEndLabel(date, time, duration)}`;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const loaded = (await listGoogleCalendars()).filter(
          (calendar) => calendar.accessRole === "owner",
        );
        if (!active) return;
        setCalendars(loaded);
        const preferred = loaded.find((calendar) => calendar.primary) || loaded[0];
        if (preferred) setCalendarId(preferred.id);
      } catch (caught) {
        if (active && caught instanceof CalendarClientError) {
          setCalendarSelectionConnectUrl(caught.connectUrl);
        }
      } finally {
        if (active) setCalendarSelectionLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const changeKind = (nextKind: CalendarEvent["kind"]) => {
    setKind(nextKind);
    setError("");
    if (nextKind === "birthday") {
      setReminder(10_080);
      setShareByEmail(false);
      const birthdayCalendar = calendars.find((calendar) =>
        /geburtstag|birthday/i.test(calendar.name),
      );
      if (birthdayCalendar) setCalendarId(birthdayCalendar.id);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const birthdayOccurrence = isBirthday
      ? nextBirthdayOccurrence(birthdayDate)
      : null;
    if (isBirthday && (!birthdayName.trim() || !birthdayOccurrence)) {
      setError("Bitte gib den Namen und ein gültiges Geburtsdatum an.");
      return;
    }
    if (
      !isBirthday &&
      (!title.trim() || !date || (!allDay && !time) ||
        (shareByEmail && !attendeeEmail.trim()))
    ) {
      return;
    }

    const eventDate = isBirthday ? birthdayOccurrence || date : date;
    const eventAllDay = isBirthday || allDay;
    const allDayEndDate = addDaysToInput(eventDate, 1);
    const start = new Date(`${eventDate}T${eventAllDay ? "00:00" : time}:00`);
    const end = eventAllDay
      ? new Date(`${allDayEndDate}T00:00:00`)
      : new Date(start.getTime() + duration * 60_000);
    const birthdayNote = isBirthday
      ? [
          `Geburtsdatum: ${birthdayDateLabel(birthdayDate)}`,
          birthdayRelation ? `Beziehung: ${birthdayRelation}` : "",
          note.trim(),
          "Jährliche, nicht blockierende Geburtstagserinnerung aus Gerris Kompass.",
        ]
          .filter(Boolean)
          .join("\n")
      : note.trim();
    const calendarEvent = {
      title: isBirthday ? `Geburtstag: ${birthdayName.trim()}` : title.trim(),
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      kind,
      private: isBirthday ? true : isPrivate,
      allDay: eventAllDay,
      startDate: eventAllDay ? eventDate : undefined,
      endDate: eventAllDay ? allDayEndDate : undefined,
      attendeeEmail:
        !isBirthday && shareByEmail ? attendeeEmail.trim() : undefined,
      availability: isBirthday ? "free" : "busy",
      recurrence: isBirthday ? "yearly" : "none",
      timeZone: APP_TIME_ZONE,
      calendarId,
      location: isBirthday ? "" : location.trim(),
      note: birthdayNote,
      reminderMinutes: reminder,
    };

    setBusy(true);
    setError("");
    setConnectUrl("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(calendarEvent),
      });
      const payload = (await response.json()) as {
        event?: CalendarEvent;
        error?: string;
        connectUrl?: string;
      };
      if (!response.ok || !payload.event) {
        setConnectUrl(payload.connectUrl || "");
        throw new Error(
          payload.error || "Der Termin konnte nicht gespeichert werden.",
        );
      }
      onSave(payload.event);
      toast(
        isBirthday
          ? "Geburtstag jährlich und ohne Zeitblock gespeichert"
          : shareByEmail
            ? "Termin gespeichert und Einladung per E-Mail versendet"
            : "Termin direkt in Google Kalender gespeichert",
      );
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Der Termin konnte nicht gespeichert werden.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="capture-form action-form event-entry-form" onSubmit={submit}>
      <label className="event-kind-field">
        Art des Termins
        <select
          autoFocus
          onChange={(event) =>
            changeKind(event.target.value as CalendarEvent["kind"])
          }
          value={kind}
        >
          {EVENT_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {isBirthday ? (
        <>
          <section className="birthday-entry-intro" aria-label="Geburtstagserinnerung">
            <span aria-hidden="true">G</span>
            <div>
              <strong>Jährlich erinnern</strong>
              <p>Ganztägig sichtbar, ohne deine Zeit zu blockieren.</p>
            </div>
          </section>
          <div className="form-grid">
            <label>
              Name der Person
              <input
                autoComplete="off"
                onChange={(event) => setBirthdayName(event.target.value)}
                placeholder="z. B. Anna"
                required
                value={birthdayName}
              />
            </label>
            <label>
              Geburtsdatum
              <input
                max="9999-12-31"
                onChange={(event) => setBirthdayDate(event.target.value)}
                required
                type="date"
                value={birthdayDate}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Zielkalender
              <CalendarSelect
                calendarId={calendarId}
                calendars={calendars}
                loading={calendarSelectionLoading}
                onChange={setCalendarId}
              />
            </label>
            <label>
              Erinnerung
              <select
                onChange={(event) => setReminder(Number(event.target.value))}
                value={reminder}
              >
                <option value="0">Keine</option>
                <option value="1440">1 Tag vorher</option>
                <option value="2880">2 Tage vorher</option>
                <option value="10080">1 Woche vorher</option>
                <option value="20160">2 Wochen vorher</option>
              </select>
            </label>
          </div>
          <label>
            Beziehung oder Kontext
            <select
              onChange={(event) => setBirthdayRelation(event.target.value)}
              value={birthdayRelation}
            >
              <option value="">Nicht angeben</option>
              <option>Familie</option>
              <option>Freundeskreis</option>
              <option>Arbeit und Netzwerk</option>
              <option>Schule und Betreuung</option>
              <option>Sonstiger Kontakt</option>
            </select>
          </label>
          <label>
            Persönliche Notiz
            <textarea
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional, z. B. Geschenkidee oder Kontaktwunsch"
              rows={3}
              value={note}
            />
          </label>
          <p className="form-trust birthday-trust">
            Privat, jährlich und als „Verfügbar“. Keine Einladung, kein Zeitblock.
          </p>
        </>
      ) : (
        <>
          <label>
            Titel
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="z. B. Gespräch mit Frau Müller"
              required
              value={title}
            />
          </label>
          <div className="event-switch-grid">
            <label className="event-switch">
              <input
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
                role="switch"
                type="checkbox"
              />
              <span className="event-switch-copy">
                <strong>Ganztägig</strong>
                <small>Reserviert den gesamten ausgewählten Tag.</small>
              </span>
              <span aria-hidden="true" className="event-switch-track"><span /></span>
            </label>
            <label className="event-switch">
              <input
                checked={isPrivate}
                onChange={(event) => setIsPrivate(event.target.checked)}
                role="switch"
                type="checkbox"
              />
              <span className="event-switch-copy">
                <strong>Privater Termin</strong>
                <small>Verbirgt Details bei eingeschränkter Kalenderfreigabe.</small>
              </span>
              <span aria-hidden="true" className="event-switch-track"><span /></span>
            </label>
          </div>
          <div className="form-grid three">
            <label>
              Datum
              <input
                onChange={(event) => setDate(event.target.value)}
                required
                type="date"
                value={date}
              />
            </label>
            <label>
              Beginn
              <input
                disabled={allDay}
                onChange={(event) => setTime(event.target.value)}
                required={!allDay}
                type="time"
                value={time}
              />
            </label>
            <label>
              Erinnerung
              <select
                onChange={(event) => setReminder(Number(event.target.value))}
                value={reminder}
              >
                <option value="0">Keine</option>
                <option value="10">10 Minuten vorher</option>
                <option value="30">30 Minuten vorher</option>
                <option value="60">1 Stunde vorher</option>
                <option value="1440">1 Tag vorher</option>
                <option value="10080">1 Woche vorher</option>
              </select>
            </label>
          </div>
          <label className={`event-duration-field${allDay ? " is-disabled" : ""}`}>
            <span className="event-field-heading">
              <span>Dauer</span>
              <output htmlFor="event-duration">{durationSummary}</output>
            </span>
            <input
              aria-label="Termindauer einstellen"
              disabled={allDay}
              id="event-duration"
              max={EVENT_DURATION_OPTIONS.length - 1}
              min="0"
              onChange={(event) => setDurationIndex(Number(event.target.value))}
              step="1"
              type="range"
              value={durationIndex}
            />
            <span aria-hidden="true" className="event-duration-scale">
              <span>15 Min.</span><span>1 Tag</span><span>14 Tage</span>
            </span>
          </label>
          <label>
            Zielkalender
            <CalendarSelect
              calendarId={calendarId}
              calendars={calendars}
              loading={calendarSelectionLoading}
              onChange={setCalendarId}
            />
          </label>
          <label>
            Ort oder Videolink
            <input
              onChange={(event) => setLocation(event.target.value)}
              placeholder="Optional"
              value={location}
            />
          </label>
          <label>
            Notizen und Vorbereitung
            <textarea
              onChange={(event) => setNote(event.target.value)}
              placeholder="Agenda, Unterlagen, Gesprächsziel …"
              rows={3}
              value={note}
            />
          </label>
          <label className="event-share-switch event-switch">
            <input
              checked={shareByEmail}
              onChange={(event) => setShareByEmail(event.target.checked)}
              role="switch"
              type="checkbox"
            />
            <span className="event-switch-copy">
              <strong>Per E-Mail teilen</strong>
              <small>Google Kalender sendet der Person direkt eine Einladung.</small>
            </span>
            <span aria-hidden="true" className="event-switch-track"><span /></span>
          </label>
          {shareByEmail ? (
            <label>
              E-Mail-Adresse der eingeladenen Person
              <input
                autoComplete="email"
                onChange={(event) => setAttendeeEmail(event.target.value)}
                placeholder="name@beispiel.de"
                required
                type="email"
                value={attendeeEmail}
              />
            </label>
          ) : null}
          <p className="form-trust">
            Wird sofort im Zielkalender gespeichert.
            {isPrivate
              ? " Die Details bleiben bei eingeschränkter Kalenderfreigabe verborgen."
              : " Die Sichtbarkeit folgt den Freigaben des Zielkalenders."}
            {shareByEmail
              ? " Google sendet eine Einladung."
              : " Keine E-Mail."}
          </p>
        </>
      )}

      {calendarSelectionConnectUrl ? (
        <p className="form-progress">
          Für die Kalenderauswahl fehlt noch eine Google-Freigabe. Bis dahin gilt der Hauptkalender.
        </p>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button className="button button-ghost" onClick={onClose} type="button">
          Abbrechen
        </button>
        {connectUrl ? (
          <a className="button button-soft" href={connectUrl}>Google Kalender verbinden</a>
        ) : null}
        {!connectUrl && calendarSelectionConnectUrl ? (
          <a className="button button-soft" href={calendarSelectionConnectUrl}>
            Kalenderauswahl freischalten
          </a>
        ) : null}
        <button className="button button-primary" disabled={busy} type="submit">
          {busy
            ? "Wird in Google gespeichert …"
            : isBirthday
              ? "Geburtstag speichern"
              : "Termin speichern"}
        </button>
      </div>
    </form>
  );
}

function CalendarSelect({
  calendarId,
  calendars,
  loading,
  onChange,
}: {
  calendarId: string;
  calendars: GoogleCalendar[];
  loading: boolean;
  onChange: (calendarId: string) => void;
}) {
  return (
    <select
      disabled={loading}
      onChange={(event) => onChange(event.target.value)}
      value={calendarId}
    >
      {!calendars.length ? <option value="primary">Hauptkalender</option> : null}
      {calendars.map((calendar) => (
        <option key={calendar.id} value={calendar.id}>{calendar.name}</option>
      ))}
    </select>
  );
}
