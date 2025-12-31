from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, cast

import pytest

from app import (
    AI_ENABLED_KEY,
    GOAL_CREATION_VISIBLE_KEY,
    SETTINGS_GOAL_DAILY_KEY,
    _resolve_goal_input_value,
    render_settings_panel,
)
from gerris_erfolgs_tracker.constants import SS_SETTINGS
from gerris_erfolgs_tracker.models import KpiStats


class RerunSentinel(Exception):
    """Raised by the Streamlit stub to simulate st.rerun without exiting tests."""


@dataclass
class _ButtonPlan:
    responses: Dict[str | None, List[bool]]

    def pop(self, key: Optional[str]) -> bool:
        planned = self.responses.get(key)
        if not planned:
            return False
        return planned.pop(0)


class _ColumnStub:
    def __init__(self, plan: _ButtonPlan) -> None:
        self._plan = plan

    def __enter__(self) -> "_ColumnStub":
        return self

    def __exit__(self, *_: Any) -> None:  # noqa: ANN401
        return None

    def button(self, label: str, key: Optional[str] = None, **_: Any) -> bool:  # noqa: ANN001
        return self._plan.pop(key)


class _PanelStub:
    def __init__(self, session_state: Dict[str, object], plan: _ButtonPlan) -> None:
        self.session_state = session_state
        self._plan = plan
        self.number_input_value: Optional[float | int] = None
        self.number_inputs: Dict[str, float | int] = {}
        self.columns_calls: List[int] = []

    def __enter__(self) -> "_PanelStub":
        return self

    def __exit__(self, *_: Any) -> None:  # noqa: ANN401
        return None

    def expander(self, *_: Any, **__: Any) -> "_PanelStub":
        return self

    def header(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op header stub."""

    def markdown(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op markdown stub."""

    def text_input(
        self,
        *_: Any,
        value: str = "",
        key: Optional[str] = None,
        **__: Any,
    ) -> str:
        if key:
            self.session_state[key] = value
        return value

    def multiselect(
        self,
        *_: Any,
        default: Optional[List[Any]] = None,
        **__: Any,
    ) -> List[Any]:
        return default or []

    def tabs(self, labels: List[str]) -> List["_TabStub"]:
        return [_TabStub() for _ in labels]

    def date_input(self, *_: Any, value: Any = None, **__: Any) -> Any:  # noqa: ANN401
        return value

    def toggle(self, *_: Any, **__: Any) -> bool:  # noqa: ANN401
        return True

    def number_input(self, *_: Any, value: int | float, key: Optional[str] = None, **__: Any) -> int | float:  # noqa: ANN401
        self.number_input_value = value
        if key:
            self.number_inputs[key] = value
            self.session_state[key] = value
        return value

    def columns(self, count: int) -> List[_ColumnStub]:
        self.columns_calls.append(count)
        return [_ColumnStub(self._plan) for _ in range(count)]

    def button(self, label: str, key: Optional[str] = None, **__: Any) -> bool:  # noqa: ANN401
        return self._plan.pop(key)

    def success(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op success stub."""

    def info(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op info stub."""

    def divider(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op divider stub."""

    def subheader(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op subheader stub."""

    def warning(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op warning stub."""

    def caption(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op caption stub."""

    def selectbox(
        self,
        label: str,
        options: List[Any],
        index: int,
        **__: Any,
    ) -> Any:
        return options[index]


class _StreamlitStub:
    def __init__(self, session_state: Dict[str, object], plan: _ButtonPlan) -> None:
        self.session_state = session_state
        self._plan = plan

    def rerun(self) -> None:
        raise RerunSentinel()

    def number_input(
        self,
        *_: Any,
        value: int,
        key: str,
        **__: Any,
    ) -> int:
        self.session_state[key] = value
        return value

    def text_area(self, *_: Any, value: str = "", **__: Any) -> str:  # noqa: ANN401
        return value

    def markdown(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op markdown stub."""

    def caption(self, *_: Any, **__: Any) -> None:  # noqa: D401, ANN401
        """No-op caption stub."""

    def tabs(self, labels: List[str]) -> List["_TabStub"]:
        return [_TabStub() for _ in labels]


class _TabStub:
    def __enter__(self) -> "_TabStub":
        return self

    def __exit__(self, *_: Any) -> None:  # noqa: ANN401
        return None


def test_settings_panel_runs_without_daily_goal_controls(
    session_state: Dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    stats = KpiStats(goal_daily=3)
    plan = _ButtonPlan(responses={})
    st_stub = _StreamlitStub(session_state, plan)
    panel_stub = _PanelStub(session_state, plan)

    monkeypatch.setattr("app.st", st_stub)

    session_state[GOAL_CREATION_VISIBLE_KEY] = True
    session_state[AI_ENABLED_KEY] = True
    session_state[SS_SETTINGS] = {AI_ENABLED_KEY: True}

    ai_enabled = render_settings_panel(stats, client=None, panel=panel_stub)

    assert ai_enabled is True
    assert SS_SETTINGS in session_state
    assert session_state[SETTINGS_GOAL_DAILY_KEY] == 3
    settings = cast(Dict[str, object], session_state[SS_SETTINGS])
    assert settings["goal_daily"] == 3
    assert plan.responses == {}


def test_settings_panel_uses_two_column_canvas(
    session_state: Dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    stats = KpiStats(goal_daily=2)
    plan = _ButtonPlan(responses={})
    st_stub = _StreamlitStub(session_state, plan)
    panel_stub = _PanelStub(session_state, plan)

    monkeypatch.setattr("app.st", st_stub)

    session_state[GOAL_CREATION_VISIBLE_KEY] = True
    session_state[AI_ENABLED_KEY] = True
    session_state[SS_SETTINGS] = {AI_ENABLED_KEY: True}

    render_settings_panel(stats, client=None, panel=panel_stub)

    assert 2 in panel_stub.columns_calls


def test_settings_panel_respects_existing_goal_input_value(
    session_state: Dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    stats = KpiStats(goal_daily=2)
    plan = _ButtonPlan(responses={})
    st_stub = _StreamlitStub(session_state, plan)
    panel_stub = _PanelStub(session_state, plan)

    monkeypatch.setattr("app.st", st_stub)

    session_state[GOAL_CREATION_VISIBLE_KEY] = True
    session_state[AI_ENABLED_KEY] = True
    session_state[SETTINGS_GOAL_DAILY_KEY] = 7
    session_state[SS_SETTINGS] = {AI_ENABLED_KEY: True}

    render_settings_panel(stats, client=None, panel=panel_stub)

    assert panel_stub.number_inputs[SETTINGS_GOAL_DAILY_KEY] == 7
    settings = cast(Dict[str, object], session_state[SS_SETTINGS])
    assert settings["goal_daily"] == 7


def test_resolve_goal_input_value_does_not_seed_session_state(session_state: Dict[str, object]) -> None:
    stats = KpiStats(goal_daily=5)
    settings: Dict[str, object] = {"goal_daily": 4}

    resolved = _resolve_goal_input_value(settings=settings, stats=stats)

    assert resolved == 4
    assert SETTINGS_GOAL_DAILY_KEY not in session_state


def test_resolve_goal_input_value_prefers_existing_widget_value(session_state: Dict[str, object]) -> None:
    stats = KpiStats(goal_daily=1)
    settings: Dict[str, object] = {"goal_daily": 3}
    session_state[SETTINGS_GOAL_DAILY_KEY] = 6

    resolved = _resolve_goal_input_value(settings=settings, stats=stats)

    assert resolved == 6
