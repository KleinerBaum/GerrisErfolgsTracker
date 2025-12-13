from __future__ import annotations

from gerris_erfolgs_tracker.gamification import get_gamification_state
from gerris_erfolgs_tracker.kpis import get_kpi_stats
from gerris_erfolgs_tracker.todos import add_todo, update_todo_progress
from gerris_erfolgs_tracker.state import init_state
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant


def test_progress_auto_completes_once(session_state: dict[str, object]) -> None:
    init_state()

    todo = add_todo(
        title="Read pages",
        quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        progress_target=2.0,
        progress_current=1.0,
        progress_unit="pages",
    )

    updated = update_todo_progress(todo, delta=1.5, source_event_id="evt-1")
    assert updated is not None
    assert updated.completed is True
    assert updated.progress_current == 2.5

    stats = get_kpi_stats()
    assert stats.done_total == 1

    gamification = get_gamification_state()
    assert len(gamification.processed_completions) == 1

    updated_again = update_todo_progress(updated, delta=1.0, source_event_id="evt-2")
    assert updated_again is not None
    assert updated_again.completed is True
    assert updated_again.progress_current == 3.5
    assert len(get_gamification_state().processed_completions) == 1


def test_reapplying_same_event_id_is_ignored(session_state: dict[str, object]) -> None:
    init_state()

    todo = add_todo(
        title="Walk",
        quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        progress_target=1.0,
        progress_current=0.5,
        progress_unit="km",
    )

    first_update = update_todo_progress(todo, delta=0.5, source_event_id="evt-duplicate")
    assert first_update is not None
    stats_after_first = get_kpi_stats()
    gamification_after_first = get_gamification_state()

    second_update = update_todo_progress(todo, delta=0.5, source_event_id="evt-duplicate")
    assert second_update is not None
    assert second_update.progress_current == first_update.progress_current
    assert get_kpi_stats().done_total == stats_after_first.done_total
    assert len(get_gamification_state().processed_completions) == len(gamification_after_first.processed_completions)
