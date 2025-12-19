from __future__ import annotations

from datetime import datetime, timezone

from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.models import TodoItem


def build_completion_event(todo: TodoItem) -> CoachEvent:
    timestamp = (todo.completed_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    completion_token = f"{todo.id}:{timestamp.isoformat()}"
    event_id = f"coach:task_completed:{completion_token}"
    return CoachEvent(
        trigger=CoachTrigger.TASK_COMPLETED,
        event_id=event_id,
        created_at_iso=timestamp.isoformat(),
        context={
            "task_id": todo.id,
            "task_title": todo.title,
            "category": todo.category.value,
            "quadrant": todo.quadrant.value,
            "completion_token": completion_token,
        },
    )


__all__ = ["build_completion_event"]
