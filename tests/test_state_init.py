from __future__ import annotations

from gerris_erfolgs_tracker.constants import TODO_TEMPLATE_LAST_APPLIED_KEY
from gerris_erfolgs_tracker.state import init_state


def test_init_state_sets_template_default(session_state: dict[str, object]) -> None:
    init_state()

    assert session_state[TODO_TEMPLATE_LAST_APPLIED_KEY] == "free"
