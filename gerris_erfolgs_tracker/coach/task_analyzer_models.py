from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field, model_validator

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant


class MilestonePlanItem(BaseModel):
    """Milestone recommendation for a new task."""

    title: str
    suggested_due: date | None = None
    effort: int = Field(default=1, ge=0)
    suggested_points: int = Field(default=0, ge=0)


class TaskAIProposal(BaseModel):
    """Structured AI proposal for task planning and sizing."""

    complexity_score: int = Field(default=3)
    estimated_minutes: int = Field(default=30, ge=0)
    suggested_quadrant: EisenhowerQuadrant = EisenhowerQuadrant.NOT_URGENT_IMPORTANT
    suggested_priority: int = Field(default=3)
    milestone_plan: list[MilestonePlanItem] = Field(default_factory=list)
    start_date: date | None = None
    due_date: date | None = None

    @model_validator(mode="after")
    def _validate_plan(self) -> "TaskAIProposal":
        self.complexity_score = min(5, max(1, self.complexity_score))
        self.suggested_priority = min(5, max(1, self.suggested_priority))

        previous_due: date | None = None
        for item in self.milestone_plan:
            if self.start_date and self.due_date and item.suggested_due:
                if not (self.start_date <= item.suggested_due <= self.due_date):
                    raise ValueError("Milestone dates must fall within the task timeframe.")

            if previous_due and item.suggested_due:
                if item.suggested_due <= previous_due:
                    raise ValueError("Milestone due dates must be strictly increasing.")

            if item.suggested_due:
                previous_due = item.suggested_due

        return self


__all__ = ["MilestonePlanItem", "TaskAIProposal"]
