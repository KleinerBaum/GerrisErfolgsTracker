from __future__ import annotations

from gerris_erfolgs_tracker.constants import SS_TODOS
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import Category, EmailReminderOffset, RecurrencePattern, TodoItem
from gerris_erfolgs_tracker.state import get_todos, init_state


def test_todo_item_defaults() -> None:
    todo = TodoItem(title="Test", quadrant=EisenhowerQuadrant.URGENT_IMPORTANT)

    assert todo.category is Category.DAILY_STRUCTURE
    assert todo.priority == 3
    assert todo.description_md == ""
    assert todo.progress_current == 0
    assert todo.progress_target is None
    assert todo.progress_unit == ""
    assert todo.auto_done_when_target_reached is True
    assert todo.completion_criteria_md == ""
    assert todo.processed_progress_events == []
    assert todo.recurrence is RecurrencePattern.ONCE
    assert todo.email_reminder is EmailReminderOffset.NONE


def test_legacy_todo_migration(session_state: dict[str, object]) -> None:
    session_state[SS_TODOS] = [
        {
            "title": "Alt",
            "quadrant": EisenhowerQuadrant.URGENT_IMPORTANT.value,
        }
    ]

    init_state()
    todos = get_todos()

    assert len(todos) == 1
    migrated = todos[0]
    assert migrated.category is Category.DAILY_STRUCTURE
    assert migrated.priority == 3
    assert migrated.description_md == ""
    stored_list = session_state[SS_TODOS]
    assert isinstance(stored_list, list)
    stored = stored_list[0]
    assert isinstance(stored, dict)
    assert stored["category"] == Category.DAILY_STRUCTURE
    assert stored["priority"] == 3
    assert stored["description_md"] == ""
    assert stored["progress_current"] == 0
    assert stored["progress_target"] is None
    assert stored["progress_unit"] == ""
    assert stored["auto_done_when_target_reached"] is False
    assert stored["completion_criteria_md"] == ""
    assert stored["processed_progress_events"] == []
    assert stored["recurrence"] == RecurrencePattern.ONCE
    assert stored["email_reminder"] == EmailReminderOffset.NONE
