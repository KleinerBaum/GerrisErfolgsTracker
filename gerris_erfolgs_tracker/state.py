from __future__ import annotations

import json
import logging
from typing import Any, Callable, Iterable, List, Mapping, Sequence, cast

import streamlit as st
from pydantic_core import to_jsonable_python

from gerris_erfolgs_tracker.constants import (
    SS_GAMIFICATION,
    SS_JOURNAL,
    SS_SETTINGS,
    SS_STATS,
    SS_TODOS,
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
from gerris_erfolgs_tracker.storage import StorageBackend


LOGGER = logging.getLogger(__name__)
PERSISTED_KEYS: tuple[str, ...] = (SS_TODOS, SS_STATS, SS_GAMIFICATION, SS_SETTINGS, SS_JOURNAL)
_storage_backend: StorageBackend | None = None
_last_persisted_fingerprint: str | None = None


def _default_todos() -> List[TodoItem]:
    return []


def _default_stats() -> KpiStats:
    return KpiStats()


def _default_gamification() -> GamificationState:
    return GamificationState()


def _default_settings() -> dict[str, Any]:
    return {"category_goals": {category.value: 1 for category in Category}}


def _default_journal() -> dict[str, Any]:
    return {}


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
        migrated.setdefault("auto_done_when_target_reached", bool(migrated.get("progress_target")))
        migrated.setdefault("completion_criteria_md", "")
        migrated.setdefault("processed_progress_events", [])
        kanban_default_factory = cast(Callable[[], object] | None, TodoItem.model_fields["kanban"].default_factory)
        migrated.setdefault("kanban", (kanban_default_factory or TodoKanban)())
        migrated.setdefault("recurrence", RecurrencePattern.ONCE)
        migrated.setdefault("email_reminder", EmailReminderOffset.NONE)
        todo = TodoItem.model_validate(migrated)
        return todo.model_copy(update={"kanban": todo.kanban.ensure_default_columns()})

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

    for key in (SS_TODOS, SS_STATS, SS_GAMIFICATION, SS_SETTINGS, SS_JOURNAL):
        if key in st.session_state:
            del st.session_state[key]
    init_state()


def configure_storage(backend: StorageBackend | None) -> None:
    """Register a storage backend to persist state changes."""

    global _storage_backend, _last_persisted_fingerprint

    _storage_backend = backend
    _last_persisted_fingerprint = None


def load_persisted_state() -> None:
    """Hydrate the Streamlit session state from the configured backend."""

    if _storage_backend is None:
        return

    try:
        persisted = _storage_backend.load_state()
    except Exception as exc:  # pragma: no cover - defensive logging
        LOGGER.warning("Failed to load persisted state: %s", exc)
        st.warning(
            "Persistente Daten konnten nicht geladen werden / Could not load persisted data.",
            icon="⚠️",
        )
        return

    if not isinstance(persisted, Mapping):
        return

    st.session_state.update(persisted)


def persist_state() -> None:
    """Persist the managed session state keys using the configured backend."""

    global _last_persisted_fingerprint

    if _storage_backend is None:
        return

    payload = {key: st.session_state.get(key) for key in PERSISTED_KEYS if key in st.session_state}
    serialized_payload = json.dumps(payload, default=to_jsonable_python, sort_keys=True)
    if _last_persisted_fingerprint == serialized_payload:
        return

    try:
        _storage_backend.save_state(payload)
        _last_persisted_fingerprint = serialized_payload
    except Exception as exc:  # pragma: no cover - defensive logging
        LOGGER.warning("Failed to persist state: %s", exc)
