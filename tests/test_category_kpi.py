from __future__ import annotations

from datetime import date, datetime, timezone

from gerris_erfolgs_tracker.kpi import (
    aggregate_category_kpis,
    last_7_days_completions_by_category,
)
from gerris_erfolgs_tracker.models import Category, TodoItem
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant


def _todo(
    title: str,
    *,
    category: Category,
    completed: bool,
    completed_at: datetime | None,
) -> TodoItem:
    return TodoItem(
        title=title,
        quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        category=category,
        completed=completed,
        completed_at=completed_at,
    )


def test_aggregate_category_kpis_tracks_counts_and_streaks() -> None:
    today = date(2024, 1, 10)
    todos = [
        _todo(
            "open job search",
            category=Category.JOB_SEARCH,
            completed=False,
            completed_at=None,
        ),
        _todo(
            "job search done today",
            category=Category.JOB_SEARCH,
            completed=True,
            completed_at=datetime(2024, 1, 10, 9, 0, tzinfo=timezone.utc),
        ),
        _todo(
            "admin yesterday",
            category=Category.ADMIN,
            completed=True,
            completed_at=datetime(2024, 1, 9, 12, 0, tzinfo=timezone.utc),
        ),
        _todo(
            "admin two days ago",
            category=Category.ADMIN,
            completed=True,
            completed_at=datetime(2024, 1, 8, 18, 0, tzinfo=timezone.utc),
        ),
        _todo(
            "drug support older",
            category=Category.DRUGS,
            completed=True,
            completed_at=datetime(2024, 1, 5, 8, 0, tzinfo=timezone.utc),
        ),
    ]

    goals: dict[str, int] = {
        Category.JOB_SEARCH.value: 2,
        Category.ADMIN.value: 1,
        Category.DRUGS.value: 0,
        Category.ISSUES.value: 0,
    }
    snapshots = aggregate_category_kpis(
        todos,
        category_goals=goals,
        today=today,
        fallback_streak=4,
    )

    job_search = snapshots[Category.JOB_SEARCH]
    assert job_search.done_today == 1
    assert job_search.open_count == 1
    assert job_search.goal_progress == 0.5

    admin = snapshots[Category.ADMIN]
    assert admin.done_total == 2
    assert admin.streak == 2
    assert admin.goal_progress == 0.0

    drugs = snapshots[Category.DRUGS]
    assert drugs.daily_goal == 0
    assert drugs.goal_progress == 0.0
    assert drugs.streak == 1

    issues = snapshots[Category.ISSUES]
    assert issues.daily_goal == 0
    assert issues.goal_progress == 0.0
    assert issues.streak == 4

    daily_structure = snapshots[Category.DAILY_STRUCTURE]
    assert daily_structure.streak == 4
    assert daily_structure.goal_progress == 0.0


def test_last_7_days_counts_by_category() -> None:
    today = date(2024, 1, 10)
    todos = [
        _todo(
            "job today",
            category=Category.JOB_SEARCH,
            completed=True,
            completed_at=datetime(2024, 1, 10, 10, 0, tzinfo=timezone.utc),
        ),
        _todo(
            "admin yesterday",
            category=Category.ADMIN,
            completed=True,
            completed_at=datetime(2024, 1, 9, 10, 0, tzinfo=timezone.utc),
        ),
        _todo(
            "friends earlier",
            category=Category.FRIENDS_FAMILY,
            completed=True,
            completed_at=datetime(2024, 1, 6, 14, 0, tzinfo=timezone.utc),
        ),
        _todo(
            "old task",
            category=Category.DAILY_STRUCTURE,
            completed=True,
            completed_at=datetime(2023, 12, 31, 10, 0, tzinfo=timezone.utc),
        ),
    ]

    weekly = last_7_days_completions_by_category(todos, today=today)
    assert len(weekly) == 7
    assert weekly[0]["date"] == date(2024, 1, 4).isoformat()

    counts_by_date = {entry["date"]: entry["counts"] for entry in weekly}
    assert counts_by_date[date(2024, 1, 10).isoformat()][Category.JOB_SEARCH.value] == 1
    assert counts_by_date[date(2024, 1, 9).isoformat()][Category.ADMIN.value] == 1
    assert counts_by_date[date(2024, 1, 6).isoformat()][Category.FRIENDS_FAMILY.value] == 1
    assert counts_by_date[date(2024, 1, 7).isoformat()][Category.ISSUES.value] == 0
    assert counts_by_date[date(2024, 1, 4).isoformat()][Category.DAILY_STRUCTURE.value] == 0
