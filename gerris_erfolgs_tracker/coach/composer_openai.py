from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

import streamlit as st
from pydantic import BaseModel, Field

from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.coach.models import CoachMessage
from gerris_erfolgs_tracker.coach.templates import select_template
from gerris_erfolgs_tracker.constants import AI_ENABLED_KEY
from gerris_erfolgs_tracker.llm import LLMError, get_default_model, get_openai_client, request_structured_response


class CoachMessagePayload(BaseModel):
    """Structured payload returned by the OpenAI composer."""

    title: str
    body: str
    severity: str = "weekly"
    context: Mapping[str, str | None] = Field(default_factory=dict)
    created_at: datetime | str | None = None


def _parse_datetime(value: str | datetime | None) -> datetime:
    if isinstance(value, datetime):
        return value
    if value:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    return datetime.now(timezone.utc)


def _format_tasks(tasks: list[Mapping[str, Any]]) -> str:
    if not tasks:
        return "—"
    formatted = []
    for task in tasks[:5]:
        title = task.get("title", "Aufgabe")
        due = task.get("due_date") or "kein Datum"
        formatted.append(f"• {title} (fällig: {due})")
    return "\n".join(formatted)


def _format_categories(categories: list[Mapping[str, Any]]) -> str:
    if not categories:
        return "—"
    entries = []
    for entry in categories:
        name = entry.get("name", "Kategorie")
        active = entry.get("active", 0)
        neglected = entry.get("neglected", 0)
        entries.append(f"{name}: aktiv={active}, vernachlässigt={neglected}")
    return " | ".join(entries)


def _prepare_weekly_prompt(event: CoachEvent) -> list[dict[str, object]]:
    context = event.context
    done_today = context.get("done_today", 0)
    streak = context.get("streak", 0)
    weekly_done = context.get("weekly_done", 0)
    overdue = _format_tasks(context.get("overdue_tasks", []))
    due_soon = _format_tasks(context.get("due_soon_tasks", []))
    categories = _format_categories(context.get("categories", []))
    trigger_info = f"Trigger: {event.trigger.value}"

    system_prompt = (
        "Du bist ein fokussierter Erfolgs-Coach, der kurze Wochenrückblicke schreibt. "
        "Kein medizinischer Rat, keine Diagnose, keine Krisenhinweise, kein Therapeuten-Rollenspiel."
        "Bleibe respektvoll, motivierend oder tough-love ohne Beleidigungen. "
        "Antwort immer strukturiert im Schema CoachMessage (Pydantic)."
    )

    user_prompt = (
        f"Fakten der Woche:\n"
        f"- Erledigt heute: {done_today}\n"
        f"- Wochen-Summe: {weekly_done}\n"
        f"- Streak: {streak}\n"
        f"- Überfällig:\n{overdue}\n"
        f"- Bald fällig:\n{due_soon}\n"
        f"- Kategorien: {categories}\n"
        f"- {trigger_info}\n"
        "Verfasse einen kurzen Wochenrückblick auf Deutsch/Englisch, max. 4 Sätze, "
        "binde Aufgabenbeispiele ein und motiviere zu klaren nächsten Schritten."
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _compose_weekly(event: CoachEvent) -> CoachMessage:
    client = get_openai_client()
    ai_enabled = bool(st.session_state.get(AI_ENABLED_KEY, False))
    if not client or not ai_enabled:
        return select_template(event)

    model = get_default_model(reasoning=True)
    try:
        parsed = request_structured_response(
            client=client,
            model=model,
            messages=_prepare_weekly_prompt(event),
            response_model=CoachMessagePayload,
        )
    except LLMError:
        return select_template(event)

    return CoachMessage(
        event_id=event.event_id,
        title=parsed.title,
        body=parsed.body,
        created_at=_parse_datetime(parsed.created_at),
        trigger=event.trigger,
        severity=parsed.severity or "weekly",
        context=parsed.context or {"source": "openai"},
    )


def compose_message(event: CoachEvent) -> CoachMessage:
    """Render a coach message with optional OpenAI composition."""

    if event.trigger is CoachTrigger.WEEKLY:
        return _compose_weekly(event)

    return select_template(event)


__all__ = ["compose_message"]
