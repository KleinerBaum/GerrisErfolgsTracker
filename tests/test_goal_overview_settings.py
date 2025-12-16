from app import _filter_goal_overview_todos, _sanitize_goal_overview_tasks
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


def test_sanitize_goal_overview_tasks_filters_invalid_values() -> None:
    todos = _sample_todos()

    sanitized = _sanitize_goal_overview_tasks(["task-a", "missing", 123], todos)

    assert sanitized == ["task-a"]


def test_filter_goal_overview_todos_respects_selection_with_fallback() -> None:
    todos = _sample_todos()

    filtered_specific = _filter_goal_overview_todos(todos, ["task-b"])
    filtered_all = _filter_goal_overview_todos(todos, [])

    assert filtered_specific == [todos[1]]
    assert filtered_all == todos
