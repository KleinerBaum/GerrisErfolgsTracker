from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Protocol, Sequence

try:  # pragma: no cover - fcntl is unavailable on native Windows
    import fcntl
except ImportError:  # pragma: no cover - exercised only outside POSIX
    fcntl = None  # type: ignore[assignment]

from pydantic_core import to_jsonable_python

from gerris_erfolgs_tracker.models import AttachmentRef

ATTACHMENTS_FOLDER_NAME = "attachments"


class StateStorageError(RuntimeError):
    """Raised when an existing state file cannot safely be restored."""


class StorageBackend(Protocol):
    """Abstraction for persisting and restoring state."""

    def load_state(self) -> Mapping[str, object]:
        """Return a mapping representing the stored state."""

    def save_state(self, state: Mapping[str, object]) -> None:
        """Persist the provided state mapping."""


DEFAULT_STATE_FILENAME = "gerris_state.json"
TRACKER_FOLDER_NAME = "GerrisErfolgsTracker"


def _candidate_onedrive_roots(env: Mapping[str, str]) -> Iterable[Path]:
    """Return candidate OneDrive root directories based on environment variables."""

    for variable in ("GERRIS_ONEDRIVE_DIR", "ONEDRIVE", "OneDriveCommercial", "OneDriveConsumer"):
        raw_value = env.get(variable)
        if raw_value:
            yield Path(raw_value).expanduser()

    yield Path.home() / "OneDrive"
    yield Path("C:/Users/gerri/OneDrive")


def _tracker_directory(candidate_root: Path) -> Path:
    """Ensure we always point at the Gerris tracker folder inside the sync root."""

    if candidate_root.name.lower() == TRACKER_FOLDER_NAME.lower():
        return candidate_root

    return candidate_root / TRACKER_FOLDER_NAME


def resolve_tracker_directory(path: str | Path | None = None, *, env: Mapping[str, str] | None = None) -> Path:
    """Resolve the tracker root directory, preferring OneDrive sync folders when available."""

    if path is not None:
        explicit_path = Path(path).expanduser()
        if explicit_path.is_dir():
            return explicit_path
        return explicit_path.parent

    env_map: Mapping[str, str] = env or os.environ
    has_explicit_hint = any(
        env_map.get(var) for var in ("GERRIS_ONEDRIVE_DIR", "ONEDRIVE", "OneDriveCommercial", "OneDriveConsumer")
    )

    for candidate_root in _candidate_onedrive_roots(env_map):
        tracker_dir = _tracker_directory(candidate_root)
        if has_explicit_hint or tracker_dir.exists() or tracker_dir.parent.exists():
            return tracker_dir

    return Path(".data") / TRACKER_FOLDER_NAME


def resolve_state_file_path(path: str | Path | None = None, *, env: Mapping[str, str] | None = None) -> Path:
    """Resolve the state file path, preferring OneDrive sync folders when available."""

    if path is not None:
        explicit_path = Path(path).expanduser()
        if explicit_path.is_dir():
            return explicit_path / DEFAULT_STATE_FILENAME
        return explicit_path

    tracker_dir = resolve_tracker_directory(path, env=env)
    return tracker_dir / DEFAULT_STATE_FILENAME


def resolve_attachment_directory(
    todo_id: str, *, path: str | Path | None = None, env: Mapping[str, str] | None = None
) -> Path:
    """Resolve and create the attachment directory for a todo."""

    tracker_dir = resolve_tracker_directory(path, env=env)
    target_dir = tracker_dir / ATTACHMENTS_FOLDER_NAME / todo_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


@dataclass
class AttachmentPayload:
    """Lightweight attachment payload used for persistence."""

    filename: str
    data: bytes


def store_attachments(
    todo_id: str,
    payloads: Sequence[AttachmentPayload],
    *,
    path: str | Path | None = None,
    env: Mapping[str, str] | None = None,
) -> list[AttachmentRef]:
    """Persist attachment payloads and return compact references."""

    if not payloads:
        return []

    attachment_dir = resolve_attachment_directory(todo_id, path=path, env=env)
    references: list[AttachmentRef] = []
    for payload in payloads:
        filename = Path(payload.filename).name
        target_path = attachment_dir / filename
        target_path.write_bytes(payload.data)
        relative_path = Path(ATTACHMENTS_FOLDER_NAME) / todo_id / filename
        references.append(AttachmentRef(filename=filename, relative_path=str(relative_path)))
    return references


def resolve_attachment_path(
    reference: str | AttachmentRef, *, path: str | Path | None = None, env: Mapping[str, str] | None = None
) -> Path:
    """Resolve an attachment reference (relative path) to an absolute path."""

    tracker_dir = resolve_tracker_directory(path, env=env)
    relative_reference = reference.relative_path if isinstance(reference, AttachmentRef) else reference
    return tracker_dir / relative_reference


class FileStorageBackend:
    """Persist state to a JSON file on disk."""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = resolve_state_file_path(path)
        self._last_fingerprint: str | None = None

    @property
    def _lock_path(self) -> Path:
        return self.path.with_name(f".{self.path.name}.lock")

    @contextmanager
    def _lock(self) -> Iterator[None]:
        """Serialize reads/writes without mutating the JSON file in place."""

        lock_handle = os.open(self._lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            if fcntl is not None:
                fcntl.flock(lock_handle, fcntl.LOCK_EX)
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(lock_handle, fcntl.LOCK_UN)
            os.close(lock_handle)

    def _quarantine_corrupt_file(self) -> Path | None:
        """Move an unreadable existing file aside for explicit recovery."""

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        quarantine_path = self.path.with_name(f"{self.path.stem}.corrupt-{timestamp}{self.path.suffix}")
        try:
            os.replace(self.path, quarantine_path)
        except OSError:
            return None
        return quarantine_path

    @staticmethod
    def _fsync_directory(directory: Path) -> None:
        """Persist the directory entry when the platform supports directory fsync."""

        directory_flag = getattr(os, "O_DIRECTORY", 0)
        try:
            directory_handle = os.open(directory, os.O_RDONLY | directory_flag)
        except OSError:
            return
        try:
            os.fsync(directory_handle)
        except OSError:
            # Directory fsync is not available on every supported platform.
            pass
        finally:
            os.close(directory_handle)

    def load_state(self) -> Mapping[str, object]:
        if not self.path.exists():
            return {}

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock():
            try:
                with self.path.open("r", encoding="utf-8") as file_handle:
                    payload = json.load(file_handle)
            except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                quarantine_path = self._quarantine_corrupt_file()
                location = f" ({quarantine_path})" if quarantine_path else ""
                raise StateStorageError(
                    f"Die vorhandene State-Datei ist nicht lesbar und wurde quarantänisiert{location}."
                ) from exc

            if not isinstance(payload, Mapping):
                quarantine_path = self._quarantine_corrupt_file()
                location = f" ({quarantine_path})" if quarantine_path else ""
                raise StateStorageError(
                    f"Die vorhandene State-Datei enthält kein JSON-Objekt und wurde quarantänisiert{location}."
                )
            return payload

    def save_state(self, state: Mapping[str, object]) -> None:
        serialized = json.dumps(state, default=to_jsonable_python, ensure_ascii=False, sort_keys=True)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock():
            if serialized == self._last_fingerprint:
                return

            temporary_path: str | None = None
            try:
                file_descriptor, temporary_path = tempfile.mkstemp(
                    prefix=f".{self.path.name}.",
                    suffix=".tmp",
                    dir=self.path.parent,
                )
                with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="\n") as file_handle:
                    file_handle.write(serialized)
                    file_handle.flush()
                    os.fsync(file_handle.fileno())
                os.replace(temporary_path, self.path)
                temporary_path = None
                self._fsync_directory(self.path.parent)
                self._last_fingerprint = serialized
            finally:
                if temporary_path is not None:
                    try:
                        os.unlink(temporary_path)
                    except OSError:
                        pass


__all__ = [
    "StorageBackend",
    "StateStorageError",
    "FileStorageBackend",
    "resolve_state_file_path",
    "resolve_tracker_directory",
    "resolve_attachment_directory",
    "resolve_attachment_path",
    "store_attachments",
    "AttachmentPayload",
    "DEFAULT_STATE_FILENAME",
    "TRACKER_FOLDER_NAME",
    "ATTACHMENTS_FOLDER_NAME",
]
