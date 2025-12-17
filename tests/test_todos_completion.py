from __future__ import annotations

from datetime import datetime, timezone

import pytest
import streamlit as st

from gerris_erfolgs_tracker.constants import SS_TODOS
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import GamificationState, KpiStats, TodoItem
from gerris_erfolgs_tracker.state import _coerce_todo
from gerris_erfolgs_tracker.todos import toggle_complete


def test_coerce_todo_defaults_auto_done_for_zero_target(session_state: dict[str, object]) -> None:
    todo = _coerce_todo(
        {
            "title": "Target 0",
            "quadrant": EisenhowerQuadrant.URGENT_IMPORTANT,
            "progress_target": 0,
        }
    )

    assert todo.auto_done_when_target_reached is True


def test_toggle_complete_triggers_completion_once(
    monkeypatch: pytest.MonkeyPatch, session_state: dict[str, object]
) -> None:
    calls: dict[str, int] = {"kpis": 0, "gamification": 0}

    def fake_update_kpis(completed_at: datetime | None) -> KpiStats:
        calls["kpis"] += 1
        return KpiStats(last_completion_date=(completed_at or datetime.now(timezone.utc)).date())

    def fake_update_gamification(todo: TodoItem, stats: KpiStats) -> GamificationState:
        calls["gamification"] += 1
        return GamificationState(points=stats.done_total)

    monkeypatch.setattr("gerris_erfolgs_tracker.kpis.update_kpis_on_completion", fake_update_kpis)
    monkeypatch.setattr(
        "gerris_erfolgs_tracker.gamification.update_gamification_on_completion",
        fake_update_gamification,
    )

    todo = TodoItem(title="Complete me", quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT)
    st.session_state[SS_TODOS] = [todo.model_dump()]

    updated = toggle_complete(todo.id)

    assert updated is not None
    assert updated.completed is True
    assert calls == {"kpis": 1, "gamification": 1}


def test_toggle_complete_uncomplete_skips_completion(
    monkeypatch: pytest.MonkeyPatch, session_state: dict[str, object]
) -> None:
    calls: dict[str, int] = {"kpis": 0, "gamification": 0}

    monkeypatch.setattr(
        "gerris_erfolgs_tracker.kpis.update_kpis_on_completion",
        lambda completed_at: KpiStats(),
    )
    monkeypatch.setattr(
        "gerris_erfolgs_tracker.gamification.update_gamification_on_completion",
        lambda todo, stats: GamificationState(),
    )

    todo = TodoItem(
        title="Already done",
        quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        completed=True,
        completed_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
    )
    st.session_state[SS_TODOS] = [todo.model_dump()]

    updated = toggle_complete(todo.id)

    assert updated is not None
    assert updated.completed is False
    assert calls == {"kpis": 0, "gamification": 0}
