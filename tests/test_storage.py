from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, cast

from gerris_erfolgs_tracker.storage import FileStorageBackend


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
