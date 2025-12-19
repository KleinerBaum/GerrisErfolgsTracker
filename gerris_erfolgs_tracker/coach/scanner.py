from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable

from gerris_erfolgs_tracker.coach.engine import process_event
from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.models import TodoItem


def _event_timestamp() -> datetime:
    return datetime.now(timezone.utc)
def _build_overdue_event(todo: TodoItem, today: str) -> CoachEvent:
    event_id = f"coach:overdue:{todo.id}:{today}"
    created_at_iso = _event_timestamp().isoformat()
    return CoachEvent(
        trigger=CoachTrigger.OVERDUE,
        event_id=event_id,
        created_at_iso=created_at_iso,
        context={
            "task_id": todo.id,
            "task_title": todo.title,
            "category": todo.category.value,
            "quadrant": todo.quadrant.value,
            "due_date": todo.due_date.isoformat() if todo.due_date else None,
        },
    )


def _build_due_soon_event(todo: TodoItem, today: str) -> CoachEvent:
    event_id = f"coach:due_soon:{todo.id}:{today}"
    created_at_iso = _event_timestamp().isoformat()
    return CoachEvent(
        trigger=CoachTrigger.DUE_SOON,
        event_id=event_id,
        created_at_iso=created_at_iso,
        context={
            "task_id": todo.id,
            "task_title": todo.title,
            "category": todo.category.value,
            "quadrant": todo.quadrant.value,
            "due_date": todo.due_date.isoformat() if todo.due_date else None,
        },
    )


def _build_weekly_event(now: datetime) -> CoachEvent:
    iso_year, iso_week, _ = now.isocalendar()
    event_id = f"coach:weekly:{iso_year}-W{iso_week:02d}"
    return CoachEvent(
        trigger=CoachTrigger.WEEKLY,
        event_id=event_id,
        created_at_iso=now.isoformat(),
        context={},
    )


def run_daily_coach_scan(todos: Iterable[TodoItem]) -> None:
    now = _event_timestamp()
    today = now.date().isoformat()
    pending = [todo for todo in todos if not todo.completed]

    overdue_candidates = [todo for todo in pending if todo.due_date and todo.due_date < now]
    overdue_sorted = sorted(overdue_candidates, key=lambda todo: todo.due_date or now)[:3]
    for todo in overdue_sorted:
        process_event(_build_overdue_event(todo, today))

    soon_threshold = now + timedelta(hours=48)
    due_soon_candidates = [
        todo
        for todo in pending
        if todo.due_date and now <= todo.due_date <= soon_threshold
    ]
    due_soon_sorted = sorted(due_soon_candidates, key=lambda todo: todo.due_date or now)[:3]
    for todo in due_soon_sorted:
        process_event(_build_due_soon_event(todo, today))


def schedule_weekly_review() -> None:
    now = _event_timestamp()
    event = _build_weekly_event(now)
    process_event(event)


__all__ = ["run_daily_coach_scan", "schedule_weekly_review"]
