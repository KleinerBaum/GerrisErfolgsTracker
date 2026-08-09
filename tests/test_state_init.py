from __future__ import annotations

from gerris_erfolgs_tracker.constants import TODO_TEMPLATE_LAST_APPLIED_KEY
from gerris_erfolgs_tracker.state import configure_storage, init_state
from gerris_erfolgs_tracker.state_persistence import load_persisted_state
from gerris_erfolgs_tracker.storage import FileStorageBackend


def test_init_state_sets_template_default(session_state: dict[str, object]) -> None:
    init_state()

    assert session_state[TODO_TEMPLATE_LAST_APPLIED_KEY] == "free"


def test_corrupt_persistence_blocks_default_overwrite(session_state, tmp_path) -> None:
    state_path = tmp_path / "state.json"
    state_path.write_text("{broken", encoding="utf-8")
    configure_storage(FileStorageBackend(state_path))

    try:
        assert load_persisted_state() is False
        assert load_persisted_state() is False
        init_state()
        assert not state_path.exists()
        assert list(tmp_path.glob("state.corrupt-*.json"))
    finally:
        configure_storage(None)
