from __future__ import annotations

from datetime import datetime, timezone

import pytest

from gerris_erfolgs_tracker.eisenhower import (
    EisenhowerQuadrant,
    ensure_quadrant,
    group_by_quadrant,
    sort_todos,
)
from gerris_erfolgs_tracker.models import TodoItem


def _todo(
    title: str,
    quadrant: EisenhowerQuadrant,
    *,
    due: datetime | None = None,
    created: datetime | None = None,
) -> TodoItem:
    return TodoItem(
        title=title,
        quadrant=quadrant,
        completed=False,
        due_date=due,
        created_at=created or datetime(2024, 1, 1, tzinfo=timezone.utc),
    )


def test_grouping_and_sorting() -> None:
    todos = [
        _todo("B", EisenhowerQuadrant.URGENT_IMPORTANT, due=datetime(2024, 1, 5, tzinfo=timezone.utc)),
        _todo("C", EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT),
        _todo("A", EisenhowerQuadrant.NOT_URGENT_IMPORTANT, due=datetime(2024, 1, 3, tzinfo=timezone.utc)),
    ]

    grouped = group_by_quadrant(todos)
    assert set(grouped) == set(EisenhowerQuadrant)
    assert grouped[EisenhowerQuadrant.URGENT_IMPORTANT][0].title == "B"

    sorted_by_due = sort_todos(todos, by="due_date")
    assert [todo.title for todo in sorted_by_due] == ["A", "B", "C"]

    sorted_by_title = sort_todos(todos, by="title")
    assert [todo.title for todo in sorted_by_title] == ["A", "B", "C"]

    sorted_by_created = sort_todos(todos, by="created_at")
    assert [todo.title for todo in sorted_by_created] == ["B", "C", "A"]


def test_quadrant_parsing_and_invalid_input() -> None:
    assert ensure_quadrant("urgent_important") is EisenhowerQuadrant.URGENT_IMPORTANT

    with pytest.raises(ValueError):
        ensure_quadrant("unknown")


def test_sorting_handles_naive_and_aware_datetimes() -> None:
    todos = [
        _todo(
            "Naive due",
            EisenhowerQuadrant.URGENT_NOT_IMPORTANT,
            due=datetime(2024, 1, 2),
            created=datetime(2024, 1, 2),
        ),
        _todo(
            "Aware due",
            EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
            due=datetime(2024, 1, 1, tzinfo=timezone.utc),
            created=datetime(2024, 1, 1, tzinfo=timezone.utc),
        ),
    ]

    sorted_by_due = sort_todos(todos, by="due_date")
    assert [todo.title for todo in sorted_by_due] == ["Aware due", "Naive due"]

    sorted_by_created = sort_todos(todos, by="created_at")
    assert [todo.title for todo in sorted_by_created] == ["Aware due", "Naive due"]

    assert all(todo.due_date and todo.due_date.tzinfo is not None for todo in sorted_by_due)
