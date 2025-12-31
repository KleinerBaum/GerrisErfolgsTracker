from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

from gerris_erfolgs_tracker.storage import (
    ATTACHMENTS_FOLDER_NAME,
    DEFAULT_STATE_FILENAME,
    TRACKER_FOLDER_NAME,
    AttachmentPayload,
    FileStorageBackend,
    resolve_attachment_directory,
    resolve_attachment_path,
    resolve_state_file_path,
    store_attachments,
)


def test_file_storage_roundtrip(tmp_path) -> None:
    backend = FileStorageBackend(tmp_path / "nested" / "state.json")
    timestamp = datetime(2024, 7, 21, 12, 30, tzinfo=timezone.utc)
    original_state = {
        "todos": [
            {
                "id": "abc",
                "title": "Persist me",
                "created_at": timestamp,
                "completed": False,
            }
        ]
    }

    backend.save_state(original_state)
    loaded_state = backend.load_state()

    todos = cast(list[dict[str, Any]], loaded_state.get("todos"))
    todo = todos[0]

    assert todo["title"] == "Persist me"
    stored_timestamp = str(todo["created_at"])
    assert datetime.fromisoformat(stored_timestamp.replace("Z", "+00:00")) == timestamp


def test_onedrive_env_hint(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("ONEDRIVE", raising=False)
    monkeypatch.delenv("OneDriveCommercial", raising=False)
    monkeypatch.delenv("OneDriveConsumer", raising=False)

    sync_root = tmp_path / "OneDrive"
    monkeypatch.setenv("GERRIS_ONEDRIVE_DIR", str(sync_root))

    backend = FileStorageBackend()

    expected = sync_root / TRACKER_FOLDER_NAME / DEFAULT_STATE_FILENAME
    assert backend.path == expected


def test_resolve_path_without_double_folder() -> None:
    custom_tracker_dir = Path("/tmp") / TRACKER_FOLDER_NAME
    env = {"GERRIS_ONEDRIVE_DIR": str(custom_tracker_dir)}

    resolved = resolve_state_file_path(env=env)

    assert resolved == custom_tracker_dir / DEFAULT_STATE_FILENAME


def test_attachment_directory_respects_onedrive_root(tmp_path, monkeypatch) -> None:
    sync_root = tmp_path / "OneDrive"
    monkeypatch.setenv("ONEDRIVE", str(sync_root))

    target_dir = resolve_attachment_directory("todo-123", env=os.environ)

    assert target_dir == sync_root / TRACKER_FOLDER_NAME / ATTACHMENTS_FOLDER_NAME / "todo-123"
    assert target_dir.exists()


def test_store_attachments_creates_references(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("ONEDRIVE", str(tmp_path))
    payload = AttachmentPayload(filename="note.png", data=b"img-bytes")

    references = store_attachments("todo-abc", [payload])

    assert len(references) == 1
    reference = references[0]
    resolved = resolve_attachment_path(reference)

    assert reference.filename == "note.png"
    assert reference.relative_path == str(Path(ATTACHMENTS_FOLDER_NAME) / "todo-abc" / "note.png")
    assert resolved.exists()
    assert resolved.read_bytes() == b"img-bytes"
