from __future__ import annotations

from datetime import datetime, timedelta, timezone

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import Milestone, MilestoneStatus, RecurrencePattern
from gerris_erfolgs_tracker.state import get_todos, init_state
from gerris_erfolgs_tracker.todos import _process_completion, add_todo, toggle_complete


def test_recurring_completion_spawns_next_instance(session_state: dict[str, object]) -> None:
    init_state()
    base_due = datetime(2024, 1, 1, tzinfo=timezone.utc)
    milestone = Milestone(title="M1", status=MilestoneStatus.DONE)

    todo = add_todo(
        title="Recurring",
        quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        due_date=base_due,
        recurrence=RecurrencePattern.DAILY,
        milestones=[milestone],
    )

    completed = toggle_complete(todo.id)
    assert completed
    todos = get_todos()
    assert len(todos) == 2

    successor = next(item for item in todos if item.id != todo.id)
    assert successor.completed is False
    assert successor.completed_at is None
    assert successor.progress_current == 0
    assert successor.processed_progress_events == []
    assert successor.due_date == base_due + timedelta(days=1)
    assert successor.recurrence is RecurrencePattern.DAILY
    assert all(milestone.status is MilestoneStatus.BACKLOG for milestone in successor.milestones)


def test_recurring_completion_is_idempotent(session_state: dict[str, object]) -> None:
    init_state()
    base_due = datetime(2024, 1, 2, tzinfo=timezone.utc)
    todo = add_todo(
        title="Deterministic",
        quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        due_date=base_due,
        recurrence=RecurrencePattern.WEEKLY,
    )

    completed = toggle_complete(todo.id)
    assert completed
    _process_completion(completed, was_completed=False)

    todos = get_todos()
    assert len(todos) == 2


def test_once_todo_does_not_spawn_successor(session_state: dict[str, object]) -> None:
    init_state()
    todo = add_todo(
        title="Single",
        quadrant=EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT,
        due_date=datetime(2024, 2, 1, tzinfo=timezone.utc),
        recurrence=RecurrencePattern.ONCE,
    )

    completed = toggle_complete(todo.id)
    assert completed

    todos = get_todos()
    assert len(todos) == 1
