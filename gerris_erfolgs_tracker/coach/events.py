from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Mapping, Optional

from pydantic import BaseModel, Field


class CoachTrigger(str, Enum):
    TASK_COMPLETED = "task_completed"
    OVERDUE = "overdue"
    DUE_SOON = "due_soon"
    WEEKLY = "weekly"


class CoachEvent(BaseModel):
    """Event emitted to the coach engine."""

    trigger: CoachTrigger
    event_id: str
    created_at_iso: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    context: Mapping[str, Any] = Field(default_factory=dict)

    @property
    def created_at(self) -> datetime:
        created_at = datetime.fromisoformat(self.created_at_iso)
        if created_at.tzinfo is None:
            return created_at.replace(tzinfo=timezone.utc)
        return created_at.astimezone(created_at.tzinfo)

    def get_context_value(self, key: str) -> Optional[str]:
        value = self.context.get(key)
        if value is None:
            return None
        return str(value)


__all__ = ["CoachEvent", "CoachTrigger"]
