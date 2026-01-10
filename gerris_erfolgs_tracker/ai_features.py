from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Generic, Mapping, Optional, Sequence, TypeVar

from openai import OpenAI
from openai.types.responses import FileSearchTool, WebSearchTool

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant, ensure_quadrant, sort_todos
from gerris_erfolgs_tracker.kpis import get_kpi_stats
from gerris_erfolgs_tracker.llm import (
    LLMError,
    get_default_model,
    get_openai_client,
    request_structured_response,
)
from gerris_erfolgs_tracker.llm_schemas import (
    DailyFocusRecommendation,
    DailyPlanningSuggestion,
    EmailDraft,
    GoalSuggestion,
    MilestoneSuggestionItem,
    MilestoneSuggestionList,
    Motivation,
    QuadrantName,
    TodoCategorization,
)
from gerris_erfolgs_tracker.models import GamificationMode, JournalEntry, KpiStats, TodoItem

PayloadT = TypeVar("PayloadT")


@dataclass
class AISuggestion(Generic[PayloadT]):
    payload: PayloadT
    from_ai: bool


def _fallback_quadrant(todo_title: str) -> TodoCategorization:
    lowered = todo_title.lower()
    if any(keyword in lowered for keyword in ("urgent", "dringend", "heute")):
        quadrant = QuadrantName.URGENT_IMPORTANT
        rationale = "Dringende Stichworte erkannt."
    elif any(keyword in lowered for keyword in ("planung", "strategie", "vision")):
        quadrant = QuadrantName.NOT_URGENT_IMPORTANT
        rationale = "Strategischer Kontext."
    else:
        quadrant = QuadrantName.NOT_URGENT_NOT_IMPORTANT
        rationale = "Standard-Fallback."

    return TodoCategorization(quadrant=quadrant, rationale=rationale)


def suggest_quadrant(todo_title: str, client: Optional[OpenAI] = None) -> AISuggestion[TodoCategorization]:
    if not todo_title.strip():
        return AISuggestion(_fallback_quadrant(todo_title), from_ai=False)

    client_to_use = client or get_openai_client()
    model = get_default_model(reasoning=False)

    if client_to_use:
        try:
            result = request_structured_response(
                client=client_to_use,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Classify the todo into an Eisenhower quadrant."
                            "Return concise rationale in German or English."
                            "Use the schema strictly."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Todo: {todo_title}",
                    },
                ],
                response_model=TodoCategorization,
            )
            return AISuggestion(result, from_ai=True)
        except LLMError:
            pass

    return AISuggestion(_fallback_quadrant(todo_title), from_ai=False)


def _fallback_goals(stats: KpiStats) -> GoalSuggestion:
    baseline = max(stats.goal_daily, 1)
    if stats.streak >= 5:
        goal = baseline + 1
        focus = "Momentum halten."
    else:
        goal = baseline
        focus = "Ruhig starten."

    tips = [
        "Blocke 30 Minuten fuer die wichtigste Aufgabe.",
        "Nutze die Eisenhower-Quadranten bewusst.",
    ]
    return GoalSuggestion(daily_goal=goal, focus=focus, tips=tips)


def suggest_goals(stats: Optional[KpiStats] = None, client: Optional[OpenAI] = None) -> AISuggestion[GoalSuggestion]:
    active_stats = stats or get_kpi_stats()
    client_to_use = client or get_openai_client()
    model = get_default_model(reasoning=True)

    if client_to_use:
        try:
            result = request_structured_response(
                client=client_to_use,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Generate a daily goal suggestion based on KPI stats."
                            "Keep numbers realistic and short, bilingual (DE/EN)."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            "Current KPIs: "
                            f"done_total={active_stats.done_total},"
                            f" done_today={active_stats.done_today},"
                            f" streak={active_stats.streak},"
                            f" goal_daily={active_stats.goal_daily}"
                        ),
                    },
                ],
                response_model=GoalSuggestion,
            )
            return AISuggestion(result, from_ai=True)
        except LLMError:
            pass

    return AISuggestion(_fallback_goals(active_stats), from_ai=False)


def _recent_mood_hint(journal_entries: Mapping[date, JournalEntry] | None) -> str:
    if not journal_entries:
        return ""

    latest_date = max(journal_entries.keys())
    latest_entry = journal_entries[latest_date]
    moods = ", ".join(tag.strip() for tag in latest_entry.moods if tag.strip())
    note = latest_entry.mood_notes.strip()

    if moods and note:
        return f"Letzter Stimmungseintrag: {moods} – {note}"
    if moods:
        return f"Letzter Stimmungseintrag: {moods}"
    if note:
        return f"Letzte Notiz: {note}"
    return ""


def _todo_focus_rank(todo: TodoItem) -> tuple[int, datetime, int, datetime]:
    def _as_utc(value: datetime | None) -> datetime:
        if value is None:
            return datetime.max.replace(tzinfo=timezone.utc)
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    quadrant_rank = {
        EisenhowerQuadrant.URGENT_IMPORTANT: 0,
        EisenhowerQuadrant.NOT_URGENT_IMPORTANT: 1,
        EisenhowerQuadrant.URGENT_NOT_IMPORTANT: 2,
        EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT: 3,
    }
    return (
        quadrant_rank.get(ensure_quadrant(todo.quadrant), 3),
        _as_utc(todo.due_date),
        todo.priority,
        _as_utc(todo.created_at),
    )


def _fallback_daily_plan(
    *, todos: Sequence[TodoItem], stats: KpiStats, journal_entries: Mapping[date, JournalEntry] | None
) -> DailyPlanningSuggestion:
    open_tasks = [task for task in todos if not task.completed]
    ranked = sorted(open_tasks, key=_todo_focus_rank)[:3]
    mood_note = _recent_mood_hint(journal_entries)
    streak_info = f"Streak: {stats.streak}" if stats.streak else "Neue Woche, neuer Start"
    focus_items: list[DailyFocusRecommendation] = []

    for task in ranked:
        due_label = task.due_date.date().isoformat() if task.due_date else None
        recommendation = (
            "Starte mit diesem Fokusblock (Quadrant II), dann dringende Punkte einsammeln. / "
            "Start with this Quadrant II focus block, then sweep urgent items."
        )
        priority_hint = f"Priorität {task.priority}"
        focus_items.append(
            DailyFocusRecommendation(
                title=task.title,
                quadrant=QuadrantName(task.quadrant.value),
                due_date=due_label,
                recommendation=recommendation,
                priority_hint=priority_hint,
            )
        )

    headline = "Heute: mindestens eine wichtige, nicht dringende Aufgabe einplanen. / Today: schedule one important, non-urgent task."
    buffer_tip = (
        "Plane einen 30-Minuten-Puffer nach jedem Block ein, besonders wenn gestern Stress da war. / "
        "Add a 30-minute buffer after each block, especially if yesterday felt stressful."
    )
    mood_advice = mood_note or "Kurzer Check-in: Energie und Stimmung notieren. / Quick check-in: note energy and mood."

    return DailyPlanningSuggestion(
        headline=f"{headline} {streak_info}",
        mood_advice=mood_advice,
        focus_items=focus_items,
        buffer_tip=buffer_tip,
    )


def suggest_daily_plan(
    *,
    todos: Sequence[TodoItem],
    stats: Optional[KpiStats],
    journal_entries: Mapping[date, JournalEntry] | None,
    client: Optional[OpenAI] = None,
) -> AISuggestion[DailyPlanningSuggestion]:
    active_stats = stats or get_kpi_stats()
    open_tasks = [task for task in todos if not task.completed]
    task_snapshot = [
        {
            "title": task.title,
            "quadrant": task.quadrant.value,
            "priority": task.priority,
            "due_date": task.due_date.isoformat() if task.due_date else None,
        }
        for task in sort_todos(open_tasks, by="due_date")[:6]
    ]
    mood_note = _recent_mood_hint(journal_entries)

    client_to_use = client or get_openai_client()
    model = get_default_model(reasoning=True)

    if client_to_use and open_tasks:
        try:
            suggestion = request_structured_response(
                client=client_to_use,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Du bist ein Tagesplan-Coach. Analysiere Aufgaben (Quadrant, Priorität, Fälligkeit) "
                            "und die aktuelle Streak. Baue Hinweise aus den letzten Stimmungsnotizen ein. "
                            "Antwort stets zweisprachig (DE/EN) im vorgegebenen Schema. Keine Diagnosen."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            "Kontext: "
                            f"Streak={active_stats.streak}, Tagesziel={active_stats.goal_daily}. "
                            f"Aufgaben: {task_snapshot}. "
                            f"Stimmung: {mood_note or 'keine Angabe'}."
                        ),
                    },
                ],
                response_model=DailyPlanningSuggestion,
            )
            return AISuggestion(suggestion, from_ai=True)
        except LLMError:
            pass

    return AISuggestion(
        _fallback_daily_plan(todos=todos, stats=active_stats, journal_entries=journal_entries),
        from_ai=False,
    )


def _fallback_milestones(todo_title: str) -> MilestoneSuggestionList:
    base = todo_title.strip() or "Aufgabe"
    items = [
        MilestoneSuggestionItem(
            title=f"Ersten Schritt planen ({base})",
            complexity="small",
            rationale="Fallback-Vorschlag",
        ),
        MilestoneSuggestionItem(
            title=f"Zwischenstand dokumentieren ({base})",
            complexity="medium",
            rationale="Fallback-Vorschlag",
        ),
        MilestoneSuggestionItem(
            title=f"Finalisierung und Test ({base})",
            complexity="large",
            rationale="Fallback-Vorschlag",
        ),
    ]
    return MilestoneSuggestionList(milestones=items)


def _infer_email_type(title: str, context: str) -> str:
    lowered = f"{title} {context}".lower()
    mapping = {
        "bewerbung": "Bewerbungsschreiben",
        "application": "Application",
        "follow-up": "Follow-up",
        "nachfrage": "Nachfrage",
        "reminder": "Reminder",
        "rechnung": "Rechnung",
        "invoice": "Invoice",
        "angebot": "Angebot",
        "proposal": "Proposal",
        "feedback": "Feedback",
    }
    for keyword, label in mapping.items():
        if keyword in lowered:
            return label
    return "Allgemeine Anfrage"


def _email_language_label(language: str) -> str:
    return "en" if language.strip().lower().startswith("en") else "de"


def _fallback_email_draft(
    *,
    title: str,
    context: str,
    recipient: str,
    tone: str,
    language: str,
    length: str,
) -> EmailDraft:
    normalized_language = _email_language_label(language)
    email_type = _infer_email_type(title, context)
    if normalized_language == "en" and email_type == "Allgemeine Anfrage":
        email_type = "General inquiry"
    subject = title.strip()
    if not subject:
        subject = "Allgemeine Anfrage" if normalized_language == "de" else "General inquiry"

    if normalized_language == "de":
        salutation = f"Hallo{f' {recipient}' if recipient.strip() else ''},"
        closing = "Viele Grüße"
        intro = "ich melde mich mit folgendem Anliegen:"
        context_fallback = context.strip() or "Gern teile ich die wichtigsten Punkte."
        outro = "Vielen Dank für Ihre Zeit und Unterstützung."
    else:
        salutation = f"Hello{f' {recipient}' if recipient.strip() else ''},"
        closing = "Best regards"
        intro = "I am reaching out with the following request:"
        context_fallback = context.strip() or "Here are the key points."
        outro = "Thank you for your time and support."

    detail_lines = [intro, "", context_fallback]
    if length == "long":
        follow_up = (
            "Ich freue mich auf Ihre Rückmeldung." if normalized_language == "de" else "I look forward to your reply."
        )
        detail_lines.extend(["", outro, "", follow_up])
    elif length == "short":
        detail_lines.append("")
    else:
        detail_lines.extend(["", outro])

    body_md = "\n".join(line for line in detail_lines if line is not None)

    return EmailDraft(
        email_type=email_type,
        subject=subject,
        body_md=body_md,
        tone=tone,
        language=normalized_language,
        salutation=salutation,
        closing=closing,
    )


def _email_tools() -> list[object]:
    tools: list[object] = [WebSearchTool(type="web_search")]
    vector_store_id = os.getenv("VECTOR_STORE_ID")
    if vector_store_id:
        tools.append(FileSearchTool(type="file_search", vector_store_ids=[vector_store_id]))
    return tools


def suggest_email_draft(
    *,
    title: str,
    context: str,
    recipient: str,
    tone: str,
    language: str,
    length: str,
    client: Optional[OpenAI] = None,
) -> AISuggestion[EmailDraft]:
    if not (title.strip() or context.strip()):
        return AISuggestion(
            _fallback_email_draft(
                title=title,
                context=context,
                recipient=recipient,
                tone=tone,
                language=language,
                length=length,
            ),
            from_ai=False,
        )

    client_to_use = client or get_openai_client()
    model = get_default_model(reasoning=False)
    if client_to_use:
        try:
            result = request_structured_response(
                client=client_to_use,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You draft professional emails. Infer the email_type from the context "
                            "(e.g., Bewerbungsschreiben, Follow-up, Anfrage). "
                            "Return a concise, ready-to-send draft in Markdown. "
                            "Do not include the subject in the body. "
                            "If a salutation or closing is appropriate, set the fields; otherwise leave them empty. "
                            "Follow the schema strictly."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Title/subject hint: {title or 'n/a'}\n"
                            f"Context notes: {context or 'n/a'}\n"
                            f"Recipient: {recipient or 'n/a'}\n"
                            f"Tone: {tone}\n"
                            f"Length preference: {length}\n"
                            f"Language: {language}\n"
                        ),
                    },
                ],
                response_model=EmailDraft,
                tools=_email_tools(),
            )
            return AISuggestion(result, from_ai=True)
        except LLMError:
            pass

    return AISuggestion(
        _fallback_email_draft(
            title=title,
            context=context,
            recipient=recipient,
            tone=tone,
            language=language,
            length=length,
        ),
        from_ai=False,
    )


def suggest_milestones(
    todo_title: str,
    *,
    gamification_mode: GamificationMode,
    client: Optional[OpenAI] = None,
) -> AISuggestion[MilestoneSuggestionList]:
    if not todo_title.strip():
        return AISuggestion(_fallback_milestones(todo_title), from_ai=False)

    if client is None:
        return AISuggestion(_fallback_milestones(todo_title), from_ai=False)

    client_to_use = client or get_openai_client()
    model = get_default_model(reasoning=True)

    if client_to_use:
        try:
            result = request_structured_response(
                client=client_to_use,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You generate concise milestones for a task. "
                            "Return 3-5 items, bilingual DE/EN titles. "
                            "Adjust complexity (small/medium/large) and keep rationales short."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            f"Task: {todo_title}. Gamification mode: {gamification_mode.label}. "
                            "Provide realistic, actionable sub-steps."
                        ),
                    },
                ],
                response_model=MilestoneSuggestionList,
            )
            return AISuggestion(result, from_ai=True)
        except LLMError:
            pass

    return AISuggestion(_fallback_milestones(todo_title), from_ai=False)


def generate_motivation(stats: Optional[KpiStats] = None, client: Optional[OpenAI] = None) -> AISuggestion[str]:
    active_stats = stats or get_kpi_stats()
    client_to_use = client or get_openai_client()
    model = get_default_model(reasoning=False)

    if client_to_use:
        try:
            result = request_structured_response(
                client=client_to_use,
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Craft a brief motivational sentence with the given tone."
                            "Keep it bilingual (DE/EN) when possible."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            "KPIs: "
                            f"Total={active_stats.done_total},"
                            f" Today={active_stats.done_today},"
                            f" Streak={active_stats.streak},"
                            f" Goal={active_stats.goal_daily}"
                        ),
                    },
                ],
                response_model=Motivation,
            )
            return AISuggestion(result.message, from_ai=True)
        except LLMError:
            pass

    fallback = "Weiter so! Jede Aufgabe bringt dich näher ans Ziel."
    return AISuggestion(fallback, from_ai=False)


__all__ = [
    "AISuggestion",
    "generate_motivation",
    "suggest_email_draft",
    "suggest_daily_plan",
    "suggest_milestones",
    "suggest_goals",
    "suggest_quadrant",
]
