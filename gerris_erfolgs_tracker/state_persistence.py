from __future__ import annotations

import json
import logging
from collections.abc import Mapping
from typing import Any

import streamlit as st
from pydantic_core import to_jsonable_python

from gerris_erfolgs_tracker.constants import SS_COACH, SS_GAMIFICATION, SS_JOURNAL, SS_SETTINGS, SS_STATS, SS_TODOS
from gerris_erfolgs_tracker.storage import StorageBackend

LOGGER = logging.getLogger(__name__)

PERSISTED_KEYS: tuple[str, ...] = (SS_TODOS, SS_STATS, SS_GAMIFICATION, SS_SETTINGS, SS_JOURNAL, SS_COACH)
PERSISTENCE_RECOVERY_REQUIRED_KEY = "_gerris_persistence_recovery_required"
_storage_backend: StorageBackend | None = None
_storage_identity: object | None = None
_last_persisted_fingerprint: str | None = None
_persistence_blocked = False
_persistence_error: str | None = None


def _backend_identity(backend: StorageBackend | None) -> object | None:
    if backend is None:
        return None
    path = getattr(backend, "path", None)
    if path is not None:
        return type(backend), str(path)
    return id(backend)


def configure_storage(backend: StorageBackend | None) -> None:
    """Register a storage backend without clearing an active recovery block."""

    global _storage_backend, _storage_identity, _last_persisted_fingerprint
    global _persistence_blocked, _persistence_error

    identity = _backend_identity(backend)
    if identity != _storage_identity:
        _last_persisted_fingerprint = None
        _persistence_blocked = False
        _persistence_error = None
        st.session_state.pop(PERSISTENCE_RECOVERY_REQUIRED_KEY, None)
    _storage_backend = backend
    _storage_identity = identity


def _block_persistence(message: str) -> None:
    """Stop implicit writes until the user explicitly chooses a recovery action."""

    global _persistence_blocked, _persistence_error
    was_blocked = _persistence_blocked
    _persistence_blocked = True
    _persistence_error = message
    st.session_state[PERSISTENCE_RECOVERY_REQUIRED_KEY] = message
    if not was_blocked:
        st.warning(
            "Persistente Daten konnten nicht sicher verarbeitet werden. Der vorhandene Stand bleibt "
            "unverändert; automatische Defaults werden nicht gespeichert. Bitte Backup importieren "
            "oder die Session ausdrücklich zurücksetzen.",
            icon="⚠️",
        )


def persistence_is_blocked() -> bool:
    """Return whether implicit persistence is disabled pending explicit recovery."""

    return _persistence_blocked


def clear_persistence_block() -> None:
    """Allow writes again after an explicit reset or validated backup restore."""

    global _persistence_blocked, _persistence_error
    _persistence_blocked = False
    _persistence_error = None
    st.session_state.pop(PERSISTENCE_RECOVERY_REQUIRED_KEY, None)


def load_persisted_state() -> bool:
    """Hydrate Streamlit state; never replace an unreadable file with defaults."""

    if _storage_backend is None:
        return True
    if _persistence_blocked:
        return False

    try:
        persisted = _storage_backend.load_state()
        if not isinstance(persisted, Mapping):
            raise TypeError("Das Persistenz-Backend hat kein Mapping geliefert.")
    except Exception as exc:  # pragma: no cover - defensive logging
        message = f"Failed to load persisted state: {exc}"
        LOGGER.warning(message)
        _block_persistence(message)
        return False

    st.session_state.update(persisted)
    st.session_state.pop(PERSISTENCE_RECOVERY_REQUIRED_KEY, None)
    return True


def persist_state() -> bool:
    """Persist managed session keys; return false when recovery is required."""

    global _last_persisted_fingerprint

    if _storage_backend is None:
        return True
    if _persistence_blocked:
        LOGGER.warning("Skipping state persistence because explicit recovery is required: %s", _persistence_error)
        return False

    try:
        payload: dict[str, Any] = {key: st.session_state.get(key) for key in PERSISTED_KEYS if key in st.session_state}
        serialized_payload = json.dumps(payload, default=to_jsonable_python, sort_keys=True)
        if _last_persisted_fingerprint == serialized_payload:
            return True
        _storage_backend.save_state(payload)
    except Exception as exc:  # pragma: no cover - defensive logging
        message = f"Failed to persist state: {exc}"
        LOGGER.warning(message)
        _block_persistence(message)
        return False

    _last_persisted_fingerprint = serialized_payload
    return True
