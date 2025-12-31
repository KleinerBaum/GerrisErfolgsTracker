from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Any, Callable, Iterable, List, Sequence, cast

import streamlit as st

from gerris_erfolgs_tracker.coach.models import CoachState
from gerris_erfolgs_tracker.constants import (
    PROCESSED_PROGRESS_EVENTS_LIMIT,
    SS_COACH,
    SS_GAMIFICATION,
    SS_JOURNAL,
    SS_SETTINGS,
    SS_STATS,
    SS_TODOS,
    TODO_TEMPLATE_LAST_APPLIED_KEY,
    cap_list_tail,
)
from gerris_erfolgs_tracker.models import (
    Category,
    EmailReminderOffset,
    GamificationState,
    KpiStats,
    RecurrencePattern,
    TodoItem,
    TodoKanban,
)
from gerris_erfolgs_tracker.notifications.reminders import calculate_reminder_at
from gerris_erfolgs_tracker.state_persistence import (
    configure_storage,
    load_persisted_state,
    persist_state,
)

__all__ = [
    "init_state",
    "get_todos",
    "save_todos",
    "reset_state",
    "configure_storage",
    "load_persisted_state",
    "persist_state",
]


def _default_todos() -> List[TodoItem]:
    return []


def _default_stats() -> KpiStats:
    return KpiStats()


def _default_gamification() -> GamificationState:
    return GamificationState()


def _default_settings() -> dict[str, Any]:
    return {
        "category_goals": {category.value: 1 for category in Category},
        "goal_profile": {},
    }


def _default_journal() -> dict[str, Any]:
    return {}


def _default_coach() -> CoachState:
    return CoachState()


def _normalize_timestamp(value: Any, default: datetime | None = None) -> datetime | None:
    """Convert legacy timestamp inputs to timezone-aware UTC datetimes."""

    if value is None:
        return default

    try:
        candidate: datetime | date
        if isinstance(value, datetime):
            candidate = value
        elif isinstance(value, date):
            candidate = datetime.combine(value, time.min)
        elif isinstance(value, str):
            candidate = datetime.fromisoformat(value)
        else:
            return default

        if isinstance(candidate, date) and not isinstance(candidate, datetime):
            candidate = datetime.combine(candidate, time.min)

        if candidate.tzinfo is None:
            return candidate.replace(tzinfo=timezone.utc)
        return candidate.astimezone(timezone.utc)
    except Exception:
        return default


def _coerce_todo(raw: Any) -> TodoItem:
    if isinstance(raw, TodoItem):
        return raw.model_copy(update={"kanban": raw.kanban.ensure_default_columns()})

    if isinstance(raw, dict):
        migrated = dict(raw)
        migrated.setdefault("category", Category.DAILY_STRUCTURE)
        migrated.setdefault("priority", 3)
        migrated.setdefault("description_md", "")
        migrated.setdefault("progress_current", 0.0)
        migrated.setdefault("progress_target", None)
        migrated.setdefault("progress_unit", "")
        migrated.setdefault("auto_done_when_target_reached", migrated.get("progress_target") is not None)
        migrated.setdefault("completion_criteria_md", "")
        migrated.setdefault("processed_progress_events", [])
        migrated["processed_progress_events"] = cap_list_tail(
            list(migrated["processed_progress_events"]), PROCESSED_PROGRESS_EVENTS_LIMIT
        )
        kanban_default_factory = cast(Callable[[], object] | None, TodoItem.model_fields["kanban"].default_factory)
        migrated.setdefault("kanban", (kanban_default_factory or TodoKanban)())
        migrated.setdefault("milestones", [])
        migrated.setdefault("attachments", [])
        migrated.setdefault("recurrence", RecurrencePattern.ONCE)
        migrated.setdefault("email_reminder", EmailReminderOffset.NONE)
        migrated.setdefault("reminder_at", None)
        migrated.setdefault("reminder_sent_at", None)
        migrated["created_at"] = _normalize_timestamp(
            migrated.get("created_at"), default=datetime.now(timezone.utc)
        )
        migrated["due_date"] = _normalize_timestamp(migrated.get("due_date"))
        migrated["completed_at"] = _normalize_timestamp(migrated.get("completed_at"))
        migrated["reminder_at"] = _normalize_timestamp(migrated.get("reminder_at"))
        migrated["reminder_sent_at"] = _normalize_timestamp(migrated.get("reminder_sent_at"))
        todo = TodoItem.model_validate(migrated)
        reminder_at = todo.reminder_at or calculate_reminder_at(todo.due_date, todo.email_reminder)
        if todo.email_reminder is EmailReminderOffset.NONE:
            reminder_at = None

        return todo.model_copy(update={"kanban": todo.kanban.ensure_default_columns(), "reminder_at": reminder_at})

    todo = TodoItem.model_validate(raw)
    return todo.model_copy(update={"kanban": todo.kanban.ensure_default_columns()})


def _migrate_todos(raw_todos: Iterable[Any]) -> list[TodoItem]:
    todos: list[TodoItem] = []
    for raw in raw_todos:
        todos.append(_coerce_todo(raw))
    return todos


def init_state() -> None:
    """Initialize all required session state keys if they are missing."""

    if SS_TODOS not in st.session_state:
        st.session_state[SS_TODOS] = _default_todos()
    else:
        migrated = _migrate_todos(st.session_state.get(SS_TODOS, []))
        st.session_state[SS_TODOS] = [todo.model_dump() for todo in migrated]

    if SS_STATS not in st.session_state:
        st.session_state[SS_STATS] = _default_stats().model_dump()

    if SS_GAMIFICATION not in st.session_state:
        st.session_state[SS_GAMIFICATION] = _default_gamification().model_dump()

    if SS_SETTINGS not in st.session_state:
        st.session_state[SS_SETTINGS] = _default_settings()

    if SS_JOURNAL not in st.session_state:
        st.session_state[SS_JOURNAL] = _default_journal()

    if SS_COACH not in st.session_state:
        st.session_state[SS_COACH] = _default_coach().model_dump()
    else:
        st.session_state[SS_COACH] = CoachState.model_validate(st.session_state.get(SS_COACH, {})).model_dump()

    st.session_state.setdefault(TODO_TEMPLATE_LAST_APPLIED_KEY, "free")

    persist_state()


def get_todos() -> List[TodoItem]:
    """Return todo items from session state as TodoItem models."""

    raw_todos: Iterable[Any] = st.session_state.get(SS_TODOS, [])
    todos: List[TodoItem] = []
    mutated = False
    for raw in raw_todos:
        todo = _coerce_todo(raw)
        todos.append(todo)
        if not isinstance(raw, TodoItem):
            mutated = True

    if mutated:
        save_todos(todos)
    return todos


def save_todos(todos: Sequence[TodoItem]) -> None:
    """Persist todo items back to session state."""

    st.session_state[SS_TODOS] = [todo.model_dump() for todo in todos]
    persist_state()


def reset_state() -> None:
    """Clear managed keys and restore defaults."""

    for key in (SS_TODOS, SS_STATS, SS_GAMIFICATION, SS_SETTINGS, SS_JOURNAL, SS_COACH):
        if key in st.session_state:
            del st.session_state[key]
    init_state()
