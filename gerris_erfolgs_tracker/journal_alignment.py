from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from openai import OpenAI

from gerris_erfolgs_tracker.ai_features import AISuggestion
from gerris_erfolgs_tracker.llm import (
    LLMError,
    get_default_model,
    get_openai_client,
    request_structured_response,
)
from gerris_erfolgs_tracker.llm_schemas import JournalAlignmentResponse
from gerris_erfolgs_tracker.models import JournalEntry, TodoItem


@dataclass(frozen=True)
class JournalUpdateCandidate:
    target_id: str | None
    target_title: str
    suggested_points: int
    follow_up: str
    rationale: str


@dataclass(frozen=True)
class JournalAlignmentSuggestion:
    actions: list[JournalUpdateCandidate]
    summary: str


def _entry_text(entry: JournalEntry) -> str:
    sections = [
        entry.mood_notes,
        entry.triggers_and_reactions,
        entry.negative_thought,
        entry.rational_response,
        entry.self_care_today,
        entry.self_care_tomorrow,
        " ".join(entry.gratitudes),
    ]
    return "\n".join(section for section in sections if section).strip()


def _describe_todos(todos: Sequence[TodoItem]) -> list[str]:
    descriptions: list[str] = []
    for todo in todos:
        status = "done" if todo.completed else "open"
        descriptions.append(
            " | ".join(
                [
                    f"id={todo.id}",
                    f"title={todo.title}",
                    f"category={todo.category.value}",
                    f"quadrant={todo.quadrant.value}",
                    f"status={status}",
                ]
            )
        )
    return descriptions


def _fallback_alignment(entry_text: str, todos: Iterable[TodoItem]) -> JournalAlignmentSuggestion:
    actions: list[JournalUpdateCandidate] = []
    lowered_entry = entry_text.lower()
    for todo in todos:
        if todo.completed:
            continue
        title_lower = todo.title.lower()
        if not title_lower or title_lower not in lowered_entry:
            continue
        actions.append(
            JournalUpdateCandidate(
                target_id=todo.id,
                target_title=todo.title,
                suggested_points=10,
                follow_up=(
                    "Bestätige den Fortschritt und plane den nächsten Schritt. / Confirm the progress and plan the next step."
                ),
                rationale="Titel im Tagebucheintrag erkannt / Title detected in journal entry.",
            )
        )
    summary = (
        "Automatische Heuristik: Treffer basierend auf Titeln; bitte manuell prüfen. / "
        "Heuristic match via titles; please verify manually."
    )
    return JournalAlignmentSuggestion(actions=actions, summary=summary)


def _parse_ai_alignment(response: JournalAlignmentResponse) -> JournalAlignmentSuggestion:
    actions: list[JournalUpdateCandidate] = []
    for action in response.actions:
        if action.suggested_points <= 0:
            continue
        actions.append(
            JournalUpdateCandidate(
                target_id=action.target_id,
                target_title=action.target_title,
                suggested_points=min(50, max(0, action.suggested_points)),
                follow_up=action.follow_up,
                rationale=action.rationale,
            )
        )
    return JournalAlignmentSuggestion(actions=actions, summary=response.summary)


def suggest_journal_alignment(
    *,
    entry: JournalEntry,
    todos: Sequence[TodoItem],
    client: OpenAI | None = None,
) -> AISuggestion[JournalAlignmentSuggestion]:
    """Match journal content against goals or tasks and propose point updates."""

    content = _entry_text(entry)
    if not content:
        summary = "Keine Inhalte für den Abgleich vorhanden / No journal content to check."
        return AISuggestion(JournalAlignmentSuggestion(actions=[], summary=summary), from_ai=False)

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
                            "Finde im Tagebucheintrag Fortschritte zu bestehenden Zielen oder Aufgaben. "
                            "Nutze nur sehr plausible Treffer (confidence >= 0.5). "
                            "Schlage pro Treffer kurze Folgeaktionen in DE/EN sowie 5-30 Punkte vor."
                        ),
                    },
                    {
                        "role": "user",
                        "content": (
                            "Journal entry: "
                            f"date={entry.date.isoformat()}\n"
                            f"content={content}\n"
                            f"moods={', '.join(entry.moods)}\n"
                            f"categories={[category.value for category in entry.categories]}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": "Verfügbare Aufgaben / goals: " + "\n".join(_describe_todos(todos)),
                    },
                ],
                response_model=JournalAlignmentResponse,
            )
            return AISuggestion(_parse_ai_alignment(result), from_ai=True)
        except LLMError:
            pass

    return AISuggestion(_fallback_alignment(content, todos), from_ai=False)


__all__ = [
    "JournalAlignmentSuggestion",
    "JournalUpdateCandidate",
    "suggest_journal_alignment",
]
