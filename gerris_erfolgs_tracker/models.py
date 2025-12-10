from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class TodoItem(BaseModel):
    """Representation of a todo item stored in session state."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_date: Optional[datetime] = None
    quadrant: str
    completed: bool = False
    completed_at: Optional[datetime] = None


class KpiStats(BaseModel):
    """Key performance indicators for todo completion."""

    done_total: int = 0
    done_today: int = 0
    streak: int = 0
    goal_daily: int = 0
    goal_hit_today: bool = False
    goal_history: List[bool] = Field(default_factory=list)


class GamificationState(BaseModel):
    """Gamification metrics to encourage consistent progress."""

    points: int = 0
    level: int = 1
    badges: List[str] = Field(default_factory=list)
    history: List[str] = Field(default_factory=list)
