from __future__ import annotations

import json
import logging
from typing import Mapping

import streamlit as st
from pydantic_core import to_jsonable_python

from gerris_erfolgs_tracker.constants import SS_COACH, SS_GAMIFICATION, SS_JOURNAL, SS_SETTINGS, SS_STATS, SS_TODOS
from gerris_erfolgs_tracker.storage import StorageBackend

LOGGER = logging.getLogger(__name__)

PERSISTED_KEYS: tuple[str, ...] = (SS_TODOS, SS_STATS, SS_GAMIFICATION, SS_SETTINGS, SS_JOURNAL, SS_COACH)
_storage_backend: StorageBackend | None = None
_last_persisted_fingerprint: str | None = None


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
            "Persistente Daten konnten nicht geladen werden.",
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
