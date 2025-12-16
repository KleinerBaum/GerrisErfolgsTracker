from __future__ import annotations

from datetime import datetime, timezone

from gerris_erfolgs_tracker.constants import SS_STATS
from gerris_erfolgs_tracker.kpi import count_new_tasks_last_7_days
from gerris_erfolgs_tracker.kpis import update_goal_daily, update_kpis_on_completion
from gerris_erfolgs_tracker.models import Category, EisenhowerQuadrant, KpiStats, TodoItem


def test_update_kpis_tracks_streak_and_goal(session_state: dict[str, object]) -> None:
    first_completion = datetime(2024, 1, 1, 8, 0, tzinfo=timezone.utc)
    second_completion = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    third_completion = datetime(2024, 1, 1, 18, 0, tzinfo=timezone.utc)
    next_day_completion = datetime(2024, 1, 2, 9, 0, tzinfo=timezone.utc)

    stats = update_kpis_on_completion(first_completion)
    assert stats.done_today == 1
    assert stats.streak == 1
    assert stats.goal_hit_today is False

    stats = update_kpis_on_completion(second_completion)
    stats = update_kpis_on_completion(third_completion)
    assert stats.done_today == 3
    assert stats.goal_hit_today is True

    stats = update_kpis_on_completion(next_day_completion)
    assert stats.done_today == 1
    assert stats.streak == 2
    assert stats.goal_hit_today is False
    assert stats.goal_history[-1] is True

    assert len(stats.daily_history) >= 2
    assert stats.daily_history[-1].completions == 1


def test_update_goal_daily_enforces_minimum(session_state: dict[str, object]) -> None:
    session_state[SS_STATS] = KpiStats(done_today=2, goal_daily=5).model_dump()

    stats = update_goal_daily(1)
    assert stats.goal_daily == 1
    assert stats.goal_hit_today is True

    stats = update_goal_daily(0)
    assert stats.goal_daily == 1


def test_count_new_tasks_last_7_days_filters_by_window() -> None:
    today = datetime(2024, 2, 8, tzinfo=timezone.utc).date()
    in_window = TodoItem(
        title="Recent",
        quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        category=Category.JOB_SEARCH,
        created_at=datetime(2024, 2, 6, tzinfo=timezone.utc),
    )
    boundary = TodoItem(
        title="Boundary",
        quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        category=Category.DAILY_STRUCTURE,
        created_at=datetime(2024, 2, 2, tzinfo=timezone.utc),
    )
    out_of_window = TodoItem(
        title="Old",
        quadrant=EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT,
        category=Category.ADMIN,
        created_at=datetime(2024, 1, 30, tzinfo=timezone.utc),
    )

    count = count_new_tasks_last_7_days([in_window, boundary, out_of_window], today=today)

    assert count == 2
