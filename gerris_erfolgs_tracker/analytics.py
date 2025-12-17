from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Iterable, Sequence, TypedDict

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import Category, TodoItem


@dataclass
class CycleTimeMetrics:
    average: timedelta | None
    median: timedelta | None
    count: int


@dataclass
class BacklogHealth:
    open_count: int
    overdue_count: int
    overdue_ratio: float


class HeatmapEntry(TypedDict):
    date: str
    completions: int


def _durations_from_todos(todos: Iterable[TodoItem]) -> list[timedelta]:
    durations: list[timedelta] = []
    for todo in todos:
        if not todo.completed or todo.completed_at is None:
            continue
        closed_at = todo.completed_at.astimezone(timezone.utc)
        created_at = todo.created_at.astimezone(timezone.utc)
        durations.append(closed_at - created_at)
    return durations


def _build_cycle_time_metrics(durations: list[timedelta]) -> CycleTimeMetrics:
    if not durations:
        return CycleTimeMetrics(average=None, median=None, count=0)

    average_duration = sum((duration for duration in durations), timedelta()) / len(durations)
    median_seconds = median(duration.total_seconds() for duration in durations)
    median_duration = timedelta(seconds=median_seconds)
    return CycleTimeMetrics(average=average_duration, median=median_duration, count=len(durations))


def calculate_cycle_time(todos: Sequence[TodoItem]) -> CycleTimeMetrics:
    """Calculate overall cycle time (created -> completed)."""

    durations = _durations_from_todos(todos)
    return _build_cycle_time_metrics(durations)


def calculate_cycle_time_by_category(todos: Sequence[TodoItem]) -> dict[Category, CycleTimeMetrics]:
    grouped: defaultdict[Category, list[timedelta]] = defaultdict(list)
    for todo in todos:
        if not todo.completed or todo.completed_at is None:
            continue
        duration = todo.completed_at.astimezone(timezone.utc) - todo.created_at.astimezone(timezone.utc)
        grouped[todo.category].append(duration)

    return {category: _build_cycle_time_metrics(durations) for category, durations in grouped.items()}


def calculate_cycle_time_by_quadrant(todos: Sequence[TodoItem]) -> dict[EisenhowerQuadrant, CycleTimeMetrics]:
    grouped: defaultdict[EisenhowerQuadrant, list[timedelta]] = defaultdict(list)
    for todo in todos:
        if not todo.completed or todo.completed_at is None:
            continue
        duration = todo.completed_at.astimezone(timezone.utc) - todo.created_at.astimezone(timezone.utc)
        grouped[todo.quadrant].append(duration)

    return {quadrant: _build_cycle_time_metrics(durations) for quadrant, durations in grouped.items()}


def calculate_backlog_health(todos: Sequence[TodoItem], *, now: datetime | None = None) -> BacklogHealth:
    """Compute open backlog size and overdue ratio based on due dates."""

    reference_time = now or datetime.now(timezone.utc)
    open_items = [todo for todo in todos if not todo.completed]
    overdue_items = [
        todo
        for todo in open_items
        if todo.due_date is not None and todo.due_date.astimezone(timezone.utc) < reference_time
    ]

    open_count = len(open_items)
    overdue_count = len(overdue_items)
    overdue_ratio = overdue_count / open_count if open_count else 0.0
    return BacklogHealth(open_count=open_count, overdue_count=overdue_count, overdue_ratio=overdue_ratio)


def build_completion_heatmap(
    todos: Sequence[TodoItem], *, days: int = 30, today: date | None = None
) -> list[HeatmapEntry]:
    """Return completion counts per day for the selected time window."""

    current_day = today or datetime.now(timezone.utc).date()
    window = [current_day - timedelta(days=offset) for offset in range(days - 1, -1, -1)]
    counts = {day: 0 for day in window}

    for todo in todos:
        if not todo.completed or todo.completed_at is None:
            continue
        completion_day = todo.completed_at.astimezone(timezone.utc).date()
        if completion_day in counts:
            counts[completion_day] += 1

    return [HeatmapEntry(date=day.isoformat(), completions=counts[day]) for day in window]


__all__ = [
    "BacklogHealth",
    "CycleTimeMetrics",
    "HeatmapEntry",
    "build_completion_heatmap",
    "calculate_backlog_health",
    "calculate_cycle_time",
    "calculate_cycle_time_by_category",
    "calculate_cycle_time_by_quadrant",
]
