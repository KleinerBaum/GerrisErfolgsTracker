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


__all__ = [
    "GoalSuggestion",
    "Motivation",
    "QuadrantName",
    "TodoCategorization",
]
