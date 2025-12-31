from __future__ import annotations

from datetime import datetime, timezone

from gerris_erfolgs_tracker.constants import SS_TODOS
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.state import get_todos


def test_get_todos_normalizes_legacy_timestamps(session_state: dict[str, object]) -> None:
    session_state[SS_TODOS] = [
        {
            "title": "Legacy task",
            "quadrant": EisenhowerQuadrant.URGENT_IMPORTANT.value,
            "created_at": "2024-02-01T08:15:00",
            "due_date": "2024-02-03",
            "completed_at": "not-a-date",
            "reminder_at": datetime(2024, 2, 2, 12, 30),
            "reminder_sent_at": "2024-02-02T12:00:00",
            "email_reminder": "one_day",
        }
    ]

    todos = get_todos()

    assert len(todos) == 1
    todo = todos[0]

    assert todo.created_at.tzinfo is timezone.utc
    assert todo.due_date is not None and todo.due_date.tzinfo is timezone.utc
    assert todo.completed_at is None
    assert todo.reminder_at is not None and todo.reminder_at.tzinfo is timezone.utc
    assert todo.reminder_sent_at is not None and todo.reminder_sent_at.tzinfo is timezone.utc
