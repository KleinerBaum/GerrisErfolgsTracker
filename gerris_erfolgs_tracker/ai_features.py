from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Generic, Mapping, Optional, Sequence, TypeVar

from openai import OpenAI

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
    quadrant_rank = {
        EisenhowerQuadrant.URGENT_IMPORTANT: 0,
        EisenhowerQuadrant.NOT_URGENT_IMPORTANT: 1,
        EisenhowerQuadrant.URGENT_NOT_IMPORTANT: 2,
        EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT: 3,
    }
    due_date = todo.due_date or datetime.max
    return (
        quadrant_rank.get(ensure_quadrant(todo.quadrant), 3),
        due_date,
        todo.priority,
        todo.created_at,
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
    "suggest_daily_plan",
    "suggest_milestones",
    "suggest_goals",
    "suggest_quadrant",
]
