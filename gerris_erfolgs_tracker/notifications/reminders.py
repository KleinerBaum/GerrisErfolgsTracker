from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from gerris_erfolgs_tracker.models import EmailReminderOffset, TodoItem


def calculate_reminder_at(due_date: Optional[datetime], offset: EmailReminderOffset) -> Optional[datetime]:
    """Return the reminder timestamp based on due date and offset.

    Reminders are only scheduled if a due date is present and the offset is not ``NONE``.
    All timestamps are normalized to UTC to keep comparisons stable.
    """

    if due_date is None or offset is EmailReminderOffset.NONE:
        return None

    normalized_due = due_date if due_date.tzinfo else due_date.replace(tzinfo=timezone.utc)

    delta = {
        EmailReminderOffset.ONE_HOUR: timedelta(hours=1),
        EmailReminderOffset.ONE_DAY: timedelta(days=1),
    }.get(offset, timedelta(0))

    reminder_at = normalized_due - delta
    return reminder_at if reminder_at.tzinfo else reminder_at.replace(tzinfo=timezone.utc)


def is_reminder_due(todo: TodoItem, *, now: datetime, lookahead: timedelta) -> bool:
    """Return True if a reminder should be sent within the configured window."""

    if todo.completed:
        return False

    if todo.email_reminder is EmailReminderOffset.NONE:
        return False

    if todo.reminder_sent_at is not None:
        return False

    reminder_at = todo.reminder_at or calculate_reminder_at(todo.due_date, todo.email_reminder)
    if reminder_at is None:
        return False

    normalized_now = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
    normalized_reminder = reminder_at if reminder_at.tzinfo else reminder_at.replace(tzinfo=timezone.utc)
    window_end = normalized_now + lookahead

    if normalized_reminder <= normalized_now:
        return True

    return normalized_now <= normalized_reminder <= window_end
