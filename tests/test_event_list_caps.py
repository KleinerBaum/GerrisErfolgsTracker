from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from gerris_erfolgs_tracker.constants import (
    GAMIFICATION_HISTORY_LIMIT,
    PROCESSED_COMPLETIONS_LIMIT,
    PROCESSED_JOURNAL_EVENTS_LIMIT,
    PROCESSED_PROGRESS_EVENTS_LIMIT,
    SS_GAMIFICATION,
    SS_TODOS,
)
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.gamification import award_journal_points, update_gamification_on_completion
from gerris_erfolgs_tracker.kpis import KpiStats
from gerris_erfolgs_tracker.models import GamificationState, TodoItem
from gerris_erfolgs_tracker.state import get_todos
from gerris_erfolgs_tracker.todos import update_todo_progress


def test_processed_progress_events_are_capped(session_state: dict[str, object]) -> None:
    todo = TodoItem(title="Cap progress", quadrant=EisenhowerQuadrant.URGENT_IMPORTANT)
    session_state[SS_TODOS] = [todo.model_dump()]

    for index in range(PROCESSED_PROGRESS_EVENTS_LIMIT + 25):
        update_todo_progress(todo, delta=1, source_event_id=f"evt-{index}")

    updated = get_todos()[0]

    assert len(updated.processed_progress_events) == PROCESSED_PROGRESS_EVENTS_LIMIT
    assert updated.processed_progress_events[-1] == f"evt-{PROCESSED_PROGRESS_EVENTS_LIMIT + 24}"

    final_progress = updated.progress_current
    dedup_result = update_todo_progress(updated, delta=5, source_event_id=updated.processed_progress_events[-1])
    assert dedup_result is not None
    assert dedup_result.id == updated.id
    assert dedup_result.progress_current == final_progress


def test_processed_completions_and_history_are_capped(session_state: dict[str, object]) -> None:
    stats = KpiStats()
    base_timestamp = datetime(2024, 1, 1, 8, 0, tzinfo=timezone.utc)
    last_todo: TodoItem | None = None

    for index in range(PROCESSED_COMPLETIONS_LIMIT + 50):
        last_todo = TodoItem(
            title=f"Todo {index}",
            quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
            completed=True,
            completed_at=base_timestamp + timedelta(minutes=index),
        )
        update_gamification_on_completion(last_todo, stats)

    state = GamificationState.model_validate(session_state[SS_GAMIFICATION])

    assert len(state.processed_completions) == PROCESSED_COMPLETIONS_LIMIT
    assert len(state.history) == GAMIFICATION_HISTORY_LIMIT

    assert last_todo is not None
    points_before = state.points
    repeated = update_gamification_on_completion(last_todo, stats)
    assert repeated.points == points_before
    assert len(repeated.processed_completions) == PROCESSED_COMPLETIONS_LIMIT


def test_journal_events_and_history_are_capped(session_state: dict[str, object]) -> None:
    base_date = date(2024, 1, 1)
    last_index = PROCESSED_JOURNAL_EVENTS_LIMIT + 74

    for index in range(PROCESSED_JOURNAL_EVENTS_LIMIT + 75):
        award_journal_points(
            entry_date=base_date + timedelta(days=index),
            target_title=f"Entry {index}",
            points=3,
            rationale="Test",  # noqa: S106 - test data
        )

    state = GamificationState.model_validate(session_state[SS_GAMIFICATION])

    assert len(state.processed_journal_events) == PROCESSED_JOURNAL_EVENTS_LIMIT
    assert len(state.history) == GAMIFICATION_HISTORY_LIMIT

    points_before = state.points
    repeated = award_journal_points(
        entry_date=base_date + timedelta(days=last_index),
        target_title=f"Entry {last_index}",
        points=3,
        rationale="Test",  # noqa: S106 - test data
    )
    assert repeated.points == points_before
    assert len(repeated.processed_journal_events) == PROCESSED_JOURNAL_EVENTS_LIMIT
