from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def parse_rfc3339(value: str | None) -> datetime | None:
    if not value:
        return None
    sanitized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(sanitized)
    except ValueError:
        return None


class CalendarEvent(BaseModel):
    event_id: str = Field(..., description="Google Calendar event ID")
    summary: str | None = None
    start: datetime | None = None
    end: datetime | None = None
    location: str | None = None
    html_link: str | None = None
    organizer_email: str | None = None


class GmailSummary(BaseModel):
    message_id: str
    thread_id: str | None = None
    snippet: str | None = None
    subject: str | None = None
    sender: str | None = None
    received_at: datetime | None = None


class TaskItem(BaseModel):
    task_id: str
    title: str
    status: str | None = None
    due: datetime | None = None
    updated: datetime | None = None


class TaskList(BaseModel):
    list_id: str
    title: str
    updated: datetime | None = None


class DriveFile(BaseModel):
    file_id: str
    name: str
    mime_type: str | None = None
    modified_time: datetime | None = None
    web_view_link: str | None = None
    icon_link: str | None = None


class SheetMetadata(BaseModel):
    spreadsheet_id: str
    name: str
    web_view_link: str | None = None
    modified_time: datetime | None = None


def parse_google_datetime(value: str | None) -> datetime | None:
    return parse_rfc3339(value)


def parse_epoch_millis(value: str | int | None) -> datetime | None:
    if value is None:
        return None
    try:
        millis = int(value)
    except (TypeError, ValueError):
        return None
    return datetime.fromtimestamp(millis / 1000.0, tz=timezone.utc)


def get_header_value(headers: list[dict[str, Any]], name: str) -> str | None:
    for header in headers:
        if header.get("name", "").lower() == name.lower():
            value = header.get("value")
            if isinstance(value, str):
                return value
    return None
