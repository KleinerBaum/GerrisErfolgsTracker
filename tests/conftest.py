from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict

import pytest
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture()
def session_state(monkeypatch: pytest.MonkeyPatch) -> Dict[str, object]:
    state: Dict[str, object] = {}
    monkeypatch.setattr(st, "session_state", state, raising=False)
    return state
