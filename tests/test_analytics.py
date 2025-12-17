from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest

from gerris_erfolgs_tracker.analytics import (
    build_completion_heatmap,
    calculate_backlog_health,
    calculate_cycle_time,
    calculate_cycle_time_by_category,
    calculate_cycle_time_by_quadrant,
)
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import Category, TodoItem


def _todo(
    *,
    title: str,
    created_at: datetime,
    completed_at: datetime | None = None,
    completed: bool = False,
    due_date: datetime | None = None,
    category: Category = Category.DAILY_STRUCTURE,
    quadrant: EisenhowerQuadrant = EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
) -> TodoItem:
    return TodoItem(
        title=title,
        quadrant=quadrant,
        category=category,
        created_at=created_at,
        completed=completed,
        completed_at=completed_at,
        due_date=due_date,
    )


def test_cycle_time_calculations_with_timezone() -> None:
    base = datetime(2024, 1, 1, 8, 0, tzinfo=timezone.utc)
    todos = [
        _todo(
            title="fast",
            category=Category.JOB_SEARCH,
            quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
            created_at=base,
            completed=True,
            completed_at=base + timedelta(hours=4),
        ),
        _todo(
            title="slow",
            category=Category.ADMIN,
            quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
            created_at=base,
            completed=True,
            completed_at=base + timedelta(days=2),
        ),
    ]

    overall = calculate_cycle_time(todos)
    assert overall.count == 2
    assert overall.median == timedelta(days=1, hours=2)
    assert overall.average == timedelta(days=1, hours=2)

    by_category = calculate_cycle_time_by_category(todos)
    assert by_category[Category.JOB_SEARCH].median == timedelta(hours=4)
    assert by_category[Category.ADMIN].average == timedelta(days=2)

    by_quadrant = calculate_cycle_time_by_quadrant(todos)
    assert by_quadrant[EisenhowerQuadrant.URGENT_IMPORTANT].count == 1
    assert by_quadrant[EisenhowerQuadrant.NOT_URGENT_IMPORTANT].median == timedelta(days=2)


def test_backlog_health_overdue_ratio() -> None:
    now = datetime(2024, 2, 1, tzinfo=timezone.utc)
    todos = [
        _todo(
            title="overdue",
            created_at=now - timedelta(days=3),
            due_date=now - timedelta(days=1),
            completed=False,
        ),
        _todo(
            title="future",
            created_at=now - timedelta(days=2),
            due_date=now + timedelta(days=2),
            completed=False,
        ),
        _todo(
            title="done",
            created_at=now - timedelta(days=4),
            completed=True,
            completed_at=now - timedelta(days=1),
            due_date=now - timedelta(days=1),
        ),
    ]

    health = calculate_backlog_health(todos, now=now)
    assert health.open_count == 2
    assert health.overdue_count == 1
    assert health.overdue_ratio == pytest.approx(0.5)


def test_completion_heatmap_window_and_counts() -> None:
    today = date(2024, 3, 10)
    today_dt = datetime(2024, 3, 10, 9, 0, tzinfo=timezone.utc)
    todos = [
        _todo(
            title="yesterday",
            created_at=today_dt - timedelta(days=2),
            completed=True,
            completed_at=today_dt - timedelta(days=1),
        ),
        _todo(
            title="last week",
            created_at=today_dt - timedelta(days=8),
            completed=True,
            completed_at=today_dt - timedelta(days=6),
        ),
        _todo(
            title="too old",
            created_at=today_dt - timedelta(days=40),
            completed=True,
            completed_at=today_dt - timedelta(days=35),
        ),
    ]

    heatmap = build_completion_heatmap(todos, days=7, today=today)
    assert len(heatmap) == 7
    totals = [entry["completions"] for entry in heatmap]
    assert sum(totals) == 2
    assert heatmap[-1]["completions"] == 0  # today
    assert heatmap[-2]["completions"] == 1  # yesterday
    assert any(entry["completions"] == 1 for entry in heatmap)
