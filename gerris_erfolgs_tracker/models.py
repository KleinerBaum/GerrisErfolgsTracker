from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant


class KanbanColumn(BaseModel):
    """Column inside a per-task kanban board."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    order: int


class KanbanCard(BaseModel):
    """Card representing a subtask in the per-task kanban board."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description_md: str = ""
    column_id: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    done_at: Optional[datetime] = None


DEFAULT_KANBAN_COLUMNS: tuple[KanbanColumn, ...] = (
    KanbanColumn(id="backlog", title="Backlog", order=0),
    KanbanColumn(id="doing", title="Doing", order=1),
    KanbanColumn(id="done", title="Done", order=2),
)


class TodoKanban(BaseModel):
    """Per-task kanban board with default columns and cards."""

    columns: list[KanbanColumn] = Field(
        default_factory=lambda: [column.model_copy() for column in DEFAULT_KANBAN_COLUMNS]
    )
    cards: list[KanbanCard] = Field(default_factory=list)

    def ensure_default_columns(self) -> "TodoKanban":
        """Guarantee that the default columns exist and follow the canonical order."""

        existing_ids = {column.id for column in self.columns}
        columns = list(self.columns)
        if len(existing_ids) < len(DEFAULT_KANBAN_COLUMNS):
            for column in DEFAULT_KANBAN_COLUMNS:
                if column.id not in existing_ids:
                    columns.append(column.model_copy())

        order_lookup = {column.id: column.order for column in DEFAULT_KANBAN_COLUMNS}
        sorted_columns = sorted(
            columns,
            key=lambda item: (order_lookup.get(item.id, item.order), item.order, item.title.lower()),
        )
        return self.model_copy(update={"columns": sorted_columns})

    def backlog_column_id(self) -> str:
        for column in self.columns:
            if column.id == "backlog":
                return column.id
        return DEFAULT_KANBAN_COLUMNS[0].id

    def done_column_id(self) -> str:
        for column in self.columns:
            if column.id == "done":
                return column.id
        return DEFAULT_KANBAN_COLUMNS[-1].id


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
            return "Stellensuche"
        if self is Category.ADMIN:
            return "Administratives"
        if self is Category.FRIENDS_FAMILY:
            return "Familie & Freunde"
        if self is Category.DRUGS:
            return "Drogen"
        return "Tagesstruktur"


class RecurrencePattern(str, Enum):
    """Repeating schedule for a todo item."""

    ONCE = "once"
    DAILY = "daily"
    WEEKDAYS = "weekdays"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"

    @property
    def label(self) -> str:
        if self is RecurrencePattern.ONCE:
            return "Einmalig"
        if self is RecurrencePattern.DAILY:
            return "Täglich"
        if self is RecurrencePattern.WEEKDAYS:
            return "Werktags"
        if self is RecurrencePattern.WEEKLY:
            return "Wöchentlich"
        if self is RecurrencePattern.MONTHLY:
            return "Monatlich"
        return "Jährlich"


class EmailReminderOffset(str, Enum):
    """Lead time for optional email reminders."""

    NONE = "none"
    ONE_HOUR = "one_hour"
    ONE_DAY = "one_day"

    @property
    def label(self) -> str:
        if self is EmailReminderOffset.ONE_HOUR:
            return "E-Mail 1 Stunde vorher"
        if self is EmailReminderOffset.ONE_DAY:
            return "E-Mail 1 Tag vorher"
        return "Keine Erinnerung"


class MilestoneComplexity(str, Enum):
    """Simple sizing for milestone effort."""

    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"

    @property
    def label(self) -> str:
        if self is MilestoneComplexity.SMALL:
            return "Klein"
        if self is MilestoneComplexity.MEDIUM:
            return "Mittel"
        return "Groß"


class MilestoneStatus(str, Enum):
    """Workflow state for milestones in a lightweight roadmap board."""

    BACKLOG = "backlog"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    DONE = "done"

    @property
    def label(self) -> str:
        if self is MilestoneStatus.BACKLOG:
            return "Backlog"
        if self is MilestoneStatus.READY:
            return "Bereit"
        if self is MilestoneStatus.IN_PROGRESS:
            return "In Arbeit"
        if self is MilestoneStatus.REVIEW:
            return "Review"
        return "Erledigt"


class Milestone(BaseModel):
    """Sub-goal within a todo with optional gamification points."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    points: int = 0
    complexity: MilestoneComplexity = MilestoneComplexity.MEDIUM
    status: MilestoneStatus = MilestoneStatus.BACKLOG
    note: str = ""


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
    progress_current: float = 0.0
    progress_target: Optional[float] = None
    progress_unit: str = ""
    auto_done_when_target_reached: bool = True
    completion_criteria_md: str = ""
    processed_progress_events: list[str] = Field(default_factory=list)
    kanban: TodoKanban = Field(default_factory=TodoKanban)
    milestones: list[Milestone] = Field(default_factory=list)
    recurrence: RecurrencePattern = RecurrencePattern.ONCE
    email_reminder: EmailReminderOffset = EmailReminderOffset.NONE
    reminder_at: Optional[datetime] = None
    reminder_sent_at: Optional[datetime] = None


class JournalEntry(BaseModel):
    """Guided daily journal entry linked to goals and categories."""

    date: date
    moods: list[str] = Field(default_factory=list)
    mood_notes: str = ""
    triggers_and_reactions: str = ""
    negative_thought: str = ""
    rational_response: str = ""
    self_care_today: str = ""
    self_care_tomorrow: str = ""
    gratitudes: list[str] = Field(default_factory=list)
    gratitude_1: str = ""
    gratitude_2: str = ""
    gratitude_3: str = ""
    categories: list[Category] = Field(default_factory=list)
    linked_todo_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _sync_gratitudes(self) -> "JournalEntry":
        cleaned_gratitudes = [value.strip() for value in self.gratitudes if value and value.strip()]

        legacy_values = [self.gratitude_1, self.gratitude_2, self.gratitude_3]
        legacy_cleaned = [value.strip() for value in legacy_values if value and value.strip()]

        if not cleaned_gratitudes:
            cleaned_gratitudes = legacy_cleaned

        padded = (cleaned_gratitudes + ["", "", ""])[:3]
        self.gratitudes = cleaned_gratitudes
        self.gratitude_1, self.gratitude_2, self.gratitude_3 = padded

        cleaned_links: list[str] = []
        for todo_id in self.linked_todo_ids:
            value = str(todo_id).strip()
            if value and value not in cleaned_links:
                cleaned_links.append(value)
        self.linked_todo_ids = cleaned_links
        return self


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
    processed_journal_events: List[str] = Field(default_factory=list)


class GamificationMode(str, Enum):
    """Available gamification styles for the app."""

    POINTS = "points"
    BADGES = "badges"
    AVATAR_ROSS = "dipl_psych_ross"

    @property
    def label(self) -> str:
        if self is GamificationMode.POINTS:
            return "Punkte & Level"
        if self is GamificationMode.BADGES:
            return "Abzeichen"
        return "Dipl.-Psych. Roß (Avatar)"
