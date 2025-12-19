from __future__ import annotations

from datetime import datetime, timezone
from typing import Mapping, Optional

from pydantic import BaseModel, Field

from gerris_erfolgs_tracker.coach.events import CoachTrigger


class CoachMessage(BaseModel):
    """Rendered message shown to the user."""

    event_id: str
    title: str
    body: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    trigger: CoachTrigger = CoachTrigger.TASK_COMPLETED
    severity: str = "default"
    context: Mapping[str, str | None] = Field(default_factory=dict)


class CoachState(BaseModel):
    """State persisted for the coach module."""

    seen_event_ids: list[str] = Field(default_factory=list)
    messages: list[CoachMessage] = Field(default_factory=list)
    last_message_at: Optional[datetime] = None


__all__ = ["CoachMessage", "CoachState"]
