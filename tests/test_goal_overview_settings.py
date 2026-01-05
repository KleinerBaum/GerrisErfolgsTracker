from app import (
    _filter_goal_overview_todos_by_category,
    _sanitize_goal_overview_categories,
)
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import Category, TodoItem


def _sample_todos() -> list[TodoItem]:
    return [
        TodoItem(
            id="task-a",
            title="Task A",
            quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
            category=Category.ADMIN,
        ),
        TodoItem(
            id="task-b",
            title="Task B",
            quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
            category=Category.DAILY_STRUCTURE,
        ),
    ]


def test_sanitize_goal_overview_categories_filters_invalid_values() -> None:
    sanitized = _sanitize_goal_overview_categories([Category.ADMIN.value, "missing", 123])

    assert sanitized == [Category.ADMIN.value]


def test_filter_goal_overview_todos_by_category_respects_selection_with_fallback() -> None:
    todos = _sample_todos()

    filtered_specific = _filter_goal_overview_todos_by_category(todos, [Category.DAILY_STRUCTURE.value])
    filtered_all = _filter_goal_overview_todos_by_category(todos, [])

    assert filtered_specific == [todos[1]]
    assert filtered_all == todos
