from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Mapping, Sequence, TypedDict

from gerris_erfolgs_tracker.models import Category, TodoItem


@dataclass
class CategoryKpi:
    category: Category
    open_count: int
    done_total: int
    done_today: int
    streak: int
    daily_goal: int
    goal_progress: float


class DailyCategoryCount(TypedDict):
    date: str
    counts: dict[str, int]


def _normalize_goal(raw_goal: int | float | None) -> int:
    try:
        return max(0, int(raw_goal or 0))
    except (TypeError, ValueError):
        return 0


def _calculate_streak(completion_days: Iterable[date]) -> int:
    days = sorted(set(completion_days))
    if not days:
        return 0

    streak = 0
    pointer = days[-1]
    day_lookup = set(days)
    while pointer in day_lookup:
        streak += 1
        pointer -= timedelta(days=1)
    return streak


def aggregate_category_kpis(
    todos: Sequence[TodoItem],
    *,
    category_goals: Mapping[Category | str, int | float] | None = None,
    today: date | None = None,
    fallback_streak: int = 0,
) -> dict[Category, CategoryKpi]:
    current_day = today or datetime.now(timezone.utc).date()
    goals_lookup: dict[Category, int] = {category: 1 for category in Category}
    if category_goals is not None:
        for key, goal in category_goals.items():
            try:
                goals_lookup[Category(key)] = _normalize_goal(goal)
            except ValueError:
                continue

    open_counts: defaultdict[Category, int] = defaultdict(int)
    done_totals: defaultdict[Category, int] = defaultdict(int)
    done_today: defaultdict[Category, int] = defaultdict(int)
    completion_days: defaultdict[Category, list[date]] = defaultdict(list)

    for todo in todos:
        category = todo.category
        if todo.completed:
            done_totals[category] += 1
            if todo.completed_at is not None:
                completion_date = todo.completed_at.astimezone(timezone.utc).date()
                completion_days[category].append(completion_date)
                if completion_date == current_day:
                    done_today[category] += 1
        else:
            open_counts[category] += 1

    snapshots: dict[Category, CategoryKpi] = {}
    for category in Category:
        streak = _calculate_streak(completion_days.get(category, []))
        if streak == 0 and not completion_days.get(category):
            streak = fallback_streak

        daily_goal = goals_lookup.get(category, 1)
        goal_progress = done_today.get(category, 0) / daily_goal if daily_goal > 0 else 0.0
        snapshots[category] = CategoryKpi(
            category=category,
            open_count=open_counts.get(category, 0),
            done_total=done_totals.get(category, 0),
            done_today=done_today.get(category, 0),
            streak=streak,
            daily_goal=daily_goal,
            goal_progress=goal_progress,
        )

    return snapshots


def last_7_days_completions_by_category(
    todos: Sequence[TodoItem], *, today: date | None = None
) -> list[DailyCategoryCount]:
    current_day = today or datetime.now(timezone.utc).date()
    window_days = [current_day - timedelta(days=offset) for offset in range(6, -1, -1)]
    day_lookup = {day: {category: 0 for category in Category} for day in window_days}

    for todo in todos:
        if not todo.completed or todo.completed_at is None:
            continue
        completion_day = todo.completed_at.astimezone(timezone.utc).date()
        if completion_day not in day_lookup:
            continue
        day_lookup[completion_day][todo.category] += 1

    return [
        DailyCategoryCount(
            date=day.isoformat(),
            counts={category.value: counts[category] for category in Category},
        )
        for day, counts in sorted(day_lookup.items())
    ]


def _parse_created_at(raw: Any) -> date | None:
    if isinstance(raw, datetime):
        timestamp = raw if raw.tzinfo is not None else raw.replace(tzinfo=timezone.utc)
        return timestamp.astimezone(timezone.utc).date()

    if isinstance(raw, date):
        return raw

    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None

        normalized = text[:-1] + "+00:00" if text.endswith("Z") else text

        try:
            parsed_dt = datetime.fromisoformat(normalized)
            timestamp = parsed_dt if parsed_dt.tzinfo is not None else parsed_dt.replace(tzinfo=timezone.utc)
            return timestamp.astimezone(timezone.utc).date()
        except ValueError:
            try:
                return date.fromisoformat(text)
            except ValueError:
                return None

    return None


def count_new_tasks_last_7_days(todos: Sequence[TodoItem | Mapping[str, Any]], *, today: date | None = None) -> int:
    """Count todos created within the last 7 days (including today).

    The function accepts either ``TodoItem`` instances or mappings that expose a
    ``created_at`` field. It also tolerates common timestamp formats (datetime,
    date, ISO 8601 strings with or without timezone information).
    """

    current_day = today or datetime.now(timezone.utc).date()
    window_start = current_day - timedelta(days=6)

    count = 0
    for todo in todos:
        created_at = todo.get("created_at") if isinstance(todo, Mapping) else getattr(todo, "created_at", None)
        created_date = _parse_created_at(created_at)
        if created_date is None:
            continue
        if window_start <= created_date <= current_day:
            count += 1

    return count


__all__ = [
    "CategoryKpi",
    "DailyCategoryCount",
    "aggregate_category_kpis",
    "last_7_days_completions_by_category",
    "count_new_tasks_last_7_days",
]
