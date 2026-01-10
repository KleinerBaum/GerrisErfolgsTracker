from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable
from zoneinfo import ZoneInfo

import httpx

from gerris_erfolgs_tracker.integrations.google.models import CalendarEvent


@dataclass(frozen=True)
class _RawIcalEvent:
    properties: dict[str, str]
    parameters: dict[str, dict[str, str]]


def list_upcoming_ical_events(
    ical_url: str,
    *,
    max_results: int = 20,
    time_min: datetime | None = None,
) -> list[CalendarEvent]:
    events = _fetch_ical_events(ical_url)
    query_time = time_min or datetime.now(timezone.utc)
    upcoming: list[CalendarEvent] = []
    for event in events:
        calendar_event = _to_calendar_event(event)
        if calendar_event.start is None:
            continue
        start_time = calendar_event.start
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if start_time < query_time:
            continue
        upcoming.append(calendar_event)
    upcoming.sort(key=lambda item: item.start or datetime.max.replace(tzinfo=timezone.utc))
    return upcoming[:max_results]


def _fetch_ical_events(ical_url: str) -> list[_RawIcalEvent]:
    response = httpx.get(ical_url, timeout=10.0)
    response.raise_for_status()
    content = response.text
    events: list[_RawIcalEvent] = []
    current: dict[str, str] | None = None
    parameters: dict[str, dict[str, str]] = {}
    for line in _unfold_lines(content.splitlines()):
        if line == "BEGIN:VEVENT":
            current = {}
            parameters = {}
            continue
        if line == "END:VEVENT":
            if current is not None:
                events.append(_RawIcalEvent(properties=current, parameters=parameters))
            current = None
            parameters = {}
            continue
        if current is None:
            continue
        name, value, params = _parse_line(line)
        if not name:
            continue
        current[name] = value
        if params:
            parameters[name] = params
    return events


def _unfold_lines(lines: Iterable[str]) -> list[str]:
    unfolded: list[str] = []
    buffer: list[str] = []
    for line in lines:
        if line.startswith(" ") or line.startswith("\t"):
            if buffer:
                buffer.append(line.lstrip())
            else:
                buffer = [line.lstrip()]
            continue
        if buffer:
            unfolded.append("".join(buffer))
            buffer = []
        buffer.append(line)
    if buffer:
        unfolded.append("".join(buffer))
    return unfolded


def _parse_line(line: str) -> tuple[str, str, dict[str, str]]:
    if ":" not in line:
        return "", "", {}
    name_part, value = line.split(":", 1)
    if ";" not in name_part:
        return name_part.upper(), value.strip(), {}
    name, params_part = name_part.split(";", 1)
    params: dict[str, str] = {}
    for param in params_part.split(";"):
        if "=" not in param:
            continue
        key, param_value = param.split("=", 1)
        params[key.upper()] = param_value
    return name.upper(), value.strip(), params


def _to_calendar_event(event: _RawIcalEvent) -> CalendarEvent:
    start_value = event.properties.get("DTSTART")
    end_value = event.properties.get("DTEND")
    start_params = event.parameters.get("DTSTART", {})
    end_params = event.parameters.get("DTEND", {})
    start = _parse_ical_datetime(start_value, start_params.get("TZID"))
    end = _parse_ical_datetime(end_value, end_params.get("TZID"))
    return CalendarEvent(
        event_id=event.properties.get("UID", ""),
        summary=event.properties.get("SUMMARY"),
        start=start,
        end=end,
        location=event.properties.get("LOCATION"),
        html_link=event.properties.get("URL"),
        organizer_email=None,
    )


def _parse_ical_datetime(value: str | None, tzid: str | None) -> datetime | None:
    if not value:
        return None
    if value.endswith("Z"):
        parsed = _parse_datetime_value(value[:-1])
        if parsed is None:
            return None
        return parsed.replace(tzinfo=timezone.utc)
    tzinfo = _resolve_tzinfo(tzid)
    parsed = _parse_datetime_value(value)
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=tzinfo)
    return parsed.astimezone(tzinfo)


def _parse_datetime_value(value: str) -> datetime | None:
    if len(value) == 8 and value.isdigit():
        try:
            return datetime.strptime(value, "%Y%m%d")
        except ValueError:
            return None
    if "T" in value:
        for fmt in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def _resolve_tzinfo(tzid: str | None) -> ZoneInfo | timezone:
    if not tzid:
        return timezone.utc
    try:
        return ZoneInfo(tzid)
    except Exception:
        return timezone.utc


__all__ = ["list_upcoming_ical_events"]
