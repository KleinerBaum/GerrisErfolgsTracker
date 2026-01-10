from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from gerris_erfolgs_tracker.integrations.google.auth import (
    BASE_SCOPES,
    GOOGLE_SCOPE_CALENDAR_READONLY,
)
from gerris_erfolgs_tracker.integrations.google.client import build_google_api_client
from gerris_erfolgs_tracker.integrations.google.models import CalendarEvent, parse_google_datetime

CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3"

REQUIRED_SCOPES: tuple[str, ...] = (*BASE_SCOPES, GOOGLE_SCOPE_CALENDAR_READONLY)


def list_upcoming_events(
    access_token: str,
    *,
    calendar_id: str = "primary",
    max_results: int = 10,
    time_min: datetime | None = None,
) -> list[CalendarEvent]:
    client = build_google_api_client(access_token)
    query_time = time_min or datetime.now(timezone.utc)
    params = {
        "maxResults": max_results,
        "orderBy": "startTime",
        "singleEvents": "true",
        "timeMin": query_time.isoformat(),
    }
    url = f"{CALENDAR_API_BASE_URL}/calendars/{calendar_id}/events"
    payload = client.get(url, params=params)
    items = payload.get("items", [])
    if not isinstance(items, list):
        return []
    return [_to_calendar_event(item) for item in items if isinstance(item, dict)]


def _to_calendar_event(item: dict[str, Any]) -> CalendarEvent:
    start_data = item.get("start") if isinstance(item.get("start"), dict) else {}
    end_data = item.get("end") if isinstance(item.get("end"), dict) else {}
    organizer = item.get("organizer") if isinstance(item.get("organizer"), dict) else {}
    return CalendarEvent(
        event_id=str(item.get("id") or ""),
        summary=str(item.get("summary")) if item.get("summary") is not None else None,
        start=parse_google_datetime(_extract_datetime(start_data)),
        end=parse_google_datetime(_extract_datetime(end_data)),
        location=str(item.get("location")) if item.get("location") is not None else None,
        html_link=str(item.get("htmlLink")) if item.get("htmlLink") is not None else None,
        organizer_email=str(organizer.get("email")) if organizer.get("email") is not None else None,
    )


def _extract_datetime(data: dict[str, Any]) -> str | None:
    value = data.get("dateTime") or data.get("date")
    if isinstance(value, str):
        return value
    return None
