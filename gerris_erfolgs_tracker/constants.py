"""Central constants for Streamlit session state keys and defaults."""

from typing import List, TypeVar

T = TypeVar("T")

PROCESSED_PROGRESS_EVENTS_LIMIT: int = 1000
PROCESSED_COMPLETIONS_LIMIT: int = 1000
PROCESSED_JOURNAL_EVENTS_LIMIT: int = 1000
PROCESSED_MILESTONE_EVENTS_LIMIT: int = 1000
PROCESSED_PROGRESS_REWARDS_LIMIT: int = 1000
GAMIFICATION_HISTORY_LIMIT: int = 1000
COACH_HISTORY_LIMIT: int = 200
COACH_SEEN_EVENT_IDS_MAX: int = 500


def cap_list_tail(values: List[T], limit: int) -> List[T]:
    """Return at most the last ``limit`` items of ``values``.

    A non-positive ``limit`` clears the list to avoid unbounded growth.
    """

    if limit <= 0:
        return []
    return values[-limit:]


SS_TODOS: str = "todos"
SS_STATS: str = "stats"
SS_SETTINGS: str = "settings"
SS_GAMIFICATION: str = "gamification"
SS_JOURNAL: str = "journal_entries"
SS_COACH: str = "coach"
JOURNAL_COMPLETION_PROMPT_KEY: str = "journal_completion_prompt"
JOURNAL_COMPLETION_NOTE_KEY: str = "journal_completion_note"

AI_ENABLED_KEY: str = "ai_enabled"
AI_QUADRANT_RATIONALE_KEY: str = "ai_quadrant_rationale"
AI_GOAL_SUGGESTION_KEY: str = "ai_goal_suggestion"
AI_MOTIVATION_KEY: str = "ai_motivation_message"
SHOW_STORAGE_NOTICE_KEY: str = "show_storage_notice"
SHOW_SAFETY_NOTES_KEY: str = "show_safety_notes"
GOAL_SUGGESTED_VALUE_KEY: str = "suggested_goal_daily"
GOAL_CREATION_VISIBLE_KEY: str = "goal_creation_visible"
GOAL_OVERVIEW_SHOW_KPI_KEY: str = "goal_overview_show_kpi"
GOAL_OVERVIEW_SHOW_CATEGORY_KEY: str = "goal_overview_show_category"
GOAL_OVERVIEW_SELECTED_CATEGORIES_KEY: str = "goal_overview_selected_categories"
GOAL_OVERVIEW_SELECTED_TASKS_KEY: str = "goal_overview_selected_tasks"
SETTINGS_GOAL_DAILY_KEY: str = "settings_goal_daily"
PENDING_DELETE_TODO_KEY: str = "pending_delete_todo"
NEW_TODO_TITLE_KEY: str = "new_todo_title"
NEW_TODO_DUE_KEY: str = "new_todo_due"
NEW_TODO_QUADRANT_KEY: str = "new_todo_quadrant"
NEW_TODO_QUADRANT_PREFILL_KEY: str = "new_todo_quadrant_prefill"
NEW_TODO_RESET_TRIGGER_KEY: str = "new_todo_reset_trigger"
NEW_TODO_CATEGORY_KEY: str = "new_todo_category"
NEW_TODO_PRIORITY_KEY: str = "new_todo_priority"
NEW_TODO_DESCRIPTION_KEY: str = "new_todo_description"
NEW_TODO_PROGRESS_TARGET_KEY: str = "new_todo_progress_target"
NEW_TODO_PROGRESS_UNIT_KEY: str = "new_todo_progress_unit"
NEW_TODO_PROGRESS_CURRENT_KEY: str = "new_todo_progress_current"
NEW_TODO_AUTO_COMPLETE_KEY: str = "new_todo_auto_complete"
NEW_TODO_COMPLETION_CRITERIA_KEY: str = "new_todo_completion_criteria"
NEW_TODO_ENABLE_TARGET_KEY: str = "new_todo_enable_target"
NEW_TODO_RECURRENCE_KEY: str = "new_todo_recurrence"
NEW_TODO_REMINDER_KEY: str = "new_todo_reminder"
NEW_TODO_TEMPLATE_KEY: str = "new_todo_template"
TODO_TEMPLATE_LAST_APPLIED_KEY: str = "_todo_template_last_applied"
NEW_MILESTONE_TITLE_KEY: str = "new_milestone_title"
NEW_MILESTONE_COMPLEXITY_KEY: str = "new_milestone_complexity"
NEW_MILESTONE_POINTS_KEY: str = "new_milestone_points"
NEW_MILESTONE_NOTE_KEY: str = "new_milestone_note"
NEW_MILESTONE_SUGGESTIONS_KEY: str = "new_milestone_suggestions"
NEW_TODO_DRAFT_MILESTONES_KEY: str = "new_todo_draft_milestones"
TASK_AI_PROPOSAL_KEY: str = "task_ai_proposal"
TASK_AI_PROPOSAL_APPLY_KEY: str = "task_ai_proposal_apply"
AVATAR_PROMPT_INDEX_KEY: str = "avatar_prompt_index"
FILTER_SHOW_DONE_KEY: str = "filter_show_done"
FILTER_SELECTED_CATEGORIES_KEY: str = "filter_selected_categories"
FILTER_SORT_OVERRIDE_KEY: str = "filter_sort_override"
