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
        description="Eisenhower-Quadrant fuer die Aufgabe / Target quadrant for the task",
    )
    rationale: str = Field(
        description="Kurze Begruendung / Brief rationale for the classification",
    )


class GoalSuggestion(BaseModel):
    daily_goal: int = Field(
        ge=1,
        description="Tagesziel fuer erledigte Aufgaben / Daily completion target",
    )
    focus: str = Field(description="Fokus fuer den Tag / Suggested focus for today")
    tips: list[str] = Field(
        default_factory=list,
        description="Konkrete Tipps / Concrete tips to achieve the goal",
    )


class Motivation(BaseModel):
    message: str = Field(description="Motivierender Text / Motivational message")
    tone: Literal["encouraging", "calm", "celebratory"] = Field(
        description="Tonlage der Nachricht / Tone of the message",
    )


class JournalAlignmentAction(BaseModel):
    target_id: str | None = Field(
        default=None,
        description="ID des Ziels oder der Aufgabe / ID of the goal or task if available",
    )
    target_title: str = Field(
        description="Name des Ziels oder der Aufgabe / Name of the goal or task",
    )
    target_type: Literal["task", "goal"] = Field(
        description="Typ der Referenz / Target type (task or goal)",
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Sicherheit der Zuordnung / Confidence of the match",
    )
    suggested_points: int = Field(
        ge=0,
        le=50,
        description="Punktebonus für Fortschritt / Suggested bonus points",
    )
    follow_up: str = Field(
        default="",
        description="Kurze Folgeaktion (DE/EN) / Follow-up action (DE/EN)",
    )
    rationale: str = Field(
        description="Begründung für das Update / Rationale for the suggested update",
    )


class JournalAlignmentResponse(BaseModel):
    summary: str = Field(description="Kurzfassung der erkannten Fortschritte / Summary of detected progress")
    actions: list[JournalAlignmentAction] = Field(
        default_factory=list,
        description="Konkrete Updates mit Punkten / Concrete updates with point suggestions",
    )


__all__ = [
    "GoalSuggestion",
    "JournalAlignmentAction",
    "JournalAlignmentResponse",
    "Motivation",
    "QuadrantName",
    "TodoCategorization",
]
