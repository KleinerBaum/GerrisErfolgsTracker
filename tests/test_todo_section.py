from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pytest

from app import (
    AI_QUADRANT_RATIONALE_KEY,
    NEW_TODO_DUE_KEY,
    NEW_TODO_QUADRANT_KEY,
    NEW_TODO_QUADRANT_PREFILL_KEY,
    NEW_TODO_RESET_TRIGGER_KEY,
    NEW_TODO_TITLE_KEY,
    render_todo_section,
)
from gerris_erfolgs_tracker.ai_features import AISuggestion
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.llm_schemas import QuadrantName, TodoCategorization
from gerris_erfolgs_tracker.models import KpiStats


class RerunSentinel(Exception):
    """Raised by the Streamlit stub to simulate st.rerun without exiting tests."""


@dataclass
class _FormPlan:
    submit_sequence: List[bool]

    def pop_submit(self) -> bool:
        if not self.submit_sequence:
            return False
        return self.submit_sequence.pop(0)


class _ColumnStub:
    def __init__(self, plan: _FormPlan) -> None:
        self._plan = plan

    def __enter__(self) -> "_ColumnStub":
        return self

    def __exit__(self, *_: Any) -> None:  # noqa: ANN401
        return None

    def form_submit_button(self, *_: Any, **__: Any) -> bool:  # noqa: ANN401
        return self._plan.pop_submit()


class _FormStub:
    def __enter__(self) -> "_FormStub":
        return self

    def __exit__(self, *_: Any) -> None:  # noqa: ANN401
        return None


class _StreamlitTodoStub:
    def __init__(self, session_state: Dict[str, object], plan: _FormPlan) -> None:
        self.session_state = session_state
        self._plan = plan

    def subheader(self, *_: Any, **__: Any) -> None:  # noqa: ANN401
        return None

    def form(self, *_: Any, **__: Any) -> _FormStub:  # noqa: ANN401
        return _FormStub()

    def text_input(
        self,
        _: str,
        key: str,
        placeholder: str,
        **__: Any,  # noqa: ANN001
    ) -> str:
        default_value = self.session_state.get(key, "")
        self.session_state[key] = default_value
        return str(default_value)

    def columns(self, count: int) -> List[_ColumnStub]:
        return [_ColumnStub(self._plan) for _ in range(count)]

    def date_input(
        self,
        _: str,
        value: Optional[Any],
        key: str,
        **__: Any,
    ) -> Optional[Any]:  # noqa: ANN401
        self.session_state.setdefault(key, value)
        return self.session_state[key]

    def selectbox(
        self,
        _: str,
        options: List[Any],
        key: Optional[str] = None,
        index: int = 0,
        **__: Any,
    ) -> Any:
        if key is None:
            return options[index]
        selected = self.session_state.get(key, options[index])
        self.session_state[key] = selected
        return selected

    def warning(self, *_: Any, **__: Any) -> None:  # noqa: ANN401
        return None

    def info(self, *_: Any, **__: Any) -> None:  # noqa: ANN401
        return None

    def success(self, *_: Any, **__: Any) -> None:  # noqa: ANN401
        return None

    def caption(self, *_: Any, **__: Any) -> None:  # noqa: ANN401
        return None

    def radio(self, *_: Any, **__: Any) -> str:  # noqa: ANN401
        return "Alle / All"

    def rerun(self) -> None:
        raise RerunSentinel()


def _mock_kpi() -> KpiStats:
    return KpiStats(goal_daily=1)


def _no_todos() -> list[object]:
    return []


def test_quadrant_suggestion_sets_prefill_and_rationale(
    session_state: Dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    session_state[NEW_TODO_TITLE_KEY] = "Testaufgabe"
    plan = _FormPlan(submit_sequence=[True, False])
    st_stub = _StreamlitTodoStub(session_state, plan)

    suggestion = AISuggestion[TodoCategorization](
        payload=TodoCategorization(
            quadrant=QuadrantName.NOT_URGENT_IMPORTANT,
            rationale="Beispielgrund / Example rationale",
        ),
        from_ai=True,
    )

    monkeypatch.setattr("app.st", st_stub)
    monkeypatch.setattr("app.get_kpi_stats", _mock_kpi)
    monkeypatch.setattr("app.get_todos", _no_todos)
    monkeypatch.setattr("app.suggest_quadrant", lambda *_, **__: suggestion)

    with pytest.raises(RerunSentinel):
        render_todo_section(ai_enabled=True, client=None)

    assert session_state[NEW_TODO_QUADRANT_PREFILL_KEY] == EisenhowerQuadrant.NOT_URGENT_IMPORTANT
    assert session_state[AI_QUADRANT_RATIONALE_KEY] == suggestion.payload.rationale
    assert session_state[NEW_TODO_QUADRANT_KEY] == EisenhowerQuadrant.URGENT_IMPORTANT


def test_submit_resets_form_state_without_widget_writes(
    session_state: Dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    session_state[NEW_TODO_TITLE_KEY] = "Neue Aufgabe"
    session_state[NEW_TODO_DUE_KEY] = None
    session_state[NEW_TODO_QUADRANT_KEY] = EisenhowerQuadrant.URGENT_IMPORTANT
    session_state[AI_QUADRANT_RATIONALE_KEY] = "Alt / Old"

    submissions = _FormPlan(submit_sequence=[False, True])
    st_stub = _StreamlitTodoStub(session_state, submissions)
    added: Dict[str, Any] = {}

    def _record_add(title: str, quadrant: EisenhowerQuadrant, due_date: Optional[Any]) -> None:
        added.update({"title": title, "quadrant": quadrant, "due_date": due_date})

    monkeypatch.setattr("app.st", st_stub)
    monkeypatch.setattr("app.get_kpi_stats", _mock_kpi)
    monkeypatch.setattr("app.get_todos", _no_todos)
    monkeypatch.setattr("app.add_todo", _record_add)

    with pytest.raises(RerunSentinel):
        render_todo_section(ai_enabled=True, client=None)

    assert added["title"] == "Neue Aufgabe"
    assert added["quadrant"] == EisenhowerQuadrant.URGENT_IMPORTANT
    assert session_state[NEW_TODO_RESET_TRIGGER_KEY] is True

    # Second render applies the reset before drawing widgets.
    follow_up_plan = _FormPlan(submit_sequence=[False, False])
    st_stub_follow_up = _StreamlitTodoStub(session_state, follow_up_plan)
    monkeypatch.setattr("app.st", st_stub_follow_up)

    render_todo_section(ai_enabled=True, client=None)

    assert session_state.get(NEW_TODO_TITLE_KEY, "") == ""
    assert session_state.get(NEW_TODO_DUE_KEY) is None
    assert (
        session_state.get(NEW_TODO_QUADRANT_KEY, EisenhowerQuadrant.URGENT_IMPORTANT)
        == EisenhowerQuadrant.URGENT_IMPORTANT
    )
    assert NEW_TODO_QUADRANT_PREFILL_KEY not in session_state
    assert AI_QUADRANT_RATIONALE_KEY not in session_state
    assert NEW_TODO_RESET_TRIGGER_KEY not in session_state
