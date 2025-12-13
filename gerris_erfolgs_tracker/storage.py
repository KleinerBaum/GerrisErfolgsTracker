from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping, Protocol

from pydantic_core import to_jsonable_python


class StorageBackend(Protocol):
    """Abstraction for persisting and restoring state."""

    def load_state(self) -> Mapping[str, object]:
        """Return a mapping representing the stored state."""

    def save_state(self, state: Mapping[str, object]) -> None:
        """Persist the provided state mapping."""


class FileStorageBackend:
    """Persist state to a JSON file on disk."""

    def __init__(self, path: str | Path = Path(".data") / "gerris_state.json") -> None:
        self.path = Path(path)
        self._last_fingerprint: str | None = None

    def load_state(self) -> Mapping[str, object]:
        if not self.path.exists():
            return {}

        with self.path.open("r", encoding="utf-8") as file_handle:
            return json.load(file_handle)

    def save_state(self, state: Mapping[str, object]) -> None:
        serialized = json.dumps(state, default=to_jsonable_python, ensure_ascii=False, sort_keys=True)
        if serialized == self._last_fingerprint:
            return

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as file_handle:
            file_handle.write(serialized)

        self._last_fingerprint = serialized


__all__ = ["StorageBackend", "FileStorageBackend"]
