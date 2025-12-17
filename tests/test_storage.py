from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any, cast

import pytest

from gerris_erfolgs_tracker.storage import (
    DEFAULT_STATE_FILENAME,
    TRACKER_FOLDER_NAME,
    FileStorageBackend,
    resolve_state_file_path,
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


def test_save_state_writes_valid_json(tmp_path: Path) -> None:
    backend = FileStorageBackend(tmp_path / "state.json")

    state = {"todos": [{"id": "abc", "title": "Atomic", "completed": False}]}

    backend.save_state(state)

    persisted = (tmp_path / "state.json").read_text(encoding="utf-8")
    assert json.loads(persisted)["todos"][0]["title"] == "Atomic"


def test_save_state_cleans_up_temp_file_on_failure(monkeypatch, tmp_path: Path) -> None:
    backend = FileStorageBackend(tmp_path / "state.json")

    call_count = 0

    def failing_replace(src: str | os.PathLike[str], dst: str | os.PathLike[str]) -> None:
        nonlocal call_count
        call_count += 1
        raise OSError("boom")

    monkeypatch.setattr(os, "replace", failing_replace)

    state = {"todos": [{"id": "abc", "title": "Atomic", "completed": False}]}

    with pytest.raises(OSError):
        backend.save_state(state)

    assert call_count == 1
    assert not (tmp_path / "state.json").exists()
    assert not (tmp_path / "state.json.tmp").exists()


def test_save_state_writes_backups(tmp_path: Path) -> None:
    backend = FileStorageBackend(tmp_path / "state.json", backup_versions=2)

    first_state = {"todos": [{"id": "abc", "title": "First", "completed": False}]}
    backend.save_state(first_state)

    second_state = {"todos": [{"id": "abc", "title": "Second", "completed": True}]}
    backend.save_state(second_state)

    primary = json.loads((tmp_path / "state.json").read_text(encoding="utf-8"))
    backup = json.loads((tmp_path / "state.json.bak1").read_text(encoding="utf-8"))

    assert primary["todos"][0]["title"] == "Second"
    assert backup["todos"][0]["title"] == "First"
