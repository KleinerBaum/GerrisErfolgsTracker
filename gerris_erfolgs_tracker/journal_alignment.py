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
from gerris_erfolgs_tracker.models import JournalEntry, MilestoneStatus, TodoItem


@dataclass(frozen=True)
class JournalUpdateCandidate:
    target_id: str | None
    target_title: str
    suggested_points: int
    follow_up: str
    rationale: str
    progress_delta_percent: float | None
    milestones_to_mark_done: list[str]


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
        milestone_descriptions: list[str] = []
        for milestone in todo.milestones:
            milestone_descriptions.append(
                " ".join(
                    [
                        f"milestone_id={milestone.id}",
                        f"milestone_title={milestone.title}",
                        f"milestone_status={milestone.status.value}",
                    ]
                )
            )
        descriptions.append(
            " | ".join(
                [
                    f"id={todo.id}",
                    f"title={todo.title}",
                    f"category={todo.category.value}",
                    f"quadrant={todo.quadrant.value}",
                    f"status={status}",
                    f"milestones={' ; '.join(milestone_descriptions)}" if milestone_descriptions else "milestones=none",
                ]
            )
        )
    return descriptions


def _fallback_alignment(entry_text: str, todos: Iterable[TodoItem]) -> JournalAlignmentSuggestion:
    actions: list[JournalUpdateCandidate] = []
    lowered_entry = entry_text.lower()
    entry_keywords = {token.strip(".,;:!?") for token in lowered_entry.split() if len(token.strip(".,;:!?")) >= 5}
    for todo in todos:
        if todo.completed:
            continue
        title_lower = todo.title.lower()
        milestones_to_mark_done: list[str] = []
        progress_delta = 0.0

        if title_lower and (title_lower in lowered_entry or any(keyword in title_lower for keyword in entry_keywords)):
            progress_delta = 10.0

        for milestone in todo.milestones:
            if milestone.status is MilestoneStatus.DONE:
                continue
            milestone_title = milestone.title.lower()
            if milestone.title and (
                milestone_title in lowered_entry
                or any(fragment in lowered_entry for fragment in milestone_title.split())
                or any(keyword in milestone_title for keyword in entry_keywords)
            ):
                milestones_to_mark_done.append(milestone.id)
                progress_delta = max(progress_delta, 20.0)

        if progress_delta == 0 and not milestones_to_mark_done:
            continue

        follow_up_note = "Fortschritt erkannt – bitte bestätigen / Progress detected – please confirm."
        rationale = (
            "Teilfortschritt über Titel/Unterziel im Tagebuch erkannt / Partial progress "
            "detected via title or sub-goal match."
        )
        actions.append(
            JournalUpdateCandidate(
                target_id=todo.id,
                target_title=todo.title,
                suggested_points=10,
                follow_up=follow_up_note,
                rationale=rationale,
                progress_delta_percent=progress_delta,
                milestones_to_mark_done=milestones_to_mark_done,
            )
        )
    summary = "Automatische Heuristik: Treffer basierend auf Titeln; bitte manuell prüfen."
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
                progress_delta_percent=action.progress_delta_percent,
                milestones_to_mark_done=action.milestones_to_mark_done,
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
        summary = "Keine Inhalte für den Abgleich vorhanden."
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
                            "Nutze nur sehr plausible Treffer (confidence >= 0.5) inklusive semantischer Synonyme. "
                            "Erkenne auch Teilfortschritte: Markiere passende Meilensteine als erledigt oder erhöhe den Fortschritt in Prozentpunkten. "
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
                        "content": "Verfügbare Aufgaben & Meilensteine: " + "\n".join(_describe_todos(todos)),
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
