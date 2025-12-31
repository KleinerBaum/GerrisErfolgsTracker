from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Mapping

from gerris_erfolgs_tracker.coach.engine import process_event
from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.models import KpiStats, TodoItem


def _event_timestamp() -> datetime:
    return datetime.now(timezone.utc)


def _build_overdue_event(todo: TodoItem, today: str) -> CoachEvent:
    event_id = f"coach:overdue:{todo.id}:{today}"
    created_at_iso = _event_timestamp().isoformat()
    return CoachEvent(
        trigger=CoachTrigger.OVERDUE,
        event_id=event_id,
        created_at_iso=created_at_iso,
        context={
            "task_id": todo.id,
            "task_title": todo.title,
            "category": todo.category.value,
            "quadrant": todo.quadrant.value,
            "due_date": todo.due_date.isoformat() if todo.due_date else None,
        },
    )


def _build_due_soon_event(todo: TodoItem, today: str) -> CoachEvent:
    event_id = f"coach:due_soon:{todo.id}:{today}"
    created_at_iso = _event_timestamp().isoformat()
    return CoachEvent(
        trigger=CoachTrigger.DUE_SOON,
        event_id=event_id,
        created_at_iso=created_at_iso,
        context={
            "task_id": todo.id,
            "task_title": todo.title,
            "category": todo.category.value,
            "quadrant": todo.quadrant.value,
            "due_date": todo.due_date.isoformat() if todo.due_date else None,
        },
    )


def _build_weekly_event(now: datetime, *, context: dict[str, object]) -> CoachEvent:
    iso_year, iso_week, _ = now.isocalendar()
    event_id = f"coach:weekly:{iso_year}-W{iso_week:02d}"
    return CoachEvent(
        trigger=CoachTrigger.WEEKLY,
        event_id=event_id,
        created_at_iso=now.isoformat(),
        context=context,
    )


def _summarize_weekly_moods(entries: Mapping[date, object]) -> dict[str, object]:
    if not entries:
        return {}

    window_start = _event_timestamp().date() - timedelta(days=6)
    recent_entries = {entry_date: entry for entry_date, entry in entries.items() if entry_date >= window_start}
    if not recent_entries:
        return {}

    tag_counter: Counter[str] = Counter()
    for entry in recent_entries.values():
        moods = getattr(entry, "moods", []) or []
        tag_counter.update(tag.strip().lower() for tag in moods if tag and tag.strip())

    latest_date = max(recent_entries.keys())
    latest_entry = recent_entries[latest_date]
    latest_note = getattr(latest_entry, "mood_notes", "")

    return {
        "top_tags": [tag for tag, _ in tag_counter.most_common(3)],
        "latest_date": latest_date.isoformat(),
        "latest_note": latest_note.strip(),
    }


def run_daily_coach_scan(todos: Iterable[TodoItem]) -> None:
    now = _event_timestamp()
    today = now.date().isoformat()
    pending = [todo for todo in todos if not todo.completed]

    overdue_candidates = [todo for todo in pending if todo.due_date and todo.due_date < now]
    overdue_sorted = sorted(overdue_candidates, key=lambda todo: todo.due_date or now)[:3]
    for todo in overdue_sorted:
        process_event(_build_overdue_event(todo, today))

    soon_threshold = now + timedelta(hours=48)
    due_soon_candidates = [todo for todo in pending if todo.due_date and now <= todo.due_date <= soon_threshold]
    due_soon_sorted = sorted(due_soon_candidates, key=lambda todo: todo.due_date or now)[:3]
    for todo in due_soon_sorted:
        process_event(_build_due_soon_event(todo, today))


def schedule_weekly_review(*, todos: Iterable[TodoItem] | None = None, stats: KpiStats | None = None) -> None:
    now = _event_timestamp()
    open_tasks = [task for task in todos or [] if not task.completed]
    from gerris_erfolgs_tracker.journal import get_journal_entries

    mood_summary = _summarize_weekly_moods(get_journal_entries())
    overdue_sorted = [task for task in open_tasks if task.due_date and task.due_date < now]
    overdue_sorted = sorted(overdue_sorted, key=lambda todo: todo.due_date or now)[:5]
    soon_threshold = now + timedelta(hours=72)
    due_soon_sorted = [task for task in open_tasks if task.due_date and now <= task.due_date <= soon_threshold]
    due_soon_sorted = sorted(due_soon_sorted, key=lambda todo: todo.due_date or now)[:5]

    category_summary = []
    for category in {task.category for task in open_tasks}:
        active = len([task for task in open_tasks if task.category is category])
        neglected = len([task for task in overdue_sorted if task.category is category])
        category_summary.append(
            {
                "name": category.label,
                "active": active,
                "neglected": neglected,
            }
        )

    weekly_done = 0
    metrics = stats.model_dump() if isinstance(stats, KpiStats) else {}
    if isinstance(stats, KpiStats):
        recent_days = {(now.date() - timedelta(days=offset)) for offset in range(7)}
        weekly_done = sum(entry.completions for entry in stats.daily_history if entry.date in recent_days)

    event_context = {
        "done_today": metrics.get("done_today", 0),
        "streak": metrics.get("streak", 0),
        "weekly_done": weekly_done,
        "overdue_tasks": [
            {"title": task.title, "due_date": task.due_date.isoformat() if task.due_date else None}
            for task in overdue_sorted
        ],
        "due_soon_tasks": [
            {"title": task.title, "due_date": task.due_date.isoformat() if task.due_date else None}
            for task in due_soon_sorted
        ],
        "categories": category_summary,
        "mood_summary": mood_summary,
    }

    event = _build_weekly_event(now, context=event_context)
    process_event(event)


__all__ = ["run_daily_coach_scan", "schedule_weekly_review"]
