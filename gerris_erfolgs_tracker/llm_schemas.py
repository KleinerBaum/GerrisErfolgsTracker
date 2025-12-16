from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class QuadrantName(StrEnum):
    URGENT_IMPORTANT = "urgent_important"
    NOT_URGENT_IMPORTANT = "not_urgent_important"
    URGENT_NOT_IMPORTANT = "urgent_not_important"
    NOT_URGENT_NOT_IMPORTANT = "not_urgent_not_important"


class TodoCategorization(BaseModel):
    quadrant: QuadrantName = Field(
        description="Eisenhower-Quadrant fuer die Aufgabe",
    )
    rationale: str = Field(
        description="Kurze Begruendung",
    )


class GoalSuggestion(BaseModel):
    daily_goal: int = Field(
        ge=1,
        description="Tagesziel fuer erledigte Aufgaben",
    )
    focus: str = Field(description="Fokus fuer den Tag")
    tips: list[str] = Field(
        default_factory=list,
        description="Konkrete Tipps",
    )


class Motivation(BaseModel):
    message: str = Field(description="Motivierender Text")
    tone: Literal["encouraging", "calm", "celebratory"] = Field(
        description="Tonlage der Nachricht",
    )


class MilestoneSuggestionItem(BaseModel):
    title: str = Field(
        description="Kurzer Titel des Meilensteins",
    )
    complexity: Literal["small", "medium", "large"] = Field(
        description="Einschaetzung des Aufwands (klein/mittel/groß)",
    )
    rationale: str = Field(
        description="Begruendung oder Kontext",
    )


class MilestoneSuggestionList(BaseModel):
    milestones: list[MilestoneSuggestionItem] = Field(
        default_factory=list,
        description="Vorgeschlagene Meilensteine",
    )


class JournalAlignmentAction(BaseModel):
    target_id: str | None = Field(
        default=None,
        description="ID des Ziels oder der Aufgabe",
    )
    target_title: str = Field(
        description="Name des Ziels oder der Aufgabe",
    )
    target_type: Literal["task", "goal"] = Field(
        description="Typ der Referenz",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Sicherheit der Zuordnung",
    )
    suggested_points: int = Field(
        ge=0,
        le=50,
        description="Punktebonus für Fortschritt",
    )
    follow_up: str = Field(
        default="",
        description="Kurze Folgeaktion",
    )
    rationale: str = Field(
        description="Begründung für das Update",
    )


class JournalAlignmentResponse(BaseModel):
    summary: str = Field(description="Kurzfassung der erkannten Fortschritte")
    actions: list[JournalAlignmentAction] = Field(
        default_factory=list,
        description="Konkrete Updates mit Punkten",
    )


__all__ = [
    "GoalSuggestion",
    "JournalAlignmentAction",
    "JournalAlignmentResponse",
    "Motivation",
    "MilestoneSuggestionItem",
    "MilestoneSuggestionList",
    "QuadrantName",
    "TodoCategorization",
]
