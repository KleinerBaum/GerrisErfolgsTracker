from __future__ import annotations

from typing import Any, Iterable, List, Sequence

import streamlit as st

from gerris_erfolgs_tracker.constants import (
    SS_GAMIFICATION,
    SS_SETTINGS,
    SS_STATS,
    SS_TODOS,
)
from gerris_erfolgs_tracker.models import Category, GamificationState, KpiStats, TodoItem


def _default_todos() -> List[TodoItem]:
    return []


def _default_stats() -> KpiStats:
    return KpiStats()


def _default_gamification() -> GamificationState:
    return GamificationState()


def _default_settings() -> dict[str, Any]:
    return {"category_goals": {category.value: 1 for category in Category}}


def _coerce_todo(raw: Any) -> TodoItem:
    if isinstance(raw, TodoItem):
        return raw

    if isinstance(raw, dict):
        migrated = dict(raw)
        migrated.setdefault("category", Category.DAILY_STRUCTURE)
        migrated.setdefault("priority", 3)
        migrated.setdefault("description_md", "")
        return TodoItem.model_validate(migrated)

    return TodoItem.model_validate(raw)


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


def reset_state() -> None:
    """Clear managed keys and restore defaults."""

    for key in (SS_TODOS, SS_STATS, SS_GAMIFICATION, SS_SETTINGS):
        if key in st.session_state:
            del st.session_state[key]
    init_state()
