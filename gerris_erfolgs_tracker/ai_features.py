from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Optional, TypeVar

from openai import OpenAI
from gerris_erfolgs_tracker.kpis import get_kpi_stats
from gerris_erfolgs_tracker.llm import (
    LLMError,
    get_default_model,
    get_openai_client,
    request_structured_response,
)
from gerris_erfolgs_tracker.llm_schemas import (
    GoalSuggestion,
    MilestoneSuggestionItem,
    MilestoneSuggestionList,
    Motivation,
    QuadrantName,
    TodoCategorization,
)
from gerris_erfolgs_tracker.models import GamificationMode, KpiStats


PayloadT = TypeVar("PayloadT")


@dataclass
class AISuggestion(Generic[PayloadT]):
    payload: PayloadT
    from_ai: bool


def _fallback_quadrant(todo_title: str) -> TodoCategorization:
    lowered = todo_title.lower()
    if any(keyword in lowered for keyword in ("urgent", "dringend", "heute")):
        quadrant = QuadrantName.URGENT_IMPORTANT
        rationale = "Dringende Stichworte erkannt / Urgent keywords detected."
    elif any(keyword in lowered for keyword in ("planung", "strategie", "vision")):
        quadrant = QuadrantName.NOT_URGENT_IMPORTANT
        rationale = "Strategischer Kontext / Strategic focus."
    else:
        quadrant = QuadrantName.NOT_URGENT_NOT_IMPORTANT
        rationale = "Standard-Fallback / Default fallback."

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
        focus = "Momentum halten / Keep momentum."
    else:
        goal = baseline
        focus = "Ruhig starten / Start steady."

    tips = [
        "Blocke 30 Minuten fuer die wichtigste Aufgabe / Block 30 minutes for the top task.",
        "Nutze die Eisenhower-Quadranten bewusst / Be intentional with the Eisenhower quadrants.",
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


def _fallback_milestones(todo_title: str) -> MilestoneSuggestionList:
    base = todo_title.strip() or "Aufgabe / Task"
    items = [
        MilestoneSuggestionItem(
            title=f"Ersten Schritt planen / Plan first step ({base})",
            complexity="small",
            rationale="Fallback-Vorschlag / Default suggestion",
        ),
        MilestoneSuggestionItem(
            title=f"Zwischenstand dokumentieren / Capture mid-way result ({base})",
            complexity="medium",
            rationale="Fallback-Vorschlag / Default suggestion",
        ),
        MilestoneSuggestionItem(
            title=f"Finalisierung und Test / Finalize and test ({base})",
            complexity="large",
            rationale="Fallback-Vorschlag / Default suggestion",
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

    fallback = "Weiter so! Jede Aufgabe bringt dich naeher ans Ziel / Keep going, every task moves you closer."
    return AISuggestion(fallback, from_ai=False)


__all__ = [
    "AISuggestion",
    "generate_motivation",
    "suggest_milestones",
    "suggest_goals",
    "suggest_quadrant",
]
