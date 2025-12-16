from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest

from app import (
    AI_GOAL_SUGGESTION_KEY,
    AI_ENABLED_KEY,
    GOAL_CREATION_VISIBLE_KEY,
    GOAL_SUGGESTED_VALUE_KEY,
    _resolve_goal_input_value,
    render_settings_panel,
)
from gerris_erfolgs_tracker.ai_features import AISuggestion
from gerris_erfolgs_tracker.constants import SS_SETTINGS
from gerris_erfolgs_tracker.llm_schemas import GoalSuggestion
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


def test_goal_suggestion_sets_widget_value(session_state: Dict[str, object], monkeypatch: pytest.MonkeyPatch) -> None:
    stats = KpiStats(goal_daily=3)
    suggestion = AISuggestion(
        payload=GoalSuggestion(
            daily_goal=5,
            focus="Momentum halten / Keep momentum.",
            tips=["Test-Tipp DE", "Test tip EN"],
        ),
        from_ai=True,
    )

    plan = _ButtonPlan(responses={"settings_ai_goal": [True, False]})
    st_stub = _StreamlitStub(session_state, plan)
    panel_stub = _PanelStub(session_state, plan)

    monkeypatch.setattr("app.st", st_stub)
    monkeypatch.setattr("app.suggest_goals", lambda *_, **__: suggestion)

    session_state[GOAL_CREATION_VISIBLE_KEY] = True
    session_state[AI_ENABLED_KEY] = True
    session_state[SS_SETTINGS] = {AI_ENABLED_KEY: True}
    with pytest.raises(RerunSentinel):
        render_settings_panel(stats, client=None, panel=panel_stub)

    assert session_state[AI_GOAL_SUGGESTION_KEY] is suggestion
    assert session_state[GOAL_SUGGESTED_VALUE_KEY] == suggestion.payload.daily_goal

    panel_stub.number_input_value = None
    ai_enabled = render_settings_panel(stats, client=None, panel=panel_stub)

    assert ai_enabled is True
    assert session_state["settings_goal_daily"] == suggestion.payload.daily_goal
    assert panel_stub.number_inputs["settings_goal_daily"] == suggestion.payload.daily_goal


def test_resolve_goal_value_prefers_suggestion(session_state: Dict[str, object]) -> None:
    stats = KpiStats(goal_daily=2)
    settings: dict[str, Any] = {"goal_daily": 4}
    session_state[GOAL_SUGGESTED_VALUE_KEY] = 7

    resolved = _resolve_goal_input_value(settings=settings, stats=stats)

    assert resolved == 7
    assert session_state["settings_goal_daily"] == 7
