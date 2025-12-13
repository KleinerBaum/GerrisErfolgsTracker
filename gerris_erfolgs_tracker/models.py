from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant


class Category(str, Enum):
    """High-level life domains for tasks."""

    JOB_SEARCH = "job_search"
    ADMIN = "admin"
    FRIENDS_FAMILY = "friends_family"
    DRUGS = "drugs"
    DAILY_STRUCTURE = "daily_structure"

    @property
    def label(self) -> str:
        if self is Category.JOB_SEARCH:
            return "Stellensuche / Job search"
        if self is Category.ADMIN:
            return "Administratives / Admin"
        if self is Category.FRIENDS_FAMILY:
            return "Familie & Freunde / Family & friends"
        if self is Category.DRUGS:
            return "Drogen / Substance use"
        return "Tagesstruktur / Daily structure"


class TodoItem(BaseModel):
    """Representation of a todo item stored in session state."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    due_date: Optional[datetime] = None
    quadrant: EisenhowerQuadrant
    category: Category = Category.DAILY_STRUCTURE
    priority: int = Field(default=3, ge=1, le=5)
    description_md: str = ""
    completed: bool = False
    completed_at: Optional[datetime] = None


class KpiDailyEntry(BaseModel):
    """Daily summary of completions for KPI tracking."""

    date: date
    completions: int = 0


class KpiStats(BaseModel):
    """Key performance indicators for todo completion."""

    done_total: int = 0
    done_today: int = 0
    streak: int = 0
    goal_daily: int = 3
    goal_hit_today: bool = False
    goal_history: List[bool] = Field(default_factory=list)
    daily_history: List[KpiDailyEntry] = Field(default_factory=list)
    last_completion_date: Optional[date] = None
    current_day: Optional[date] = None


class GamificationState(BaseModel):
    """Gamification metrics to encourage consistent progress."""

    points: int = 0
    level: int = 1
    badges: List[str] = Field(default_factory=list)
    history: List[str] = Field(default_factory=list)
    processed_completions: List[str] = Field(default_factory=list)


class GamificationMode(str, Enum):
    """Available gamification styles for the app."""

    POINTS = "points"
    BADGES = "badges"
    AVATAR_ROSS = "dipl_psych_ross"

    @property
    def label(self) -> str:
        if self is GamificationMode.POINTS:
            return "Punkte & Level / Points & levels"
        if self is GamificationMode.BADGES:
            return "Abzeichen / Badges"
        return "Dipl.-Psych. Roß (Avatar) / Dipl.-Psych. Roß (avatar)"
