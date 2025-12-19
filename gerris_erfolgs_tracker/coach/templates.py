from __future__ import annotations

from datetime import datetime

from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.coach.models import CoachMessage


def _default_now(event: CoachEvent) -> datetime:
    created_at = event.created_at
    if created_at.tzinfo is None:
        return created_at
    return created_at.astimezone(created_at.tzinfo)


def _task_completed_message(event: CoachEvent) -> CoachMessage:
    task_title = event.get_context_value("task_title") or "Aufgabe"
    quadrant = event.get_context_value("quadrant") or ""
    title = "🎯 Fortschritt gefeiert" if quadrant else "🎯 Abschluss geschafft"
    body = (
        f"Aufgabe '{task_title}' erledigt." if quadrant == "" else f"Quadrant {quadrant}: '{task_title}' abgehakt."
    )
    return CoachMessage(
        event_id=event.event_id,
        title=title + " / " + "Progress unlocked",
        body=body + " / " + f"Task '{task_title}' completed.",
        created_at=_default_now(event),
        trigger=event.trigger,
        context={"task_id": event.get_context_value("task_id")},
    )


def _overdue_message(event: CoachEvent) -> CoachMessage:
    task_title = event.get_context_value("task_title") or "Aufgabe"
    due_date = event.get_context_value("due_date")
    title = "⏰ Überfällig" + " / " + "⏰ Overdue"
    body = (
        f"'{task_title}' ist überfällig" if due_date is None else f"'{task_title}' war fällig am {due_date}"
    )
    body = body + " / " + (
        f"'{task_title}' is overdue" if due_date is None else f"'{task_title}' was due on {due_date}"
    )
    return CoachMessage(
        event_id=event.event_id,
        title=title,
        body=body,
        created_at=_default_now(event),
        trigger=event.trigger,
        context={"task_id": event.get_context_value("task_id")},
    )


def _due_soon_message(event: CoachEvent) -> CoachMessage:
    task_title = event.get_context_value("task_title") or "Aufgabe"
    due_date = event.get_context_value("due_date") or "bald"
    title = "👀 Fällig bald" + " / " + "👀 Due soon"
    body = f"'{task_title}' steht an ({due_date})." + " / " + f"'{task_title}' is coming up ({due_date})."
    return CoachMessage(
        event_id=event.event_id,
        title=title,
        body=body,
        created_at=_default_now(event),
        trigger=event.trigger,
        context={"task_id": event.get_context_value("task_id")},
    )


def _weekly_review_message(event: CoachEvent) -> CoachMessage:
    title = "🔁 Wochenrückblick" + " / " + "🔁 Weekly review"
    body = (
        "Plane deine Highlights und lerne aus den Ergebnissen." +
        " / " +
        "Plan your highlights and capture learnings from last week."
    )
    return CoachMessage(
        event_id=event.event_id,
        title=title,
        body=body,
        created_at=_default_now(event),
        trigger=event.trigger,
        severity="weekly",
    )


def select_template(event: CoachEvent) -> CoachMessage:
    if event.trigger is CoachTrigger.TASK_COMPLETED:
        return _task_completed_message(event)
    if event.trigger is CoachTrigger.OVERDUE:
        return _overdue_message(event)
    if event.trigger is CoachTrigger.DUE_SOON:
        return _due_soon_message(event)
    if event.trigger is CoachTrigger.WEEKLY:
        return _weekly_review_message(event)
    return _task_completed_message(event)


__all__ = ["select_template"]
