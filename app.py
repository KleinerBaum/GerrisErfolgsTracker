from __future__ import annotations

import json
import os
import subprocess
from contextlib import nullcontext
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal, Mapping, Optional, Sequence, TypedDict, cast

import plotly.graph_objects as go
import streamlit as st
from openai import OpenAI

import gerris_erfolgs_tracker.ui.tasks as tasks_ui
from gerris_erfolgs_tracker.ui.emails import render_emails_page
from gerris_erfolgs_tracker.ai_features import AISuggestion, suggest_quadrant
from gerris_erfolgs_tracker.analytics import (
    build_completion_heatmap,
    calculate_backlog_health,
    calculate_cycle_time,
    calculate_cycle_time_by_category,
)
from gerris_erfolgs_tracker.charts import (
    PRIMARY_COLOR,
    build_backlog_health_figure,
    build_category_weekly_completion_figure,
    build_cycle_time_overview_figure,
)
from gerris_erfolgs_tracker.coach.engine import get_coach_state
from gerris_erfolgs_tracker.coach.scanner import run_daily_coach_scan, schedule_weekly_review
from gerris_erfolgs_tracker.constants import (
    AI_ENABLED_KEY,
    AI_MOTIVATION_KEY,
    AI_QUADRANT_RATIONALE_KEY,
    AVATAR_PROMPT_INDEX_KEY,
    GOAL_CREATION_VISIBLE_KEY,
    GOAL_OVERVIEW_SELECTED_CATEGORIES_KEY,
    NEW_TODO_CATEGORY_KEY,
    NEW_TODO_DESCRIPTION_KEY,
    NEW_TODO_DUE_KEY,
    NEW_TODO_PRIORITY_KEY,
    NEW_TODO_QUADRANT_KEY,
    NEW_TODO_QUADRANT_PREFILL_KEY,
    NEW_TODO_RECURRENCE_KEY,
    NEW_TODO_REMINDER_KEY,
    NEW_TODO_RESET_TRIGGER_KEY,
    NEW_TODO_TITLE_KEY,
    SETTINGS_GOAL_DAILY_KEY,
    SHOW_SAFETY_NOTES_KEY,
    SHOW_STORAGE_NOTICE_KEY,
    SS_SETTINGS,
)
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant, ensure_quadrant
from gerris_erfolgs_tracker.gamification import (
    award_journal_points,
    calculate_progress_to_next_level,
    get_gamification_state,
    next_avatar_prompt,
)
from gerris_erfolgs_tracker.i18n import (
    LanguageCode,
    get_language,
    localize_streamlit,
    translate_text,
)
from gerris_erfolgs_tracker.journal import (
    append_journal_links,
    ensure_journal_state,
    get_journal_entries,
    journal_gratitude_suggestions,
    upsert_journal_entry,
)
from gerris_erfolgs_tracker.journal_alignment import (
    JournalAlignmentSuggestion,
    JournalUpdateCandidate,
    suggest_journal_alignment,
)
from gerris_erfolgs_tracker.kpi import (
    CategoryKpi,
    aggregate_category_kpis,
    count_new_tasks_last_7_days,
    last_7_days_completions_by_category,
)
from gerris_erfolgs_tracker.kpis import get_kpi_stats, update_goal_daily
from gerris_erfolgs_tracker.llm import get_openai_client
from gerris_erfolgs_tracker.models import (
    Category,
    GamificationMode,
    JournalEntry,
    KpiStats,
    Milestone,
    MilestoneComplexity,
    MilestoneStatus,
    TodoItem,
)
from gerris_erfolgs_tracker.state import (
    configure_storage,
    get_todos,
    init_state,
    load_persisted_state,
    persist_state,
    reset_state,
)
from gerris_erfolgs_tracker.state_persistence import PERSISTED_KEYS
from gerris_erfolgs_tracker.storage import FileStorageBackend
from gerris_erfolgs_tracker.todos import (
    add_todo,
    toggle_complete,
    update_milestone,
    update_todo,
    update_todo_progress,
)
from gerris_erfolgs_tracker.ui.common import _inject_dark_theme_styles
from gerris_erfolgs_tracker.ui.tasks import (
    gamification_snapshot,
    handle_completion_success,
    render_quadrant_focus_items,
)
from gerris_erfolgs_tracker.ui.tasks import (
    render_tasks_page as _render_tasks_page,
)
from gerris_erfolgs_tracker.ui.tasks import (
    render_todo_section as _render_todo_section,
)

__all__ = [
    "AI_QUADRANT_RATIONALE_KEY",
    "NEW_TODO_CATEGORY_KEY",
    "NEW_TODO_DESCRIPTION_KEY",
    "NEW_TODO_DUE_KEY",
    "NEW_TODO_PRIORITY_KEY",
    "NEW_TODO_QUADRANT_KEY",
    "NEW_TODO_QUADRANT_PREFILL_KEY",
    "NEW_TODO_RECURRENCE_KEY",
    "NEW_TODO_REMINDER_KEY",
    "NEW_TODO_RESET_TRIGGER_KEY",
    "NEW_TODO_TITLE_KEY",
    "render_tasks_page",
    "suggest_quadrant",
    "render_todo_section",
]


def _sync_tasks_streamlit() -> None:
    tasks_ui.st = st
    tasks_ui.add_todo = add_todo
    tasks_ui.get_todos = get_todos
    tasks_ui.suggest_quadrant = suggest_quadrant


def render_todo_section(
    ai_enabled: bool,
    client: Optional[OpenAI],
    *,
    todos: Optional[list[TodoItem]] = None,
    stats: Optional[KpiStats] = None,
    journal_links: Optional[Mapping[str, list[date]]] = None,
) -> None:
    _sync_tasks_streamlit()
    _render_todo_section(
        ai_enabled=ai_enabled,
        client=client,
        todos=todos,
        stats=stats,
        journal_links=journal_links,
    )


def render_tasks_page(
    *, ai_enabled: bool, client: Optional[OpenAI], todos: list[TodoItem], stats: Optional[KpiStats] = None
) -> None:
    _sync_tasks_streamlit()
    _render_tasks_page(ai_enabled=ai_enabled, client=client, todos=todos, stats=stats)


GoalHorizon = Literal["1_week", "30_days", "90_days", "custom"]
GoalCheckInCadence = Literal["weekly", "biweekly", "monthly"]


class GoalProfile(TypedDict, total=False):
    title: str
    focus_categories: list[str]
    horizon: GoalHorizon
    start_date: date | None
    target_date: date | None
    metric_target: float | None
    metric_unit: str
    check_in_cadence: GoalCheckInCadence
    success_criteria_md: str
    motivation_md: str
    risk_mitigation_md: str
    next_step_md: str
    celebration_md: str


GOAL_HORIZON_OPTIONS: tuple[tuple[GoalHorizon, tuple[str, str]], ...] = (
    ("1_week", ("1 Woche Fokus", "1 Woche Fokus")),
    ("30_days", ("30 Tage Sprint", "30 Tage Sprint")),
    ("90_days", ("90 Tage Zielhorizont", "90 Tage Zielhorizont")),
    ("custom", ("Individuell", "Individuell")),
)

GOAL_CHECKIN_OPTIONS: tuple[tuple[GoalCheckInCadence, tuple[str, str]], ...] = (
    ("weekly", ("Wöchentlich", "Wöchentlich")),
    ("biweekly", ("14-tägig", "14-tägig")),
    ("monthly", ("Monatlich", "Monatlich")),
)

GOAL_OVERVIEW_SELECTED_CATEGORY_KEY = "goal_overview_selected_category"
GOAL_OVERVIEW_FOCUS_MODE_KEY = "goal_overview_focus_mode"


def _goal_option_label(value: str, options: tuple[tuple[str, tuple[str, str]], ...]) -> str:
    for option_value, label in options:
        if option_value == value:
            return translate_text(label)
    return str(value)


localize_streamlit()


def _default_goal_profile() -> GoalProfile:
    return GoalProfile(
        title="",
        focus_categories=[Category.DAILY_STRUCTURE.value],
        horizon="30_days",
        start_date=None,
        target_date=None,
        metric_target=None,
        metric_unit="",
        check_in_cadence="weekly",
        success_criteria_md="",
        motivation_md="",
        risk_mitigation_md="",
        next_step_md="",
        celebration_md="",
    )


def _sanitize_goal_profile(settings: Mapping[str, object]) -> GoalProfile:
    raw_profile = settings.get("goal_profile", {}) if isinstance(settings, Mapping) else {}
    default_profile = _default_goal_profile()

    def _coerce_date(value: object) -> date | None:
        if isinstance(value, date):
            return value
        return None

    sanitized: GoalProfile = default_profile.copy()
    if isinstance(raw_profile, Mapping):
        sanitized["title"] = str(raw_profile.get("title", default_profile["title"]))[:140]
        raw_categories = raw_profile.get("focus_categories", default_profile["focus_categories"])
        valid_category_values = {item.value for item in Category}
        if isinstance(raw_categories, list):
            normalized_categories: list[str] = []
            for category in raw_categories:
                if isinstance(category, Category):
                    normalized_categories.append(category.value)
                elif isinstance(category, str) and category in valid_category_values:
                    normalized_categories.append(category)
            sanitized["focus_categories"] = normalized_categories or default_profile["focus_categories"]
        allowed_horizons: set[GoalHorizon] = {option for option, _ in GOAL_HORIZON_OPTIONS}
        horizon_candidate = str(raw_profile.get("horizon", default_profile["horizon"]))
        sanitized["horizon"] = cast(
            GoalHorizon,
            horizon_candidate if horizon_candidate in allowed_horizons else default_profile["horizon"],
        )
        sanitized["start_date"] = _coerce_date(raw_profile.get("start_date"))
        sanitized["target_date"] = _coerce_date(raw_profile.get("target_date"))
        try:
            metric_target_raw = raw_profile.get("metric_target", None)
            metric_target = float(metric_target_raw) if metric_target_raw not in {None, ""} else None
            sanitized["metric_target"] = metric_target if metric_target is None or metric_target >= 0 else None
        except (TypeError, ValueError):
            sanitized["metric_target"] = None
        sanitized["metric_unit"] = str(raw_profile.get("metric_unit", ""))[:40]
        allowed_cadences: set[GoalCheckInCadence] = {option for option, _ in GOAL_CHECKIN_OPTIONS}
        cadence_candidate = str(raw_profile.get("check_in_cadence", default_profile["check_in_cadence"]))
        sanitized["check_in_cadence"] = cast(
            GoalCheckInCadence,
            cadence_candidate if cadence_candidate in allowed_cadences else default_profile["check_in_cadence"],
        )
        sanitized["success_criteria_md"] = str(raw_profile.get("success_criteria_md", ""))
        sanitized["motivation_md"] = str(raw_profile.get("motivation_md", ""))
        sanitized["risk_mitigation_md"] = str(raw_profile.get("risk_mitigation_md", ""))
        sanitized["next_step_md"] = str(raw_profile.get("next_step_md", ""))
        sanitized["celebration_md"] = str(raw_profile.get("celebration_md", ""))
    return sanitized


def _sanitize_category_goals(settings: Mapping[str, object]) -> dict[str, int]:
    raw_goals = settings.get("category_goals", {}) if isinstance(settings, Mapping) else {}
    sanitized: dict[str, int] = {}
    for category in Category:
        try:
            raw_value = raw_goals.get(category.value, 1) if isinstance(raw_goals, Mapping) else 1
            sanitized_value = max(0, min(20, int(raw_value)))
        except (TypeError, ValueError):
            sanitized_value = 1
        sanitized[category.value] = sanitized_value
    return sanitized


def _sanitize_goal_overview_categories(selection: object) -> list[str]:
    valid_ids = {category.value for category in Category}
    if not isinstance(selection, list):
        return []

    sanitized: list[str] = []
    for candidate in selection:
        candidate_value = str(candidate)
        if candidate_value in valid_ids:
            sanitized.append(candidate_value)

    return sanitized


def _filter_goal_overview_todos_by_category(
    todos: Sequence[TodoItem], selected_categories: Sequence[str]
) -> list[TodoItem]:
    if not selected_categories:
        return list(todos)

    allowed_categories = set(selected_categories)
    filtered = [todo for todo in todos if todo.category.value in allowed_categories]
    return filtered or list(todos)


JOURNAL_ACTIVE_DATE_KEY = "journal_active_date"
JOURNAL_FORM_SEED_KEY = "journal_form_seed"
JOURNAL_FIELD_PREFIX = "journal_field_"
JOURNAL_PENDING_UPDATES_KEY = "journal_pending_updates"
JOURNAL_PENDING_SELECTION_PREFIX = "journal_pending_selection_"
MOOD_PRESETS: tuple[str, ...] = (
    "ruhig",
    "dankbar",
    "hoffnungsvoll",
    "energievoll",
    "gestresst",
    "überfordert",
    "fokussiert",
)
GOAL_COMPLETION_SELECTOR_VISIBLE_KEY = "goal_completion_selector_visible"
GOAL_COMPLETION_SELECTED_ID_KEY = "goal_completion_selected_id"
QUICK_GOAL_TODO_FORM_KEY = "quick_goal_todo_form"
QUICK_GOAL_JOURNAL_FORM_KEY = "quick_goal_journal_form"
QUICK_GOAL_TODO_DESCRIPTION_KEY = "quick_goal_todo_description"
QUICK_GOAL_TODO_DUE_KEY = "quick_goal_todo_due"
QUICK_GOAL_TODO_QUADRANT_KEY = "quick_goal_todo_quadrant"
QUICK_GOAL_TODO_CATEGORY_KEY = "quick_goal_todo_category"
QUICK_GOAL_TODO_PRIORITY_KEY = "quick_goal_todo_priority"
QUICK_GOAL_TODO_TITLE_KEY = "quick_goal_todo_title"
QUICK_GOAL_JOURNAL_DATE_KEY = "quick_goal_journal_date"
QUICK_GOAL_JOURNAL_MOODS_KEY = "quick_goal_journal_moods"
QUICK_GOAL_JOURNAL_NOTES_KEY = "quick_goal_journal_notes"
QUICK_GOAL_JOURNAL_CATEGORIES_KEY = "quick_goal_journal_categories"
QUICK_GOAL_JOURNAL_GRATITUDE_KEY = "quick_goal_journal_gratitude"
QUICK_GOAL_PROFILE_FORM_KEY = "quick_goal_profile_form"


def _is_streamlit_cloud() -> bool:
    runtime_env = os.getenv("STREAMLIT_RUNTIME_ENVIRONMENT", "").lower()
    if runtime_env in {"streamlit-community-cloud", "communitycloud"}:
        return True

    explicit_flag = os.getenv("STREAMLIT_CLOUD", "").lower() in {"1", "true", "yes"}
    region_flag = os.getenv("STREAMLIT_REGION") is not None
    return explicit_flag or region_flag


def _bootstrap_storage() -> FileStorageBackend:
    backend = FileStorageBackend()
    configure_storage(backend)
    if not st.session_state.get("_storage_loaded", False):
        load_persisted_state()
        st.session_state["_storage_loaded"] = True
    return backend


def _journal_field_key(name: str) -> str:
    return f"{JOURNAL_FIELD_PREFIX}{name}"


def _prefill_journal_form(entry: JournalEntry) -> None:
    last_seed: date | None = st.session_state.get(JOURNAL_FORM_SEED_KEY)
    if last_seed == entry.date:
        return

    st.session_state[JOURNAL_FORM_SEED_KEY] = entry.date
    st.session_state[_journal_field_key("moods")] = entry.moods or list(MOOD_PRESETS[:2])
    st.session_state[_journal_field_key("mood_notes")] = entry.mood_notes
    st.session_state[_journal_field_key("triggers_and_reactions")] = entry.triggers_and_reactions
    st.session_state[_journal_field_key("negative_thought")] = entry.negative_thought
    st.session_state[_journal_field_key("rational_response")] = entry.rational_response
    st.session_state[_journal_field_key("self_care_today")] = entry.self_care_today
    st.session_state[_journal_field_key("self_care_tomorrow")] = entry.self_care_tomorrow
    st.session_state[_journal_field_key("categories")] = entry.categories

    for key in [key for key in st.session_state if key.startswith("journal_gratitude_")]:
        del st.session_state[key]


def _serialize_journal_candidate(candidate: JournalUpdateCandidate) -> dict[str, object]:
    return {
        "target_id": candidate.target_id,
        "target_title": candidate.target_title,
        "suggested_points": candidate.suggested_points,
        "follow_up": candidate.follow_up,
        "rationale": candidate.rationale,
        "progress_delta_percent": candidate.progress_delta_percent,
        "milestones_to_mark_done": candidate.milestones_to_mark_done,
        "create_new_todo": candidate.create_new_todo,
        "suggested_quadrant": candidate.suggested_quadrant,
        "suggested_category": candidate.suggested_category,
    }


def _store_journal_alignment(entry_date: date, suggestion: AISuggestion[JournalAlignmentSuggestion]) -> None:
    payload = suggestion.payload
    actions: list[JournalUpdateCandidate] = getattr(payload, "actions", []) if payload else []
    summary: str = getattr(payload, "summary", "") if payload else ""
    st.session_state[JOURNAL_PENDING_UPDATES_KEY] = {
        "entry_date": entry_date.isoformat(),
        "actions": [_serialize_journal_candidate(action) for action in actions],
        "summary": summary,
        "from_ai": suggestion.from_ai,
    }

    for key in [key for key in st.session_state if key.startswith(JOURNAL_PENDING_SELECTION_PREFIX)]:
        del st.session_state[key]


def _render_journal_alignment_review() -> None:
    pending = st.session_state.get(JOURNAL_PENDING_UPDATES_KEY)
    if not isinstance(pending, Mapping):
        return

    entry_date_raw = pending.get("entry_date")
    try:
        entry_date = date.fromisoformat(str(entry_date_raw))
    except Exception:
        return

    actions = pending.get("actions", [])
    summary = str(pending.get("summary", ""))
    from_ai = bool(pending.get("from_ai"))
    badge = "🤖" if from_ai else "🧭"

    if not actions:
        if summary:
            st.info(f"{badge} {summary}")
        return

    def _safe_quadrant(raw: object | None) -> EisenhowerQuadrant:
        try:
            return ensure_quadrant(str(raw)) if raw is not None else EisenhowerQuadrant.NOT_URGENT_IMPORTANT
        except Exception:
            return EisenhowerQuadrant.NOT_URGENT_IMPORTANT

    def _coerce_category(raw: object | None) -> Category:
        if raw is None:
            return Category.DAILY_STRUCTURE
        candidate = str(raw)
        try:
            return Category(candidate)
        except Exception:
            lowered = candidate.strip().lower()
            for category in Category:
                if lowered == category.label.lower():
                    return category
        return Category.DAILY_STRUCTURE

    st.markdown("#### Vorgeschlagene Updates")
    if summary:
        st.caption(f"{badge} {summary}")
    st.info("Bitte prüfe die vermuteten Fortschritte und bestätige die gewünschten Updates.")

    selected_indices: list[int] = []
    todos_by_id = {todo.id: todo for todo in get_todos()}
    milestone_lookup: dict[str, str] = {}
    for todo in todos_by_id.values():
        for milestone in todo.milestones:
            milestone_lookup[milestone.id] = milestone.title

    for index, action in enumerate(actions):
        if not isinstance(action, Mapping):
            continue

        title = str(action.get("target_title", "Ziel"))
        suggested_points = int(action.get("suggested_points", 0) or 0)
        follow_up = str(action.get("follow_up", ""))
        rationale = str(action.get("rationale", ""))
        progress_delta_percent = float(action.get("progress_delta_percent") or 0.0)
        milestone_ids_raw = action.get("milestones_to_mark_done", [])
        milestone_ids = [str(value) for value in milestone_ids_raw if str(value).strip()]
        create_new_todo = bool(action.get("create_new_todo"))
        suggested_quadrant = action.get("suggested_quadrant")
        suggested_category = action.get("suggested_category")
        display_quadrant = _safe_quadrant(suggested_quadrant) if suggested_quadrant else None
        display_category = _coerce_category(suggested_category) if suggested_category else None

        checkbox_key = f"{JOURNAL_PENDING_SELECTION_PREFIX}{index}"
        label_prefix = "Neue Aufgabe anlegen: " if create_new_todo else ""
        label = f"{label_prefix}{title} (+{suggested_points} Punkte)"
        confirmed = st.checkbox(label, key=checkbox_key)
        if follow_up:
            st.caption(follow_up)
        if rationale:
            st.caption(f"Grund: {rationale}")
        if create_new_todo:
            st.caption("Wird als erledigter Task gespeichert / Will be saved as a completed task.")
        if display_quadrant:
            st.caption(f"Quadrant: {display_quadrant.label}")
        if display_category:
            st.caption(f"Kategorie / Category: {display_category.label}")
        if progress_delta_percent > 0:
            st.caption(f"Fortschritt / Progress: +{progress_delta_percent:.1f}%")
        if milestone_ids:
            milestone_titles = [milestone_lookup.get(milestone_id, milestone_id) for milestone_id in milestone_ids]
            st.caption("Meilensteine erledigen / Complete milestones: " + ", ".join(milestone_titles))

        if confirmed:
            selected_indices.append(index)

    apply_disabled = len(selected_indices) == 0
    if st.button(
        "Ausgewählte Updates anwenden",
        type="primary",
        disabled=apply_disabled,
    ):
        created_todo_ids: list[str] = []
        for index in selected_indices:
            if index >= len(actions):
                continue
            action = actions[index]
            if not isinstance(action, Mapping):
                continue
            title = str(action.get("target_title", "Ziel"))
            points = int(action.get("suggested_points", 0) or 0)
            rationale = str(action.get("rationale", "")) or "Journalabgleich"
            target_id = str(action.get("target_id")) if action.get("target_id") else None
            progress_delta_percent = float(action.get("progress_delta_percent") or 0.0)
            milestone_ids_raw = action.get("milestones_to_mark_done", [])
            milestone_ids = [str(value) for value in milestone_ids_raw if str(value).strip()]
            create_new_todo = bool(action.get("create_new_todo"))
            quadrant = _safe_quadrant(action.get("suggested_quadrant"))
            category = _coerce_category(action.get("suggested_category"))
            award_journal_points(
                entry_date=entry_date,
                target_title=title,
                points=points,
                rationale=rationale,
            )

            if create_new_todo:
                new_todo = add_todo(
                    title=title,
                    quadrant=quadrant,
                    due_date=entry_date,
                    category=category,
                    description_md=rationale,
                )
                toggled = toggle_complete(new_todo.id)
                created_record = toggled or new_todo
                created_todo_ids.append(created_record.id)
                todos_by_id[created_record.id] = created_record

            if target_id and progress_delta_percent > 0:
                target_todo = todos_by_id.get(target_id)
                if target_todo:
                    target = target_todo.progress_target if target_todo.progress_target is not None else 100.0
                    delta_value = target * (progress_delta_percent / 100)
                    source_event_id = f"journal:{entry_date.isoformat()}:{target_id}:progress:{index}"
                    updated = update_todo_progress(
                        target_todo,
                        delta=delta_value,
                        source_event_id=source_event_id,
                    )
                    if updated:
                        todos_by_id[target_id] = updated

            if target_id and milestone_ids:
                for milestone_id in milestone_ids:
                    update_milestone(
                        todo_id=target_id,
                        milestone_id=milestone_id,
                        status=MilestoneStatus.DONE,
                    )

        if created_todo_ids:
            journal_entries = get_journal_entries()
            entry = journal_entries.get(entry_date)
            if entry:
                updated_entry = append_journal_links(entry, created_todo_ids)
                upsert_journal_entry(updated_entry)

        st.success("Updates gespeichert.")
        st.session_state.pop(JOURNAL_PENDING_UPDATES_KEY, None)
        st.rerun()


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()

    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _journal_json_export(entries: Mapping[date, JournalEntry]) -> str:
    payload = {entry_date.isoformat(): entry.model_dump(mode="json") for entry_date, entry in entries.items()}
    return json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default)


def _journal_markdown_export(entries: Mapping[date, JournalEntry]) -> str:
    lines: list[str] = []
    for entry_date in sorted(entries):
        entry = entries[entry_date]
        lines.append(f"## {entry_date.isoformat()}")
        lines.append("")
        moods = ", ".join(entry.moods) if entry.moods else "—"
        lines.append(f"**Stimmung:** {moods}")
        if entry.mood_notes.strip():
            lines.append(entry.mood_notes.strip())
        lines.append("")
        lines.append("**Auslöser & Reaktionen**")
        lines.append(entry.triggers_and_reactions or "—")
        lines.append("")
        lines.append("**Gedanken-Challenge**")
        lines.append(f"- Automatischer Gedanke: {entry.negative_thought or '—'}")
        lines.append(f"- Reframing: {entry.rational_response or '—'}")
        lines.append("")
        lines.append("**Selbstfürsorge**")
        lines.append(f"- Heute: {entry.self_care_today or '—'}")
        lines.append(f"- Morgen: {entry.self_care_tomorrow or '—'}")
        lines.append("")
        lines.append("**Lichtblicke**")
        gratitudes = entry.gratitudes or [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3]
        if not gratitudes:
            gratitudes = [""]

        for idx, value in enumerate(gratitudes, start=1):
            lines.append(f"- Dankbarkeit {idx}: {value or '—'}")
        if entry.categories:
            labels = ", ".join(category.label for category in entry.categories)
            lines.append("")
            lines.append(f"**Kategorien:** {labels}")
        lines.append("")

    return "\n".join(lines).strip()


def _render_gratitude_inputs(gratitude_suggestions: list[str]) -> list[str]:
    stored_gratitudes = st.session_state.get(_journal_field_key("gratitudes"), [])
    if not isinstance(stored_gratitudes, list):
        stored_gratitudes = []

    base_values = [value for value in stored_gratitudes if isinstance(value, str)]
    display_values = [value for value in base_values if value.strip()]
    if not display_values:
        display_values = [""]
    if display_values[-1].strip():
        display_values.append("")

    rendered_values: list[str] = []
    for index, default_value in enumerate(display_values):
        rendered = st.text_input(
            f"Dankbarkeit {index + 1}",
            value=default_value,
            key=f"journal_gratitude_{index}",
            placeholder=("z. B. Kaffee am Morgen, Gespräch mit Freund:in"),
        )
        rendered_values.append(rendered)

    cleaned_gratitudes = [value.strip() for value in rendered_values if value.strip()]
    st.session_state[_journal_field_key("gratitudes")] = cleaned_gratitudes

    if gratitude_suggestions:
        st.caption("Vorschläge aus früheren Einträgen: " + ", ".join(gratitude_suggestions[:6]))

    return cleaned_gratitudes


def _render_storage_notice(backend: FileStorageBackend, *, is_cloud: bool) -> None:
    storage_note = f"Persistenz aktiv: JSON unter {backend.path} (lokal beschreibbar)."
    onedrive_hint = (
        "OneDrive-Sync erkannt; mobile Einträge werden abgeglichen."
        if any(part.lower() == "onedrive" for part in backend.path.parts)
        else "Lokaler Pfad ohne Sync – OneDrive-Pfad via Umgebungsvariable setzen."
    )
    if is_cloud:
        storage_note += (
            " Streamlit Community Cloud speichert Dateien oft nur temporär – nach Neustarts "
            "kann der Zustand verloren gehen."
        )
    st.info(f"{storage_note} {onedrive_hint}")


def _parse_backup_payload(raw_bytes: bytes) -> dict[str, object] | None:
    try:
        decoded = raw_bytes.decode("utf-8")
        payload = json.loads(decoded)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None

    if not isinstance(payload, Mapping):
        return None

    filtered = {key: payload[key] for key in PERSISTED_KEYS if key in payload}
    if not filtered:
        return None

    return filtered


def _restore_backup_state(payload: Mapping[str, object]) -> None:
    for key in PERSISTED_KEYS:
        if key in payload:
            st.session_state[key] = payload[key]
    init_state()
    persist_state()


def _ensure_settings_defaults(*, client: Optional[OpenAI], stats: KpiStats) -> dict[str, Any]:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    if not isinstance(settings, dict):
        settings = {}

    settings.setdefault(AI_ENABLED_KEY, bool(client))
    settings.setdefault(SHOW_SAFETY_NOTES_KEY, False)
    settings.setdefault(SHOW_STORAGE_NOTICE_KEY, False)
    settings.setdefault("goal_daily", stats.goal_daily)
    settings.setdefault("gamification_mode", GamificationMode.POINTS.value)
    settings["category_goals"] = _sanitize_category_goals(settings)
    settings["goal_profile"] = _sanitize_goal_profile(settings)

    st.session_state[SS_SETTINGS] = settings
    return settings


def _coerce_goal_value(raw_value: object | None, fallback: int) -> int:
    try:
        coerced = int(cast(int, raw_value))
    except (TypeError, ValueError):
        return fallback
    return max(1, coerced)


def _settings_widget_key(base_key: str, key_suffix: str) -> str:
    return f"{base_key}_{key_suffix}" if key_suffix else base_key


def _resolve_goal_input_value(*, settings: Mapping[str, Any], stats: KpiStats, key_suffix: str = "") -> int:
    fallback_goal = _coerce_goal_value(settings.get("goal_daily"), stats.goal_daily)
    existing_value = st.session_state.get(_settings_widget_key(SETTINGS_GOAL_DAILY_KEY, key_suffix))
    if existing_value is None:
        return fallback_goal
    return _coerce_goal_value(existing_value, fallback_goal)


def _render_ai_and_safety_section(
    *, panel: Any, settings: dict[str, Any], client: Optional[OpenAI], key_suffix: str
) -> tuple[bool, bool]:
    panel.markdown(translate_text(("#### AI & Sicherheit", "#### AI & safety")))
    ai_enabled = render_ai_toggle(
        settings,
        client=client,
        container=panel,
        key_suffix=key_suffix or "panel",
    )
    safety_notice = False
    with _panel_section(panel, translate_text(("Sicherheit & Daten", "Safety & data"))) as safety_panel:
        safety_notice = render_safety_panel(panel=safety_panel or panel, key_suffix=key_suffix or "panel")
    panel.divider()
    return ai_enabled, safety_notice


def _render_daily_goal_section(*, panel: Any, settings: dict[str, Any], stats: KpiStats, key_suffix: str) -> None:
    panel.subheader(translate_text(("Tagesziele & Planung", "Daily targets & planning")))
    goal_input_value = _resolve_goal_input_value(settings=settings, stats=stats, key_suffix=key_suffix)
    daily_goal_key = _settings_widget_key(SETTINGS_GOAL_DAILY_KEY, key_suffix)
    goal_value = panel.number_input(
        translate_text(("Ziel pro Tag", "Daily target")),
        min_value=1,
        step=1,
        value=goal_input_value,
        key=daily_goal_key,
        help=translate_text(
            (
                "Setzt das Tagesziel für erledigte Aufgaben – Grundlage für die KPI-Berechnung.",
                "Sets the daily completion target that feeds your KPIs.",
            )
        ),
    )
    settings["goal_daily"] = int(goal_value)

    if panel.button(
        translate_text(("Tagesziel speichern", "Save daily goal")),
        key=_settings_widget_key("settings_save_goal_daily", key_suffix),
        help=translate_text(
            (
                "Aktualisiert das Tagesziel und speichert es in deinen KPIs.",
                "Updates the daily goal and stores it in your KPIs.",
            )
        ),
    ):
        update_goal_daily(int(goal_value))
        panel.success(translate_text(("Tagesziel aktualisiert", "Daily goal updated")))


def _widget_key(base: str, *, key_suffix: str) -> str | None:
    return f"{base}_{key_suffix}" if key_suffix else None


def _category_goal_key(category_value: str, *, key_suffix: str) -> str:
    return f"goal_{category_value}_{key_suffix}" if key_suffix else f"goal_{category_value}"


def _tabs_with_optional_key(panel: Any, labels: list[str], *, key_suffix: str) -> list[Any]:
    if key_suffix:
        labels = [f"{label}\u200b{key_suffix}" for label in labels]
    return panel.tabs(labels)


def _panel_section(panel: Any, label: str) -> Any:
    expander = getattr(panel, "expander", None)
    if callable(expander):
        return expander(label)
    return nullcontext()


def render_settings_panel(
    stats: KpiStats,
    client: Optional[OpenAI],
    *,
    panel: Any | None = None,
    include_ai_and_safety: bool = False,
) -> bool:
    panel = panel or st

    settings = _ensure_settings_defaults(client=client, stats=stats)
    ai_enabled = bool(settings.get(AI_ENABLED_KEY, bool(client)))
    goal_profile: GoalProfile = settings.get("goal_profile", _default_goal_profile())

    if include_ai_and_safety:
        ai_enabled, _ = _render_ai_and_safety_section(panel=panel, settings=settings, client=client, key_suffix="panel")

    _render_daily_goal_section(panel=panel, settings=settings, stats=stats, key_suffix="")

    if not st.session_state.get(GOAL_CREATION_VISIBLE_KEY, False):
        return ai_enabled

    _render_goal_canvas(panel=panel, goal_profile=goal_profile, settings=settings, key_suffix="")

    st.session_state[SS_SETTINGS] = settings
    persist_state()
    return ai_enabled


def _render_goal_canvas(*, panel: Any, goal_profile: GoalProfile, settings: dict[str, Any], key_suffix: str) -> None:
    panel.markdown(translate_text(("### Ziel-Canvas", "### Goal canvas")))
    panel.info(
        translate_text(
            (
                """
                **Wichtigste Elemente / Key essentials**
                - Titel & Fokus-Kategorien für Klarheit
                - Zeithorizont & Zieltermin für die Planung
                - Messbarer Zielwert inklusive Einheit
                - Konkreter nächster Schritt als Startpunkt
                - Motivation und Erfolgskriterien für Verbindlichkeit
                """,
                """
                **Key essentials when creating a goal**
                - Title & focus categories to keep the scope clear
                - Time horizon & target date for planning
                - Measurable target value including the unit
                - A concrete next step to get started
                - Motivation and success criteria to stay committed
                """,
            )
        )
    )
    canvas_columns = panel.columns(2)
    horizon_options = [option for option, _ in GOAL_HORIZON_OPTIONS]
    cadence_options = [option for option, _ in GOAL_CHECKIN_OPTIONS]
    try:
        horizon_index = horizon_options.index(goal_profile.get("horizon", "30_days"))
    except ValueError:
        horizon_index = 0
    try:
        cadence_index = cadence_options.index(goal_profile.get("check_in_cadence", "weekly"))
    except ValueError:
        cadence_index = 0
    with canvas_columns[0]:
        profile_title = panel.text_input(
            "Zielname",
            value=goal_profile.get("title", ""),
            placeholder="z. B. 3 Bewerbungen pro Woche",
            help="Kurzer, messbarer Titel für dein Ziel",
            key=_widget_key("goal_profile_title", key_suffix=key_suffix),
        )
        focus_categories = panel.multiselect(
            "Fokus-Kategorien",
            options=list(Category),
            default=[category for category in Category if category.value in goal_profile.get("focus_categories", [])],
            format_func=lambda option: option.label,
            help="Welche Lebensbereiche zahlt das Ziel ein?",
            key=_widget_key("goal_profile_focus", key_suffix=key_suffix),
        )
        horizon = panel.selectbox(
            "Zeithorizont",
            options=horizon_options,
            index=max(0, horizon_index),
            format_func=lambda value: _goal_option_label(value, GOAL_HORIZON_OPTIONS),
            help="Wähle deinen Planungszeitraum",
            key=_widget_key("goal_profile_horizon", key_suffix=key_suffix),
        )
        start_date = panel.date_input(
            "Startdatum",
            value=goal_profile.get("start_date"),
            format="YYYY-MM-DD",
            help="Optional: Ab wann zählst du Fortschritt?",
            key=_widget_key("goal_profile_start", key_suffix=key_suffix),
        )
        target_date = panel.date_input(
            "Zieltermin",
            value=goal_profile.get("target_date"),
            format="YYYY-MM-DD",
            help="Wann soll das Ziel erreicht sein?",
            key=_widget_key("goal_profile_target", key_suffix=key_suffix),
        )
        check_in_cadence = panel.selectbox(
            "Check-in-Rhythmus",
            options=cadence_options,
            index=max(0, cadence_index),
            format_func=lambda value: _goal_option_label(value, GOAL_CHECKIN_OPTIONS),
            help="Wie oft reflektierst du Fortschritt?",
            key=_widget_key("goal_profile_cadence", key_suffix=key_suffix),
        )
    with canvas_columns[1]:
        enable_metric = panel.toggle(
            "Messbar machen",
            value=bool(goal_profile.get("metric_target") is not None or goal_profile.get("metric_unit")),
            help="Zielwert + Einheit pflegen, um Fortschritt klar messbar zu halten.",
            key=_widget_key("goal_profile_metric_toggle", key_suffix=key_suffix),
        )
        metric_target = panel.number_input(
            "Zielwert",
            min_value=0.0,
            value=float(goal_profile.get("metric_target") or 0.0),
            step=0.5,
            disabled=not enable_metric,
            help="Numerischer Zielwert, z. B. 3.0 oder 10.0",
            key=_widget_key("goal_profile_metric_target", key_suffix=key_suffix),
        )
        metric_unit = panel.text_input(
            "Einheit",
            value=goal_profile.get("metric_unit", ""),
            max_chars=40,
            disabled=not enable_metric,
            help="Einheit für den Zielwert, z. B. Bewerbungen, Minuten.",
            key=_widget_key("goal_profile_metric_unit", key_suffix=key_suffix),
        )
        next_step_tabs = _tabs_with_optional_key(panel, ["Nächster Schritt", "Vorschau"], key_suffix=key_suffix)
        with next_step_tabs[0]:
            next_step_md = st.text_area(
                "Konkreter erster Schritt",
                value=goal_profile.get("next_step_md", ""),
                placeholder="Nächster kalendarischer Schritt oder Termin",
                key=_widget_key("goal_profile_next_step", key_suffix=key_suffix),
            )
        with next_step_tabs[1]:
            next_step_preview = goal_profile.get("next_step_md", "")
            if next_step_preview.strip():
                st.markdown(next_step_preview)
            else:
                st.caption("Noch kein nächster Schritt hinterlegt")
        celebration_tabs = _tabs_with_optional_key(panel, ["Erfolg feiern", "Vorschau"], key_suffix=key_suffix)
        with celebration_tabs[0]:
            celebration_md = st.text_area(
                "Belohnung planen",
                value=goal_profile.get("celebration_md", ""),
                placeholder="Wie feierst du den Abschluss?",
                key=_widget_key("goal_profile_celebration", key_suffix=key_suffix),
            )
        with celebration_tabs[1]:
            celebration_preview = goal_profile.get("celebration_md", "")
            if celebration_preview.strip():
                st.markdown(celebration_preview)
            else:
                st.caption("Noch keine Belohnung definiert")

    panel.markdown("#### Erfolg & Motivation")
    success_columns = panel.columns(2)
    with success_columns[0]:
        criteria_tabs = _tabs_with_optional_key(panel, ["Erfolgskriterien", "Vorschau"], key_suffix=key_suffix)
        with criteria_tabs[0]:
            success_criteria_md = st.text_area(
                "Wie erkennst du Erfolg?",
                value=goal_profile.get("success_criteria_md", ""),
                placeholder="z. B. 2 Bewerbungen pro Woche mit Feedback",
                key=_widget_key("goal_profile_success", key_suffix=key_suffix),
            )
        with criteria_tabs[1]:
            criteria_preview = goal_profile.get("success_criteria_md", "")
            if criteria_preview.strip():
                st.markdown(criteria_preview)
            else:
                st.caption("Noch keine Kriterien definiert")
        risk_tabs = _tabs_with_optional_key(panel, ["Risiken & Sicherungen", "Vorschau"], key_suffix=key_suffix)
        with risk_tabs[0]:
            risk_mitigation_md = st.text_area(
                "Risiken & Sicherungen",
                value=goal_profile.get("risk_mitigation_md", ""),
                placeholder="Hindernisse, Plan B, Accountability",
                key=_widget_key("goal_profile_risks", key_suffix=key_suffix),
            )
        with risk_tabs[1]:
            risk_preview = goal_profile.get("risk_mitigation_md", "")
            if risk_preview.strip():
                st.markdown(risk_preview)
            else:
                st.caption("Noch keine Risiken notiert")
    with success_columns[1]:
        motivation_tabs = _tabs_with_optional_key(panel, ["Motivation", "Vorschau"], key_suffix=key_suffix)
        with motivation_tabs[0]:
            motivation_md = st.text_area(
                "Warum ist das Ziel wichtig?",
                value=goal_profile.get("motivation_md", ""),
                placeholder="Persönlicher Nutzen, Chancen, Unterstützung",
                key=_widget_key("goal_profile_motivation", key_suffix=key_suffix),
            )
        with motivation_tabs[1]:
            motivation_preview = goal_profile.get("motivation_md", "")
            if motivation_preview.strip():
                st.markdown(motivation_preview)
            else:
                st.caption("Motivation noch leer")

    goal_profile["title"] = profile_title.strip()
    goal_profile["focus_categories"] = [category.value for category in focus_categories]
    goal_profile["horizon"] = horizon
    goal_profile["start_date"] = start_date
    goal_profile["target_date"] = target_date
    goal_profile["check_in_cadence"] = check_in_cadence
    goal_profile["next_step_md"] = next_step_md
    goal_profile["celebration_md"] = celebration_md
    goal_profile["success_criteria_md"] = success_criteria_md
    goal_profile["motivation_md"] = motivation_md
    goal_profile["risk_mitigation_md"] = risk_mitigation_md
    if enable_metric:
        goal_profile["metric_target"] = float(metric_target)
        goal_profile["metric_unit"] = metric_unit.strip()
    else:
        goal_profile["metric_target"] = None
        goal_profile["metric_unit"] = ""
    settings["goal_profile"] = _sanitize_goal_profile({"goal_profile": goal_profile})

    profile_saved = panel.button(
        translate_text(("Zielprofil speichern", "Save goal profile")),
        key=_settings_widget_key("settings_save_goal_profile", key_suffix),
        help=translate_text(
            (
                "Sichert Titel, Kriterien, Motivation und Check-ins.",
                "Stores title, criteria, motivation, and check-ins.",
            )
        ),
    )
    if profile_saved:
        panel.success(translate_text(("Zielprofil aktualisiert", "Goal profile updated")))

    with _panel_section(panel, translate_text(("Kategorienziele", "Category goals"))):
        category_goals = settings.get("category_goals", {})
        goal_columns = panel.columns(2)
        for index, category in enumerate(Category):
            with goal_columns[index % 2]:
                goal_value = panel.number_input(
                    f"{category.label}",
                    min_value=0,
                    max_value=20,
                    step=1,
                    value=int(category_goals.get(category.value, 1)),
                    key=_category_goal_key(category.value, key_suffix=key_suffix),
                    help=translate_text(
                        (
                            "Tagesziel pro Kategorie – dient als Basis für das Ziel-Dashboard.",
                            "Daily target per category used by the goal dashboard.",
                        )
                    ),
                )
                category_goals[category.value] = int(goal_value)

        settings["category_goals"] = _sanitize_category_goals(settings)
        settings["category_goals"].update(category_goals)


def _build_category_progress(snapshot: CategoryKpi) -> go.Figure:
    x_max = max(snapshot.daily_goal, snapshot.done_today, 1)
    bar = go.Bar(
        x=[snapshot.done_today],
        y=[snapshot.category.label],
        orientation="h",
        marker_color=PRIMARY_COLOR,
        textfont_color="#E6F2EC",
        text=[f"{snapshot.done_today}/{snapshot.daily_goal}"],
        textposition="outside",
        hovertemplate=(f"{snapshot.category.label}<br>Heute erledigtTagesziel"),
    )
    figure = go.Figure(bar)
    figure.update_layout(
        height=140,
        margin=dict(t=10, r=10, b=10, l=10),
        xaxis=dict(range=[0, x_max], visible=False),
        yaxis=dict(visible=False),
        font=dict(color="#E6F2EC"),
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
    )
    return figure


NEW_TASK_WEEKLY_GOAL = 7
POINTS_PER_NEW_TASK = 10


def _build_category_gauge(snapshot: CategoryKpi) -> go.Figure:
    axis_max = max(snapshot.daily_goal, snapshot.done_today, 1)
    figure = go.Figure(
        go.Indicator(
            mode="gauge+number",
            value=snapshot.done_today,
            number={
                "suffix": f"/{snapshot.daily_goal}",
                "font": {"color": "#E6F2EC", "size": 26},
            },
            title={"text": snapshot.category.label, "font": {"color": "#E6F2EC", "size": 14}},
            gauge={
                "axis": {"range": [0, axis_max], "tickcolor": "#c5d5d1"},
                "bar": {"color": PRIMARY_COLOR, "thickness": 0.4},
                "bgcolor": "rgba(255,255,255,0.03)",
                "borderwidth": 1,
                "bordercolor": "#1f4a42",
                "steps": [
                    {"range": [0, axis_max * 0.5], "color": "rgba(28,156,130,0.08)"},
                    {"range": [axis_max * 0.5, axis_max * 0.85], "color": "rgba(28,156,130,0.14)"},
                    {"range": [axis_max * 0.85, axis_max], "color": "rgba(28,156,130,0.22)"},
                ],
            },
        )
    )
    figure.update_layout(
        height=240,
        margin=dict(t=10, r=10, b=0, l=10),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return figure


def _build_new_tasks_gauge(new_task_count: int) -> go.Figure:
    axis_max = max(NEW_TASK_WEEKLY_GOAL, new_task_count, 1)
    target_suffix = f"/{NEW_TASK_WEEKLY_GOAL}"
    figure = go.Figure(
        go.Indicator(
            mode="gauge+number",
            value=new_task_count,
            number={
                "suffix": target_suffix,
                "font": {"color": "#E6F2EC", "size": 26},
            },
            title={
                "text": translate_text(("Neue Aufgaben (7 Tage)", "New tasks (7 days)")),
                "font": {"color": "#E6F2EC", "size": 14},
            },
            gauge={
                "axis": {"range": [0, axis_max], "tickcolor": "#c5d5d1"},
                "bar": {"color": PRIMARY_COLOR, "thickness": 0.4},
                "bgcolor": "rgba(255,255,255,0.03)",
                "borderwidth": 1,
                "bordercolor": "#1f4a42",
                "steps": [
                    {"range": [0, axis_max * 0.5], "color": "rgba(28,156,130,0.08)"},
                    {"range": [axis_max * 0.5, axis_max * 0.85], "color": "rgba(28,156,130,0.14)"},
                    {"range": [axis_max * 0.85, axis_max], "color": "rgba(28,156,130,0.22)"},
                ],
            },
        )
    )
    figure.update_layout(
        height=260,
        margin=dict(t=10, r=10, b=0, l=10),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return figure


def _render_goal_quick_todo_popover(
    *,
    form_key: str = QUICK_GOAL_TODO_FORM_KEY,
    key_suffix: str | None = None,
    trigger_label: tuple[str, str] = ("📝 Aufgabe", "📝 Task"),
) -> None:
    def _with_suffix(base_key: str) -> str:
        return f"{base_key}_{key_suffix}" if key_suffix else base_key

    title_key = _with_suffix(QUICK_GOAL_TODO_TITLE_KEY)
    due_key = _with_suffix(QUICK_GOAL_TODO_DUE_KEY)
    quadrant_key = _with_suffix(QUICK_GOAL_TODO_QUADRANT_KEY)
    category_key = _with_suffix(QUICK_GOAL_TODO_CATEGORY_KEY)
    priority_key = _with_suffix(QUICK_GOAL_TODO_PRIORITY_KEY)
    description_key = _with_suffix(QUICK_GOAL_TODO_DESCRIPTION_KEY)

    with st.popover(translate_text(trigger_label), width="stretch"):
        st.markdown("**ToDo hinzufügen / Add task**")
        with st.form(_with_suffix(form_key)):
            title = st.text_input(
                translate_text(("Titel / Title", "Title / Title")),
                key=title_key,
                placeholder=translate_text(
                    (
                        "z. B. Neue Aufgabe anlegen",
                        "e.g., Add a new task",
                    )
                ),
            )
            due_date = st.date_input(
                translate_text(("Fälligkeitsdatum", "Due date")),
                value=st.session_state.get(due_key, date.today()),
                format="YYYY-MM-DD",
                key=due_key,
            )
            quadrant = st.selectbox(
                translate_text(("Eisenhower-Quadrant", "Eisenhower quadrant")),
                options=list(EisenhowerQuadrant),
                format_func=lambda option: option.label,
                key=quadrant_key,
            )
            meta_cols = st.columns(2)
            with meta_cols[0]:
                category = st.selectbox(
                    translate_text(("Kategorie", "Category")),
                    options=list(Category),
                    format_func=lambda option: option.label,
                    key=category_key,
                )
            with meta_cols[1]:
                priority = st.slider(
                    translate_text(("Priorität", "Priority")),
                    min_value=1,
                    max_value=5,
                    value=int(st.session_state.get(priority_key, 3)),
                    key=priority_key,
                )

            description_md = st.text_area(
                translate_text(("Beschreibung", "Description")),
                key=description_key,
                placeholder=translate_text(
                    (
                        "Kurz notieren, worum es geht",
                        "Briefly describe the task",
                    )
                ),
            )

            submitted = st.form_submit_button(
                translate_text(("Aufgabe speichern", "Save task")),
                type="primary",
            )

            if submitted:
                if not title.strip():
                    st.warning(
                        translate_text(
                            (
                                "Bitte einen Titel eintragen.",
                                "Please add a title.",
                            )
                        )
                    )
                else:
                    add_todo(
                        title=title.strip(),
                        quadrant=quadrant,
                        due_date=due_date,
                        category=category,
                        priority=priority,
                        description_md=description_md.strip(),
                    )
                    st.success(
                        translate_text(
                            (
                                "Aufgabe angelegt.",
                                "Task created.",
                            )
                        )
                    )
                    st.rerun()


def _render_goal_quick_goal_popover(
    *,
    settings: dict[str, Any],
    form_key: str = QUICK_GOAL_PROFILE_FORM_KEY,
    trigger_label: tuple[str, str] = ("🎯 Ziel", "🎯 Goal"),
) -> None:
    default_profile = settings.get("goal_profile", _default_goal_profile())
    with st.popover(translate_text(trigger_label), width="stretch"):
        st.markdown("**Ziel hinzufügen / Add goal**")
        with st.form(form_key):
            title = st.text_input(
                translate_text(("Zielname", "Goal name")),
                value=str(default_profile.get("title", "")),
                placeholder=translate_text(
                    ("z. B. 10.000 Schritte täglich", "e.g., 10k steps per day"),
                ),
            )
            focus_categories = st.multiselect(
                translate_text(("Fokus-Kategorien", "Focus categories")),
                options=list(Category),
                default=[
                    category for category in Category if category.value in default_profile.get("focus_categories", [])
                ],
                format_func=lambda option: option.label,
                help=translate_text(
                    (
                        "Wähle die Lebensbereiche, die du stärken willst.",
                        "Pick the life areas you want to strengthen.",
                    )
                ),
            )
            target_date = st.date_input(
                translate_text(("Zieldatum", "Target date")),
                value=cast(date | None, default_profile.get("target_date")) or date.today() + timedelta(days=30),
                format="YYYY-MM-DD",
            )
            metric_unit = st.text_input(
                translate_text(("Mess-Einheit", "Metric unit")),
                value=str(default_profile.get("metric_unit", "")),
                placeholder=translate_text(("z. B. km, Sessions", "e.g., km, sessions")),
            )

            submitted = st.form_submit_button(
                translate_text(("Ziel speichern", "Save goal")),
                type="primary",
            )
            if submitted:
                goal_profile: GoalProfile = _default_goal_profile()
                goal_profile.update(default_profile)
                goal_profile.update(
                    {
                        "title": title.strip(),
                        "focus_categories": [category.value for category in focus_categories],
                        "target_date": target_date,
                        "metric_unit": metric_unit.strip(),
                    }
                )
                settings["goal_profile"] = goal_profile
                st.session_state[SS_SETTINGS] = settings
                st.session_state[GOAL_CREATION_VISIBLE_KEY] = True
                st.session_state[NAVIGATION_SELECTION_KEY] = GOALS_PAGE_KEY
                persist_state()
                st.success(
                    translate_text(
                        (
                            "Zielvorlage gespeichert – passe Details im Canvas an.",
                            "Goal template saved — adjust details in the canvas.",
                        )
                    )
                )
                st.rerun()


def _render_goal_quick_journal_popover() -> None:
    with st.popover(
        translate_text(("📓 Journal", "📓 Journal")),
        width="stretch",
    ):
        st.markdown("**Tagebucheintrag / Journal entry**")
        with st.form(QUICK_GOAL_JOURNAL_FORM_KEY):
            entry_date = st.date_input(
                translate_text(("Datum", "Date")),
                value=st.session_state.get(QUICK_GOAL_JOURNAL_DATE_KEY, date.today()),
                max_value=date.today(),
                format="YYYY-MM-DD",
                key=QUICK_GOAL_JOURNAL_DATE_KEY,
            )
            moods = st.multiselect(
                translate_text(("Stimmung", "Mood")),
                options=list(MOOD_PRESETS),
                default=st.session_state.get(QUICK_GOAL_JOURNAL_MOODS_KEY, list(MOOD_PRESETS[:2])),
                key=QUICK_GOAL_JOURNAL_MOODS_KEY,
                help=translate_text(
                    (
                        "Wähle passende Stimmungstags aus oder ergänze eigene.",
                        "Pick mood tags or add your own.",
                    )
                ),
            )
            notes = st.text_area(
                translate_text(("Notizen", "Notes")),
                key=QUICK_GOAL_JOURNAL_NOTES_KEY,
                placeholder=translate_text(
                    (
                        "Kurz festhalten, was heute wichtig war",
                        "Briefly capture what mattered today",
                    )
                ),
            )
            gratitude = st.text_input(
                translate_text(("Dankbarkeit (optional)", "Gratitude (optional)")),
                key=QUICK_GOAL_JOURNAL_GRATITUDE_KEY,
                placeholder=translate_text(
                    (
                        "z. B. Spaziergang in der Sonne",
                        "e.g., Walk in the sun",
                    )
                ),
            )
            categories = st.multiselect(
                translate_text(("Kategorien", "Categories")),
                options=list(Category),
                format_func=lambda option: option.label,
                key=QUICK_GOAL_JOURNAL_CATEGORIES_KEY,
                help=translate_text(
                    (
                        "Ordne den Eintrag optional deinen Lebensbereichen zu.",
                        "Optionally map the entry to your life areas.",
                    )
                ),
            )

            submitted = st.form_submit_button(
                translate_text(("Eintrag speichern", "Save entry")),
                type="primary",
            )
            if submitted:
                entry = JournalEntry(
                    date=entry_date,
                    moods=list(moods),
                    mood_notes=notes.strip(),
                    triggers_and_reactions="",
                    negative_thought="",
                    rational_response="",
                    self_care_today="",
                    self_care_tomorrow="",
                    gratitudes=[gratitude.strip()] if gratitude.strip() else [],
                    categories=list(categories),
                )
                upsert_journal_entry(entry)
                st.success(
                    translate_text(
                        (
                            "Eintrag gespeichert.",
                            "Entry saved.",
                        )
                    )
                )
                st.rerun()


def render_goal_completion_logger(todos: list[TodoItem]) -> None:
    _sync_tasks_streamlit()
    open_todos = [todo for todo in todos if not todo.completed]
    show_selector = bool(st.session_state.get(GOAL_COMPLETION_SELECTOR_VISIBLE_KEY, False))

    action_cols = st.columns([1, 1, 1, 1])
    with action_cols[0]:
        create_goal_clicked = st.button(
            translate_text(("Ziel erstellen", "Create goal")),
            type="primary",
            help=translate_text(
                (
                    "Öffnet die Ziel-Canvas für neue Ziele.",
                    "Opens the goal canvas for new objectives.",
                )
            ),
        )
    with action_cols[1]:
        completion_clicked = st.button(
            "Gelöst / Completed",
            type="primary",
            disabled=not open_todos,
            help=translate_text(
                (
                    "Dokumentiert den Abschluss, aktualisiert KPI-Dashboard, Tachometer und Gamification.",
                    "Logs the completion and refreshes the KPI dashboard, gauges, and gamification.",
                )
            ),
        )
    with action_cols[2]:
        _render_goal_quick_todo_popover(
            form_key=f"{QUICK_GOAL_TODO_FORM_KEY}_completion",
            key_suffix="completion",
        )
    with action_cols[3]:
        _render_goal_quick_journal_popover()

    if create_goal_clicked:
        st.session_state[GOAL_CREATION_VISIBLE_KEY] = True
        st.session_state[NAVIGATION_SELECTION_KEY] = GOALS_PAGE_KEY
        st.rerun()

    if not open_todos:
        st.info(
            translate_text(
                (
                    "Alle Aufgaben sind bereits erledigt – großartig!",
                    "All tasks are done already — great job!",
                )
            )
        )
        st.session_state[GOAL_COMPLETION_SELECTOR_VISIBLE_KEY] = False
        st.session_state.pop(GOAL_COMPLETION_SELECTED_ID_KEY, None)
        return

    option_lookup = {todo.id: f"{todo.title} · {todo.category.label} · {todo.quadrant.label}" for todo in open_todos}

    selected_todo_id: str | None = None
    if show_selector:
        selected_todo_id = st.selectbox(
            "Welche Aufgabe ist erledigt? / Which task is done?",
            options=list(option_lookup),
            format_func=lambda value: option_lookup.get(value, value),
            key=GOAL_COMPLETION_SELECTED_ID_KEY,
            help=translate_text(
                (
                    "Wähle eine offene Aufgabe aus, die du abschließen möchtest.",
                    "Pick one of your open tasks to complete it.",
                )
            ),
        )

    if completion_clicked:
        if not show_selector:
            st.session_state[GOAL_COMPLETION_SELECTOR_VISIBLE_KEY] = True
            st.rerun()
        else:
            target = next((todo for todo in open_todos if todo.id == selected_todo_id), None)
            if not target:
                st.warning(
                    translate_text(
                        (
                            "Bitte wähle eine Aufgabe aus der Liste aus.",
                            "Please select a task from the list.",
                        )
                    )
                )
                return

            previous_state = gamification_snapshot()
            updated = toggle_complete(target.id)
            if updated and updated.completed:
                handle_completion_success(updated, previous_state=previous_state)
                st.rerun()
            else:
                st.error(
                    translate_text(
                        (
                            "Konnte den Abschluss nicht speichern.",
                            "Could not persist the completion.",
                        )
                    )
                )


def _milestone_points(milestone: Milestone) -> int:
    if milestone.points:
        return milestone.points
    if milestone.complexity is MilestoneComplexity.SMALL:
        return 10
    if milestone.complexity is MilestoneComplexity.MEDIUM:
        return 25
    return 50


def _milestone_progress(todo: TodoItem) -> tuple[float, int, int]:
    total_points = sum(_milestone_points(item) for item in todo.milestones)
    completed_points = sum(_milestone_points(item) for item in todo.milestones if item.status is MilestoneStatus.DONE)
    if total_points == 0:
        return (1.0 if todo.completed else 0.0, completed_points, total_points)
    return (completed_points / total_points, completed_points, total_points)


def _render_goal_overview_settings(
    *, settings: dict[str, Any], todos: Sequence[TodoItem], stats: KpiStats
) -> list[str]:
    settings_column, misc_column = st.columns([1, 2])
    with settings_column:
        with st.expander(translate_text(("Kategorien", "Categories")), expanded=False):
            st.caption(
                translate_text(
                    (
                        "Passe die Tachometer nach Wunsch an: Anzahl KPIs, Auswahl und Einrichtung einzelner Kennzahlen sowie Farbe oder Darstellungsart.",
                        "Customize the gauges to your liking: number of KPIs, selection and setup of individual metrics, plus color or visualization style.",
                    )
                )
            )
            category_labels: dict[Category, tuple[str, str]] = {
                Category.JOB_SEARCH: ("Stellensuche", "Job search"),
                Category.ADMIN: ("Administratives", "Administrative"),
                Category.FRIENDS_FAMILY: ("Familie & Freunde", "Family & friends"),
                Category.DRUGS: ("Drogen", "Substance use"),
                Category.DAILY_STRUCTURE: ("Tagesstruktur", "Daily structure"),
            }

            previous_selection = _sanitize_goal_overview_categories(
                settings.get(GOAL_OVERVIEW_SELECTED_CATEGORIES_KEY, [])
            )
            default_selection = previous_selection or [category.value for category in Category]

            checkbox_columns = st.columns(3)
            selection_lookup = set(default_selection)
            for index, category in enumerate(Category):
                label = translate_text(category_labels.get(category, (category.label, category.label)))
                with checkbox_columns[index % len(checkbox_columns)]:
                    checked = st.checkbox(
                        label,
                        value=category.value in selection_lookup,
                        key=f"goal_overview_category_{category.value}",
                        help=translate_text(
                            (
                                "Wähle aus, welche Kategorien als Tachometer angezeigt werden.",
                                "Pick the categories that should be displayed as gauges.",
                            )
                        ),
                    )
                    if checked:
                        selection_lookup.add(category.value)
                    else:
                        selection_lookup.discard(category.value)

            sanitized_selection = _sanitize_goal_overview_categories(sorted(selection_lookup))
            if sanitized_selection != previous_selection:
                settings[GOAL_OVERVIEW_SELECTED_CATEGORIES_KEY] = sanitized_selection
                st.session_state[SS_SETTINGS] = settings
                persist_state()

    with misc_column:
        misc_column.markdown("**Misc KPIs**")
        _render_misc_metrics(stats=stats, todos=todos)

    return sanitized_selection


def render_goal_overview(
    todos: list[TodoItem], *, stats: KpiStats, category_goals: Mapping[str, int], settings: dict[str, Any]
) -> None:
    st.subheader(translate_text(("Ziele im Überblick", "Goals at a glance")))
    st.caption(
        translate_text(
            (
                "Wähle relevante Kategorien für die Kennzahlen aus und öffne Details pro Kategorie.",
                "Select the categories that should drive your metrics and open category details as needed.",
            )
        )
    )

    selected_categories = _render_goal_overview_settings(settings=settings, todos=todos, stats=stats)
    filtered_todos = _filter_goal_overview_todos_by_category(todos, selected_categories)
    snapshots = aggregate_category_kpis(
        filtered_todos,
        category_goals=category_goals,
        fallback_streak=stats.streak,
    )

    focus_mode = bool(st.session_state.get(GOAL_OVERVIEW_FOCUS_MODE_KEY, False))
    visible_categories = selected_categories or [category.value for category in Category]
    selected_category_value = st.session_state.get(GOAL_OVERVIEW_SELECTED_CATEGORY_KEY)
    if selected_category_value not in visible_categories:
        selected_category_value = visible_categories[0]
        st.session_state[GOAL_OVERVIEW_SELECTED_CATEGORY_KEY] = selected_category_value

    if focus_mode:
        reset_label = translate_text(("Zurück zur Übersicht", "Back to overview"))
        if st.button(reset_label, key="goal_overview_reset_focus"):
            st.session_state[GOAL_OVERVIEW_FOCUS_MODE_KEY] = False
            st.rerun()
    else:
        visible_lookup = set(visible_categories)
        categories_to_render = [category for category in Category if category.value in visible_lookup]
        for row_start in range(0, len(categories_to_render), 3):
            row_categories = categories_to_render[row_start : row_start + 3]
            overview_columns = st.columns(len(row_categories))
            for column, category in zip(overview_columns, row_categories, strict=True):
                snapshot = snapshots[category]
                with column:
                    st.markdown(f"**{category.label}**")
                    detail_clicked = st.button(
                        translate_text((f"{category.label} öffnen", f"Open {category.label}")),
                        key=f"category_detail_{category.value}",
                        width="stretch",
                    )
                    if detail_clicked:
                        selected_category_value = category.value
                        st.session_state[GOAL_OVERVIEW_SELECTED_CATEGORY_KEY] = category.value
                        st.session_state[GOAL_OVERVIEW_FOCUS_MODE_KEY] = True
                        st.rerun()

                    st.plotly_chart(
                        _build_category_gauge(snapshot),
                        width="stretch",
                        config={"displaylogo": False, "responsive": True},
                    )

    if focus_mode:
        selected_category = Category(selected_category_value)
        _render_goal_overview_details(
            category=selected_category,
            snapshot=snapshots[selected_category],
            todos=filtered_todos,
        )


def _render_goal_empty_state(*, ai_enabled: bool, settings: dict[str, Any]) -> None:
    empty_container = st.container(border=True)
    empty_container.subheader(translate_text(("Los geht's mit deinen Zielen", "Kick off your goals")))
    empty_container.info(
        translate_text(
            (
                "Noch keine Aufgaben oder Ziele gespeichert. Lege dein erstes Ziel an oder füge ein ToDo hinzu, "
                "damit das Dashboard dir Fortschritt anzeigt.",
                "No tasks or goals yet. Create your first goal or add a task so the dashboard can surface progress.",
            )
        ),
        icon="✨",
    )

    empty_container.markdown(
        translate_text(
            (
                "1. Zielidee festhalten\n2. Aufgabe einplanen\n3. Fortschritt im Dashboard verfolgen",
                "1. Capture a goal idea\n2. Plan a task\n3. Track progress on the dashboard",
            )
        )
    )

    action_columns = empty_container.columns(3 if ai_enabled else 2)

    with action_columns[0]:
        empty_container.markdown("**" + translate_text(("Ziel starten", "Start a goal")) + "**")
        create_goal_clicked = st.button(
            translate_text(("Ziel anlegen", "Create goal")),
            type="primary",
            key="empty_state_create_goal",
            help=translate_text(
                (
                    "Öffnet die Ziel-Canvas mit allen Pflichtfeldern.",
                    "Opens the goal canvas with all required fields.",
                )
            ),
        )
        _render_goal_quick_goal_popover(
            settings=settings,
            form_key=f"{QUICK_GOAL_PROFILE_FORM_KEY}_empty",
            trigger_label=("✨ Ziel anlegen", "✨ Create goal"),
        )

    with action_columns[1]:
        empty_container.markdown("**" + translate_text(("Aufgabe planen", "Plan a task")) + "**")
        _render_goal_quick_todo_popover(
            form_key=f"{QUICK_GOAL_TODO_FORM_KEY}_empty",
            key_suffix="empty",
            trigger_label=("🧭 Aufgabe hinzufügen", "🧭 Add task"),
        )

    ai_suggestion_clicked = False
    if ai_enabled:
        with action_columns[2]:
            ai_suggestion_clicked = st.button(
                translate_text(("AI Vorschlag holen", "Get AI suggestion")),
                key="empty_state_ai_prompt",
                help=translate_text(
                    (
                        "Lass dir einen Startimpuls von der KI geben und passe ihn danach an.",
                        "Ask the AI for a starting idea and refine it afterward.",
                    )
                ),
            )

    if create_goal_clicked or ai_suggestion_clicked:
        st.session_state[GOAL_CREATION_VISIBLE_KEY] = True
        st.rerun()


def _render_goal_overview_details(*, category: Category, snapshot: CategoryKpi, todos: Sequence[TodoItem]) -> None:
    detail_container = st.container(border=True)
    detail_container.markdown(
        translate_text(
            (
                f"### {category.label}: Aufgaben & Ziele",
                f"### {category.label}: Tasks & goals",
            )
        )
    )
    summary_columns = detail_container.columns([1, 1, 1])
    with summary_columns[0]:
        st.metric(
            translate_text(("Heute erledigt", "Done today")),
            f"{snapshot.done_today}/{snapshot.daily_goal}",
        )
    with summary_columns[1]:
        st.metric(
            translate_text(("Offene Aufgaben", "Open tasks")),
            snapshot.open_count,
        )
    with summary_columns[2]:
        st.metric(
            translate_text(("Streak", "Streak")),
            translate_text((f"{snapshot.streak} Tage", f"{snapshot.streak} days")),
        )

    category_todos = [todo for todo in todos if todo.category is category]
    if not category_todos:
        detail_container.info(
            translate_text(
                (
                    "Keine Aufgaben in dieser Kategorie – füge eine neue hinzu.",
                    "No tasks in this category — add a new one to get started.",
                )
            )
        )
        return

    milestone_todos = [todo for todo in category_todos if todo.milestones]
    if milestone_todos:
        detail_container.markdown("#### " + translate_text(("Fortschritt pro Aufgabe", "Progress per task")))
        progress_columns = detail_container.columns(2)
        for index, todo in enumerate(milestone_todos):
            progress_ratio, completed_points, total_points = _milestone_progress(todo)
            ratio = min(1.0, progress_ratio)
            with progress_columns[index % len(progress_columns)]:
                st.markdown(f"**{todo.title}**")
                progress_label = translate_text(
                    (
                        f"{completed_points}/{total_points or '—'} Punkte erledigt",
                        f"{completed_points}/{total_points or '—'} points done",
                    )
                )
                st.progress(ratio, text=progress_label)
                done_count = sum(1 for milestone in todo.milestones if milestone.status is MilestoneStatus.DONE)
                st.caption(
                    translate_text(
                        (
                            f"{len(todo.milestones)} Unterziele · {done_count} abgeschlossen",
                            f"{len(todo.milestones)} milestones · {done_count} completed",
                        )
                    )
                )

    if len(milestone_todos) != len(category_todos):
        detail_container.caption(
            translate_text(
                (
                    "Aufgaben ohne Unterziele bleiben unten in der Detailansicht aufgelistet.",
                    "Tasks without milestones stay listed below in the detail view.",
                )
            )
        )

    for todo in category_todos:
        status_label = translate_text(("Offen", "Open")) if not todo.completed else translate_text(("Erledigt", "Done"))
        header = f"{todo.title} · {status_label}"
        with detail_container.expander(header, expanded=False):
            due_date = (
                todo.due_date.astimezone().date().strftime("%Y-%m-%d")
                if todo.due_date is not None
                else translate_text(("Kein Fälligkeitsdatum", "No due date"))
            )
            st.caption(
                translate_text(
                    (
                        f"Fällig: {due_date} · Priorität: {todo.priority}",
                        f"Due: {due_date} · Priority: {todo.priority}",
                    )
                )
            )
            st.write(todo.description_md or translate_text(("Keine Beschreibung", "No description")))
            st.markdown("---")
            _render_todo_edit_form(todo, key_prefix="goal_overview")


def render_category_dashboard(todos: list[TodoItem], *, stats: KpiStats, category_goals: Mapping[str, int]) -> None:
    snapshots = aggregate_category_kpis(
        todos,
        category_goals=category_goals,
        fallback_streak=stats.streak,
    )
    card_columns = st.columns(len(Category))

    for category, column in zip(Category, card_columns, strict=True):
        snapshot = snapshots[category]
        with column:
            with st.container(border=True):
                st.markdown(f"**{category.label}**")
                delta_text = (
                    f"Δ {snapshot.done_today - snapshot.daily_goal} zum Ziel"
                    if snapshot.daily_goal > 0
                    else "Kein Tagesziel"
                )
                st.metric(
                    "Heute erledigt",
                    f"{snapshot.done_today}/{snapshot.daily_goal}",
                    delta=delta_text,
                )
                st.plotly_chart(
                    _build_category_progress(snapshot),
                    width="stretch",
                    config={"displaylogo": False, "responsive": True},
                )
                st.caption(
                    " | ".join(
                        [
                            "Offen",
                            "Gesamt",
                            f"Streak: {snapshot.streak} Tage",
                        ]
                    )
                )

    weekly_data = last_7_days_completions_by_category(todos)
    weekly_label = translate_text(("Wöchentliche Trends je Kategorie", "Weekly trends per category"))
    with st.expander(weekly_label, expanded=False):
        st.plotly_chart(
            build_category_weekly_completion_figure(weekly_data),
            width="stretch",
            config={"displaylogo": False, "responsive": True},
        )


def _collect_timeboxed_tasks(todos: Sequence[TodoItem], *, days_ahead: int = 3) -> list[TodoItem]:
    today = datetime.now().date()
    horizon = today + timedelta(days=days_ahead)
    relevant: list[TodoItem] = []
    for todo in todos:
        if todo.completed or todo.due_date is None:
            continue
        due_date = todo.due_date.astimezone().date()
        if due_date <= horizon:
            relevant.append(todo)
    return sorted(relevant, key=lambda todo: todo.due_date or datetime.max)


def _render_calendar_week(todos: Sequence[TodoItem]) -> None:
    today = datetime.now().date()
    start_of_week = today - timedelta(days=today.weekday())
    end_of_week = start_of_week + timedelta(days=6)
    week_tasks = [
        todo
        for todo in todos
        if todo.due_date is not None
        and start_of_week <= todo.due_date.astimezone().date() <= end_of_week
        and not todo.completed
    ]
    if not week_tasks:
        st.info(
            translate_text(
                (
                    "Keine Fälligkeiten in dieser Woche.",
                    "No due dates in the current week.",
                )
            )
        )
        return

    calendar_rows: list[Mapping[str, str]] = []
    for todo in week_tasks:
        if todo.due_date is None:
            continue
        due_day = todo.due_date.astimezone().date()
        calendar_rows.append(
            {
                translate_text(("Tag", "Day")): due_day.strftime("%A"),
                translate_text(("Datum", "Date")): due_day.isoformat(),
                translate_text(("Aufgabe", "Task")): todo.title,
            }
        )
    st.dataframe(calendar_rows, hide_index=True, width="stretch")


def _render_misc_metrics(*, stats: KpiStats, todos: Sequence[TodoItem]) -> None:
    backlog_health = calculate_backlog_health(list(todos))
    cycle_time = calculate_cycle_time(list(todos))
    upcoming = _collect_timeboxed_tasks(todos, days_ahead=3)
    misc_columns = st.columns(2)
    with misc_columns[0]:
        st.metric(
            translate_text(("Ø Cycle Time", "Avg cycle time")),
            _format_duration_short(cycle_time.average),
        )
        st.metric(
            translate_text(("Überfällig-Quote", "Overdue ratio")),
            f"{backlog_health.overdue_ratio:.0%}",
        )
        st.metric(
            translate_text(("Offene Aufgaben", "Open tasks")),
            backlog_health.open_count,
        )
    with misc_columns[1]:
        st.metric(
            translate_text(("In Arbeit", "In progress")),
            sum(1 for todo in todos if not todo.completed and todo.progress_current > 0),
        )
        st.metric(
            translate_text(("Fällige Nächste 3 Tage", "Due next 3 days")),
            len(upcoming),
        )
        st.metric(
            translate_text(("Streak gesamt", "Overall streak")),
            translate_text((f"{stats.streak} Tage", f"{stats.streak} days")),
        )


def _render_todo_edit_form(todo: TodoItem, *, key_prefix: str) -> None:
    st.markdown("**" + translate_text(("Aufgabe bearbeiten", "Update task")) + "**")
    form_key = f"{key_prefix}_edit_{todo.id}"
    with st.form(form_key):
        updated_title = st.text_input(
            translate_text(("Titel", "Title")),
            value=todo.title,
            key=f"{form_key}_title",
        )

        no_due_date = st.checkbox(
            translate_text(("Kein Fälligkeitsdatum", "No due date")),
            value=todo.due_date is None,
            key=f"{form_key}_no_due",
        )
        new_due_value: date | None = None
        if not no_due_date:
            new_due_value = st.date_input(
                translate_text(("Fälligkeitsdatum", "Due date")),
                value=todo.due_date.date() if todo.due_date else None,
                format="YYYY-MM-DD",
                key=f"{form_key}_due",
            )
        new_priority = st.selectbox(
            translate_text(("Priorität (1=hoch)", "Priority (1=high)")),
            options=list(range(1, 6)),
            index=list(range(1, 6)).index(todo.priority),
            key=f"{form_key}_priority",
        )
        new_quadrant = st.selectbox(
            translate_text(("Eisenhower-Quadrant", "Eisenhower quadrant")),
            options=list(EisenhowerQuadrant),
            format_func=lambda option: option.label,
            index=list(EisenhowerQuadrant).index(todo.quadrant),
            key=f"{form_key}_quadrant",
        )
        new_category = st.selectbox(
            translate_text(("Kategorie", "Category")),
            options=list(Category),
            format_func=lambda option: option.label,
            index=list(Category).index(todo.category),
            key=f"{form_key}_category",
        )
        description_tabs = st.tabs(
            [
                translate_text(("Schreiben", "Write")),
                translate_text(("Vorschau", "Preview")),
            ]
        )
        with description_tabs[0]:
            new_description = st.text_area(
                translate_text(("Beschreibung (Markdown)", "Description (Markdown)")),
                value=todo.description_md,
                key=f"{form_key}_description",
            )
        with description_tabs[1]:
            description_preview = st.session_state.get(f"{form_key}_description", "")
            if description_preview.strip():
                st.markdown(description_preview)
            else:
                st.caption(translate_text(("Keine Beschreibung vorhanden", "No description available")))

        submitted = st.form_submit_button(translate_text(("Aktualisieren", "Update")))
        if submitted:
            new_due_datetime = (
                datetime.combine(new_due_value, datetime.min.time(), tzinfo=timezone.utc) if new_due_value else None
            )
            update_todo(
                todo.id,
                title=updated_title.strip(),
                due_date=new_due_datetime,
                priority=new_priority,
                quadrant=new_quadrant,
                category=new_category,
                description_md=new_description,
            )
            st.success(translate_text(("Aufgabe aktualisiert", "Task updated")))
            st.rerun()


def render_workload_overview(*, todos: list[TodoItem], stats: KpiStats) -> None:
    st.markdown(
        translate_text(
            ("### Fokus: Nächste Schritte", "### Focus: Next steps"),
        )
    )
    overdue_and_upcoming, calendar_column, misc_column = st.columns([1.2, 1, 1])
    with overdue_and_upcoming:
        st.markdown("**Überfällig & Nächste 3 Tage / Overdue & next 3 days**")
        for todo in _collect_timeboxed_tasks(todos):
            due_date = todo.due_date.astimezone().date() if todo.due_date else None
            with st.expander(f"{todo.title} · {due_date or translate_text(('Kein Datum', 'No date'))}"):
                st.caption(
                    translate_text(
                        (
                            f"Quadrant: {todo.quadrant.label} · Priorität {todo.priority}",
                            f"Quadrant: {todo.quadrant.label} · Priority {todo.priority}",
                        )
                    )
                )
                st.write(todo.description_md or translate_text(("Keine Beschreibung", "No description")))

                st.markdown("---")
                _render_todo_edit_form(todo, key_prefix="focus")
    with calendar_column:
        st.markdown("**Kalender – aktuelle Woche / Calendar – current week**")
        _render_calendar_week(todos)
    with misc_column:
        st.markdown("**Misc KPIs**")
        _render_misc_metrics(stats=stats, todos=todos)


def render_settings_popover(
    *,
    stats: KpiStats,
    client: Optional[OpenAI],
    settings: dict[str, Any],
    build_metadata: Mapping[str, str | None],
) -> tuple[bool, bool]:
    """Render a compact settings popover to slim down the sidebar."""

    show_storage_notice = bool(settings.get(SHOW_STORAGE_NOTICE_KEY, False))
    ai_enabled = bool(settings.get(AI_ENABLED_KEY, bool(client)))

    with st.popover(translate_text(("⚙️ Einstellungen", "⚙️ Settings")), width="stretch"):
        st.markdown("**Einstellungen & Sicherheit / Settings & safety**")
        safety_label = translate_text(("Sicherheit & KI", "Safety & AI"))
        goals_label = translate_text(("Ziele & Kategorien", "Goals & categories"))
        personalization_label = translate_text(("Personalisierung", "Personalization"))
        safety_tab, goals_tab, personalization_tab = _tabs_with_optional_key(
            st, [safety_label, goals_label, personalization_label], key_suffix="popover"
        )

        with safety_tab:
            ai_enabled, show_storage_notice = _render_ai_and_safety_section(
                panel=safety_tab, settings=settings, client=client, key_suffix="popover"
            )

        with goals_tab:
            _render_daily_goal_section(panel=goals_tab, settings=settings, stats=stats, key_suffix="popover")
            _render_goal_canvas(
                panel=goals_tab,
                goal_profile=settings.get("goal_profile", _default_goal_profile()),
                settings=settings,
                key_suffix="popover",
            )

        with personalization_tab:
            personalization_tab.subheader(translate_text(("Gamification & Motivation", "Gamification & motivation")))
            render_gamification_mode_selector(settings, container=personalization_tab, show_divider=False)
            personalization_tab.divider()
            render_build_info_sidebar(build_metadata=build_metadata, container=personalization_tab)

    st.session_state[SS_SETTINGS] = settings
    persist_state()

    return ai_enabled, show_storage_notice


def render_dashboard_header(
    *, settings: dict[str, Any], stats: KpiStats, client: Optional[OpenAI], build_metadata: Mapping[str, str | None]
) -> tuple[bool, bool]:
    """Render a compact dashboard header with aligned quick-add actions."""

    st.markdown(
        """
        <style>
            .dashboard-header h2 {
                margin-bottom: 0.2rem;
            }
            @media (max-width: 768px) {
                .dashboard-header .stColumn {
                    flex: 1 1 100% !important;
                }
            }
        </style>
        """,
        unsafe_allow_html=True,
    )

    header_container = st.container()
    with header_container:
        title_col, todo_col, goal_col, journal_col, email_col, settings_col = st.columns(
            [3, 2, 2, 2, 2, 2],
            gap="small",
        )

    with title_col:
        st.markdown("<div class='dashboard-header'><h2>Gerris ErfolgsTracker</h2></div>", unsafe_allow_html=True)
    with todo_col:
        _render_goal_quick_todo_popover(
            form_key=f"{QUICK_GOAL_TODO_FORM_KEY}_header",
            key_suffix="header",
        )
    with goal_col:
        _render_goal_quick_goal_popover(
            settings=settings,
            form_key=f"{QUICK_GOAL_PROFILE_FORM_KEY}_header",
        )
    with journal_col:
        _render_goal_quick_journal_popover()

    with email_col:
        email_clicked = st.button(
            translate_text(("✉️ E-Mails", "✉️ Emails")),
            help=translate_text(
                (
                    "Öffnet den E-Mail-Assistenten für neue Vorlagen.",
                    "Opens the email assistant for new drafts.",
                )
            ),
        )
        if email_clicked:
            st.session_state[NAVIGATION_SELECTION_KEY] = EMAILS_PAGE_KEY
            st.rerun()

    with settings_col:
        ai_enabled, show_storage_notice = render_settings_popover(
            stats=stats,
            client=client,
            settings=settings,
            build_metadata=build_metadata,
        )

    return ai_enabled, show_storage_notice


def render_dashboard_page(
    *,
    todos: list[TodoItem],
    stats: KpiStats,
    category_goals: Mapping[str, int],
    settings: dict[str, Any],
    ai_enabled: bool,
    client: Optional[OpenAI],
) -> None:
    st.subheader(translate_text(("Dashboard", "Dashboard")))
    st.caption(
        translate_text(
            (
                "Ziel-Übersicht und KPIs direkt hier; Details und Templates bleiben im Tab 'Ziele'.",
                "Goal overview and KPIs live here; details and templates remain in the 'Goals' tab.",
            )
        )
    )

    if not todos:
        st.info(
            translate_text(
                (
                    "Lege ein Ziel oder eine Aufgabe an, um Kennzahlen im Dashboard zu sehen.",
                    "Create a goal or task to unlock dashboard metrics.",
                )
            ),
            icon="✨",
        )
        return

    render_goal_overview(
        todos,
        stats=stats,
        category_goals=category_goals,
        settings=settings,
    )

    render_workload_overview(todos=todos, stats=stats)

    coach_column, gamification_column = st.columns([1, 1])
    with coach_column:
        render_coach_main_panel()
    with gamification_column:
        render_gamification_panel(
            stats,
            ai_enabled=ai_enabled,
            client=client,
            panel=gamification_column,
            allow_mode_selection=False,
        )

    render_shared_calendar_header()
    render_shared_calendar()

    render_kpi_dashboard(stats, todos=todos)

    render_category_dashboard(
        todos,
        stats=stats,
        category_goals=category_goals,
    )


def render_goals_page(
    *,
    todos: list[TodoItem],
    stats: KpiStats,
    settings: dict[str, Any],
    ai_enabled: bool,
    client: Optional[OpenAI],
) -> bool:
    st.subheader(translate_text(("Zielmanagement", "Goal management")))
    st.caption(
        translate_text(
            (
                "Hier legst du Ziele, Kategorien und Sicherheitsoptionen fest; Kennzahlen findest du im Dashboard.",
                "Use this area to manage goals, categories, and safety options; KPIs live on the dashboard.",
            )
        )
    )

    if not todos:
        _render_goal_empty_state(ai_enabled=ai_enabled, settings=settings)
    else:
        st.info(
            translate_text(
                (
                    "Der Block 'Ziele im Überblick' ist jetzt im Dashboard platziert; hier verwaltest du weiterhin Vorlagen und Einstellungen.",
                    "The 'Goals at a glance' block now lives on the dashboard; manage templates and settings here as before.",
                )
            )
        )

    settings_container = st.container()
    settings_container.divider()
    settings_container.markdown(translate_text(("### Einstellungen & Sicherheit", "### Settings & safety")))
    return render_settings_panel(
        stats,
        client,
        panel=settings_container,
        include_ai_and_safety=True,
    )


def _get_build_metadata() -> dict[str, str | None]:
    repo_root = Path(__file__).resolve().parent
    metadata: dict[str, str | None] = {
        "commit": None,
        "short_commit": None,
        "committed_at": None,
    }

    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo_root, text=True).strip() or None
    except (FileNotFoundError, subprocess.SubprocessError):
        return metadata

    metadata["commit"] = commit

    try:
        short_commit = (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=repo_root, text=True).strip() or None
        )
        metadata["short_commit"] = short_commit or commit
    except (FileNotFoundError, subprocess.SubprocessError):
        metadata["short_commit"] = commit

    try:
        committed_at = (
            subprocess.check_output(
                ["git", "show", "-s", "--format=%cI", "HEAD"],
                cwd=repo_root,
                text=True,
            ).strip()
            or None
        )
        metadata["committed_at"] = committed_at
    except (FileNotFoundError, subprocess.SubprocessError):
        metadata["committed_at"] = None

    return metadata


def render_build_info_sidebar(*, build_metadata: Mapping[str, str | None], container: Any = st.sidebar) -> None:
    commit_label = translate_text(("Build-Info", "Build info"))
    commit_value = build_metadata.get("short_commit") or build_metadata.get("commit")
    commit_time = build_metadata.get("committed_at")
    unknown_label = translate_text(("Unbekannt", "Unknown"))

    sidebar = container.container()
    sidebar.markdown(f"**{commit_label}**")
    sidebar.caption(translate_text(("Commit", "Commit")) + ": " + (commit_value or unknown_label))
    sidebar.caption(translate_text(("Commit-Datum", "Commit date")) + ": " + (commit_time or unknown_label))
    sidebar.caption(
        translate_text(
            (
                "Nutze diese Infos, um den Live-Build zu prüfen.",
                "Use these details to verify the live build.",
            )
        )
    )


def render_shared_calendar_header() -> None:
    st.markdown(
        translate_text(
            (
                "### 2025 von Carla, Miri & Gerrit · Google Kalender",
                "### 2025 by Carla, Miri & Gerrit · Google Calendar",
            )
        )
    )


def render_shared_calendar() -> None:
    calendar_iframe = """
    <iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Europe%2FAmsterdam&showPrint=0&src=e2a52f862c8088c82d9f74825b8c39f6069965fdc652472fbf5ec28e891c077e%40group.calendar.google.com&color=%23616161" style="border:solid 1px #777" width="800" height="600" frameborder="0" scrolling="no"></iframe>
    """
    st.markdown(calendar_iframe, unsafe_allow_html=True)


def _format_duration_short(value: timedelta | None) -> str:
    if value is None:
        return "–"

    total_seconds = value.total_seconds()
    total_hours = total_seconds / 3600
    if total_hours >= 48:
        return f"{value.days}d"
    if total_hours >= 1:
        return f"{total_hours:.1f}h"
    return f"{total_seconds / 60:.0f}m"


def render_kpi_dashboard(stats: KpiStats, *, todos: list[TodoItem]) -> None:
    _sync_tasks_streamlit()
    st.subheader("KPI-Dashboard")
    col_total, col_today, col_streak, col_goal = st.columns(4)

    col_total.metric("Erledigt gesamt", stats.done_total)
    col_today.metric("Heute erledigt", stats.done_today)
    col_streak.metric(
        "Kontinuität",
        translate_text((f"{stats.streak} Tage", f"{stats.streak} days")),
    )

    goal_delta = translate_text(("🎯 Ziel erreicht", "🎯 Goal achieved"))
    if not stats.goal_hit_today:
        goal_delta = translate_text(("Noch nicht erreicht", "Not reached yet"))
    col_goal.metric(
        "Zielerreichung",
        f"{stats.done_today}/{stats.goal_daily}",
        delta=goal_delta,
    )

    new_tasks_count = count_new_tasks_last_7_days(todos)
    st.markdown("#### " + translate_text(("Neue Aufgaben (7 Tage)", "New tasks (7 days)")))
    st.caption(
        translate_text(
            (
                "Kurzer Überblick – Details bei Bedarf aufklappen.",
                "Quick glance – expand for details when needed.",
            )
        )
    )
    summary_columns = st.columns([1, 1])
    summary_columns[0].metric(
        translate_text(("Neu angelegt", "Created")),
        f"{new_tasks_count}",
    )
    summary_columns[1].metric(
        translate_text(("Wochenziel", "Weekly target")),
        f"{NEW_TASK_WEEKLY_GOAL}",
    )

    with st.expander(translate_text(("Wochenstatistik öffnen", "Open weekly stats")), expanded=False):
        gauge_column, info_column = st.columns([2, 1])
        with gauge_column:
            st.plotly_chart(
                _build_new_tasks_gauge(new_tasks_count),
                width="stretch",
                config={"displaylogo": False, "responsive": True},
            )
        with info_column:
            total_points = new_tasks_count * POINTS_PER_NEW_TASK
            info_column.metric(
                translate_text(("Punkte aus neuen Aufgaben", "Points from new tasks")),
                f"{total_points}",
                delta=translate_text(
                    (
                        f"{new_tasks_count} von {NEW_TASK_WEEKLY_GOAL}",
                        f"{new_tasks_count} of {NEW_TASK_WEEKLY_GOAL}",
                    )
                ),
                help=translate_text(
                    (
                        f"{POINTS_PER_NEW_TASK} Punkte pro neuer Aufgabe",
                        f"{POINTS_PER_NEW_TASK} points per new task",
                    )
                ),
            )
            info_column.caption(
                translate_text(
                    (
                        f"Ziel: {NEW_TASK_WEEKLY_GOAL} neue Aufgaben pro Woche",
                        f"Target: {NEW_TASK_WEEKLY_GOAL} new tasks per week",
                    )
                )
            )

    flow_header = translate_text(("Flow & Backlog", "Flow & backlog"))
    st.markdown(f"#### {flow_header}")

    cycle_time = calculate_cycle_time(todos)
    backlog_health = calculate_backlog_health(todos)
    cycle_time_by_category = calculate_cycle_time_by_category(todos)
    last_30_days = build_completion_heatmap(todos, days=30)

    metrics_column, figure_column = st.columns([1, 1])
    with metrics_column:
        st.metric(
            translate_text(("Ø Cycle Time", "Avg cycle time")),
            _format_duration_short(cycle_time.average),
            help=translate_text(
                (
                    "Median- und Durchschnittswerte basieren auf abgeschlossenen Aufgaben.",
                    "Median and average values are based on completed tasks.",
                )
            ),
        )
        st.metric(
            translate_text(("Überfällig-Quote", "Overdue ratio")),
            f"{backlog_health.overdue_ratio:.0%}",
            delta=f"{backlog_health.overdue_count}/{backlog_health.open_count}",
            help=translate_text(
                (
                    "Offene Aufgaben mit Fälligkeitsdatum in der Vergangenheit.",
                    "Open tasks whose due date is in the past.",
                )
            ),
        )
        st.caption(
            translate_text(
                (
                    f"Abschlüsse (30 Tage): {sum(entry['completions'] for entry in last_30_days)}",
                    f"Completions (30 days): {sum(entry['completions'] for entry in last_30_days)}",
                )
            )
        )

    with figure_column:
        st.plotly_chart(
            build_backlog_health_figure(backlog_health),
            width="stretch",
            config={"displaylogo": False, "responsive": True},
        )

    if cycle_time_by_category:
        st.plotly_chart(
            build_cycle_time_overview_figure(cycle_time_by_category),
            width="stretch",
            config={"displaylogo": False, "responsive": True},
        )

    render_quadrant_focus_items(todos)

    st.info(
        translate_text(
            (
                "Passe Kategorien und KI-Optionen im Bereich 'Ziele' an.",
                "Adjust categories and AI options in the 'Goals' area.",
            )
        )
    )


DASHBOARD_PAGE_KEY = "dashboard"
GOALS_PAGE_KEY = "goals"
TASKS_PAGE_KEY = "tasks"
JOURNAL_PAGE_KEY = "journal"
EMAILS_PAGE_KEY = "emails"

DASHBOARD_PAGE_LABEL = ("Dashboard", "Dashboard")
GOALS_PAGE_LABEL = ("Ziele", "Goals")
TASKS_PAGE_LABEL = ("Aufgaben", "Tasks")
JOURNAL_PAGE_LABEL = ("Tagebuch", "Journal")
EMAILS_PAGE_LABEL = ("E-Mails", "Emails")
NAVIGATION_SELECTION_KEY = "active_page"


def render_language_toggle() -> LanguageCode:
    return get_language()


def render_ai_toggle(
    settings: dict[str, Any],
    *,
    client: Optional[OpenAI],
    container: Any = st.sidebar,
    key: str | None = None,
    key_suffix: str | None = None,
) -> bool:
    widget_key = key or (f"{AI_ENABLED_KEY}_{key_suffix}" if key_suffix else AI_ENABLED_KEY)
    ai_enabled = container.toggle(
        "AI aktiv",
        key=widget_key,
        value=bool(settings.get(AI_ENABLED_KEY, bool(client))),
        help=("Aktiviere KI-gestützte Vorschläge. Ohne Schlüssel werden Fallback-Texte genutzt"),
    )
    settings[AI_ENABLED_KEY] = ai_enabled
    st.session_state[AI_ENABLED_KEY] = ai_enabled
    st.session_state[SS_SETTINGS] = settings
    persist_state()
    return ai_enabled


def render_navigation() -> str:
    st.sidebar.title(translate_text(("Navigation", "Navigation")))
    page_labels = {
        DASHBOARD_PAGE_KEY: DASHBOARD_PAGE_LABEL,
        GOALS_PAGE_KEY: GOALS_PAGE_LABEL,
        TASKS_PAGE_KEY: TASKS_PAGE_LABEL,
        JOURNAL_PAGE_KEY: JOURNAL_PAGE_LABEL,
        EMAILS_PAGE_KEY: EMAILS_PAGE_LABEL,
    }
    navigation_options = list(page_labels)
    if (
        NAVIGATION_SELECTION_KEY not in st.session_state
        or st.session_state[NAVIGATION_SELECTION_KEY] not in navigation_options
    ):
        st.session_state[NAVIGATION_SELECTION_KEY] = DASHBOARD_PAGE_KEY
    selection = st.sidebar.radio(
        translate_text(("Bereich wählen", "Choose section")),
        navigation_options,
        key=NAVIGATION_SELECTION_KEY,
        label_visibility="collapsed",
        format_func=lambda option: translate_text(page_labels[option]),
    )
    st.sidebar.divider()
    return selection


def render_gamification_mode_selector(
    settings: dict[str, Any], *, container: Any = st.sidebar, show_divider: bool = True
) -> GamificationMode:
    try:
        current_mode = GamificationMode(settings.get("gamification_mode", GamificationMode.POINTS.value))
    except ValueError:
        current_mode = GamificationMode.POINTS
    mode_options = list(GamificationMode)
    selection_index = mode_options.index(current_mode)
    selected_mode = container.selectbox(
        translate_text(("Gamification-Variante", "Gamification mode")),
        options=mode_options,
        format_func=lambda option: option.label,
        index=selection_index,
        help=translate_text(
            (
                "Wähle Punkte, Abzeichen oder motivierende Botschaften; Inhalte erscheinen im Dashboard.",
                "Choose points, badges, or motivational messages; content is shown on the dashboard.",
            )
        ),
    )
    if selected_mode is not current_mode:
        settings["gamification_mode"] = selected_mode.value
        st.session_state[SS_SETTINGS] = settings
        persist_state()
    if show_divider:
        container.divider()
    return selected_mode


def _render_coach_messages(panel: Any) -> None:
    coach_state = get_coach_state()
    if not coach_state.messages:
        panel.caption(
            translate_text(
                (
                    "Noch keine Coach-Nachrichten – erledige eine Aufgabe, um einen Tipp zu erhalten.",
                    "No coach messages yet — complete a task to unlock a tip.",
                )
            )
        )
        return

    for message in reversed(coach_state.messages[-3:]):
        if message.severity == "weekly":
            with panel.expander(translate_text(("Wochenrückblick", "Weekly review")), expanded=True):
                panel.markdown(f"**{translate_text(message.title)}**")
                panel.write(translate_text(message.body))
        else:
            panel.markdown(f"**{translate_text(message.title)}**")
            panel.write(translate_text(message.body))

        panel.caption(
            translate_text(
                (
                    f"Zuletzt aktualisiert: {message.created_at.strftime('%d.%m %H:%M')} Uhr",
                    f"Last updated: {message.created_at.strftime('%Y-%m-%d %H:%M')} UTC",
                )
            )
        )
        panel.divider()


def render_coach_sidebar() -> None:
    coach_panel = st.sidebar.expander(translate_text(("Coach", "Coach")), expanded=True)
    with coach_panel:
        _render_coach_messages(coach_panel)


def render_coach_main_panel() -> None:
    panel = st.container(border=True)
    panel.markdown("### Coach")
    _render_coach_messages(panel)


def render_gamification_panel(
    stats: KpiStats,
    *,
    ai_enabled: bool,
    client: Optional[OpenAI],
    panel: Any | None = None,
    allow_mode_selection: bool = False,
) -> None:
    panel = panel or st
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    try:
        gamification_mode = GamificationMode(settings.get("gamification_mode", GamificationMode.POINTS.value))
    except ValueError:
        gamification_mode = GamificationMode.POINTS

    if allow_mode_selection:
        gamification_mode_options = list(GamificationMode)
        mode_index = gamification_mode_options.index(gamification_mode)
        selected_mode = panel.selectbox(
            "Gamification-Variante",
            options=gamification_mode_options,
            format_func=lambda option: option.label,
            index=mode_index,
            help=("Wähle Punkte, Abzeichen oder die motivierenden Botschaften"),
        )

        if selected_mode is not gamification_mode:
            gamification_mode = selected_mode
            settings["gamification_mode"] = selected_mode.value
            st.session_state[SS_SETTINGS] = settings
            persist_state()

    gamification_state = get_gamification_state()

    if gamification_mode is GamificationMode.POINTS:
        col_level, col_points = panel.columns(2)
        col_level.metric("Level", gamification_state.level)
        col_points.metric("Punkte", gamification_state.points)

        (
            progress_points,
            required_points,
            progress_ratio,
        ) = calculate_progress_to_next_level(gamification_state)
        panel.progress(
            progress_ratio,
            text=(
                "\n".join(
                    (
                        f"Fortschritt: {progress_points}/{required_points} Punkte bis Level {gamification_state.level + 1}",
                        f"Progress: {progress_points}/{required_points} points to reach level {gamification_state.level + 1}",
                    )
                )
            ),
        )

        panel.caption(
            "\n".join(
                (
                    f"Aktueller Streak: {stats.streak} Tage · Erledigt gesamt: {stats.done_total}",
                    f"Current streak: {stats.streak} days · Done total: {stats.done_total}",
                )
            )
        )

    elif gamification_mode is GamificationMode.BADGES:
        if gamification_state.badges:
            badge_labels = " ".join(f"🏅 {badge}" for badge in gamification_state.badges)
            panel.markdown(
                f"{badge_labels}<br/>(jede Auszeichnung wird nur einmal vergeben",
                unsafe_allow_html=True,
            )
        else:
            panel.caption("Noch keine Badges gesammelt")
        panel.info("Sammle Abzeichen für Meilensteine wie erste Aufgabe, 3-Tage-Streak und 10 Abschlüsse")

    else:
        message_index = int(st.session_state.get(AVATAR_PROMPT_INDEX_KEY, 0))
        avatar_message = next_avatar_prompt(message_index)
        panel.info(f"👩‍⚕️ {avatar_message}")

        if panel.button("Neuen Spruch anzeigen", key="avatar_prompt_btn"):
            st.session_state[AVATAR_PROMPT_INDEX_KEY] = message_index + 1
            st.rerun()

        panel.caption("Klicke erneut für weitere motivierende Botschaften im Therapiezimmer-Stil")


def render_safety_panel(panel: Any, *, key_suffix: str = "") -> bool:
    key_prefix = f"{key_suffix}_" if key_suffix else ""

    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    show_safety_key = f"{key_prefix}{SHOW_SAFETY_NOTES_KEY}"
    show_safety_notes_default = bool(settings.get(SHOW_SAFETY_NOTES_KEY, False))
    if show_safety_key not in st.session_state:
        st.session_state[show_safety_key] = show_safety_notes_default
    show_safety_notes = panel.toggle(
        ("Hinweise anzeigen", "Show safety notes"),
        value=bool(st.session_state.get(show_safety_key, show_safety_notes_default)),
        key=show_safety_key,
        help=(
            "Blendet Speicher- und Sicherheitshinweise innerhalb des Panels ein oder aus.",
            "Toggle storage and safety notes inside this panel on or off.",
        ),
    )
    settings[SHOW_SAFETY_NOTES_KEY] = show_safety_notes

    if show_safety_notes:
        panel.info(
            (
                "Optionale lokale Persistenz speichert Daten in .data/gerris_state.json; auf Streamlit Community Cloud können Dateien nach einem Neustart verschwinden.",
                "Optional local persistence stores data in .data/gerris_state.json; on Streamlit Community Cloud files may disappear after a restart.",
            )
        )
        panel.warning(
            (
                "Dieses Tool ersetzt keine Krisenhilfe oder Diagnosen. Bei akuten Notfällen wende dich an lokale Hotlines.",
                "This tool is not a replacement for crisis support or medical diagnostics. In emergencies, contact your local hotlines.",
            )
        )

    show_storage_key = f"{key_prefix}{SHOW_STORAGE_NOTICE_KEY}"
    show_storage_default = bool(settings.get(SHOW_STORAGE_NOTICE_KEY, False))
    if show_storage_key not in st.session_state:
        st.session_state[show_storage_key] = show_storage_default
    show_storage_notice = panel.toggle(
        ("Speicherhinweis anzeigen", "Show storage notice"),
        value=bool(st.session_state.get(show_storage_key, show_storage_default)),
        key=show_storage_key,
        help=(
            "Blendet den Hinweis zum aktuellen Speicherpfad oberhalb des Titels ein oder aus.",
            "Show or hide the storage notice above the sidebar title.",
        ),
    )
    settings[SHOW_STORAGE_NOTICE_KEY] = show_storage_notice

    panel.divider()
    panel.subheader(translate_text(("Backup importieren", "Import backup")))
    panel.caption(
        translate_text(
            (
                "Lade eine gerris_state.json hoch, um ToDos, KPIs, Einstellungen und Tagebuch wiederherzustellen.",
                "Upload a gerris_state.json file to restore todos, KPIs, settings, and journal entries.",
            )
        )
    )
    with panel.form(f"{key_prefix}backup_import_form"):
        backup_upload = panel.file_uploader(
            translate_text(("Backup-Datei (JSON)", "Backup file (JSON)")),
            type=["json"],
            key=f"{key_prefix}backup_upload",
            help=translate_text(
                (
                    "Die Datei sollte aus einem vorherigen Export bzw. von deinem Speicherpfad stammen.",
                    "Use a file from a previous export or your storage path.",
                )
            ),
        )
        backup_confirmed = panel.checkbox(
            translate_text(("Aktuellen Stand überschreiben", "Overwrite current state")),
            value=False,
            key=f"{key_prefix}backup_confirm",
            help=translate_text(
                (
                    "Der Import ersetzt den aktuellen Stand dieser Sitzung.",
                    "Importing replaces the current session state.",
                )
            ),
        )
        restore_clicked = st.form_submit_button(
            translate_text(("Backup einspielen", "Restore backup")),
            type="primary",
        )
    if restore_clicked:
        if backup_upload is None:
            panel.error(translate_text(("Bitte eine JSON-Datei auswählen.", "Please select a JSON file.")))
        elif not backup_confirmed:
            panel.error(
                translate_text(
                    (
                        "Bitte bestätige, dass der aktuelle Stand überschrieben wird.",
                        "Please confirm that the current state will be overwritten.",
                    )
                )
            )
        else:
            payload = _parse_backup_payload(backup_upload.getvalue())
            if payload is None:
                panel.error(
                    translate_text(
                        (
                            "Die Datei enthält kein gültiges Gerris-Backup.",
                            "The file does not contain a valid Gerris backup.",
                        )
                    )
                )
            else:
                _restore_backup_state(payload)
                panel.success(translate_text(("Backup importiert. App wird neu geladen.", "Backup restored. Reloading app.")))
                st.rerun()

    if panel.button(
        "Session zurücksetzen",
        key=f"{key_prefix}reset_session_btn",
        help=("Löscht ToDos, KPIs, Gamification und Einstellungen aus dieser Sitzung"),
    ):
        for cleanup_key in (
            AI_ENABLED_KEY,
            AI_QUADRANT_RATIONALE_KEY,
            AI_MOTIVATION_KEY,
            NEW_TODO_TITLE_KEY,
            NEW_TODO_DUE_KEY,
            NEW_TODO_QUADRANT_KEY,
            SETTINGS_GOAL_DAILY_KEY,
        ):
            st.session_state.pop(cleanup_key, None)
        reset_state()
        panel.success("Session zurückgesetzt")
        st.rerun()

    st.session_state[SS_SETTINGS] = settings
    persist_state()
    return show_storage_notice


def _resolve_active_journal_date() -> date:
    raw = st.session_state.get(JOURNAL_ACTIVE_DATE_KEY)
    if isinstance(raw, date):
        return raw

    try:
        return date.fromisoformat(str(raw))
    except Exception:
        return date.today()


def render_journal_section(*, ai_enabled: bool, client: Optional[OpenAI], todos: list[TodoItem]) -> None:
    ensure_journal_state()
    entries = get_journal_entries()
    active_date = _resolve_active_journal_date()

    action_cols = st.columns([0.45, 0.55])
    with action_cols[0]:
        if st.button(
            "Tagebucheintrag erstellen",
            type="primary",
            help="Öffnet das Formular für den heutigen Tag oder lädt den gespeicherten Entwurf.",
        ):
            st.session_state[JOURNAL_ACTIVE_DATE_KEY] = date.today()
            st.session_state[JOURNAL_FORM_SEED_KEY] = None
            st.rerun()
    with action_cols[1]:
        st.info(
            "Der Eintrag bleibt zwischengespeichert, bis du ihn speicherst.",
            icon="📝",
        )

    selection_cols = st.columns([0.6, 0.4])
    with selection_cols[0]:
        selected_date = st.date_input(
            "Datum des Eintrags",
            value=active_date,
            format="YYYY-MM-DD",
            max_value=date.today(),
            key=JOURNAL_ACTIVE_DATE_KEY,
            help="Ein Eintrag pro Kalendertag; bestehende Entwürfe werden automatisch geladen.",
        )

    existing_entry = entries.get(selected_date)
    if existing_entry:
        st.success("Vorhandener Entwurf geladen.")
        entry = existing_entry
    else:
        entry = JournalEntry(date=selected_date, moods=list(MOOD_PRESETS[:2]))

    todo_lookup = {todo.id: todo for todo in todos}
    if entry.linked_todo_ids:
        labels: list[str] = []
        for todo_id in entry.linked_todo_ids:
            todo_match = todo_lookup.get(todo_id)
            title = todo_match.title if todo_match else None
            labels.append(title or todo_id)
        if labels:
            st.info(
                translate_text(
                    (
                        f"Verknüpfte Ziele/Aufgaben: {', '.join(labels)}",
                        f"Linked goals/tasks: {', '.join(labels)}",
                    )
                )
            )

    gratitude_suggestions = journal_gratitude_suggestions(exclude_date=selected_date)
    _prefill_journal_form(entry)

    with st.form("journal_form"):
        st.markdown("### Stimmung und Emotionen")
        mood_cols = st.columns([0.6, 0.4])
        with mood_cols[0]:
            moods = st.multiselect(
                "Wie fühlst du dich?",
                options=list(MOOD_PRESETS),
                default=st.session_state.get(_journal_field_key("moods"), list(MOOD_PRESETS[:2])),
                key=_journal_field_key("moods"),
                help="Tags mit Autosuggest; eigene Einträge möglich.",
            )
        with mood_cols[1]:
            mood_notes = st.text_area(
                "Kurzbeschreibung",
                value=st.session_state.get(_journal_field_key("mood_notes"), ""),
                key=_journal_field_key("mood_notes"),
                placeholder="z. B. ruhig nach dem Spaziergang",
            )

        journal_cols = st.columns(4)

        with journal_cols[0]:
            st.markdown("#### Auslöser & Reaktionen")
            triggers_and_reactions = st.text_area(
                "Was ist passiert und wie hast du reagiert?",
                value=st.session_state.get(_journal_field_key("triggers_and_reactions"), ""),
                key=_journal_field_key("triggers_and_reactions"),
                placeholder="z. B. stressiges Telefonat, dann 5 Minuten geatmet",
            )

        with journal_cols[1]:
            st.markdown("#### Gedanken-Challenge")
            negative_thought = st.text_area(
                "Automatischer Gedanke",
                value=st.session_state.get(_journal_field_key("negative_thought"), ""),
                key=_journal_field_key("negative_thought"),
                placeholder="z. B. 'Ich schaffe das nie'",
            )
            rational_response = st.text_area(
                "Reframing",
                value=st.session_state.get(_journal_field_key("rational_response"), ""),
                key=_journal_field_key("rational_response"),
                placeholder="z. B. 'Ein Schritt nach dem anderen'",
            )

        with journal_cols[2]:
            st.markdown("#### Selbstfürsorge")
            self_care_today = st.text_area(
                "Was habe ich heute für mich getan?",
                value=st.session_state.get(_journal_field_key("self_care_today"), ""),
                key=_journal_field_key("self_care_today"),
                placeholder="z. B. kurzer Spaziergang, Tee in Ruhe",
            )
            self_care_tomorrow = st.text_area(
                "Was mache ich morgen besser?",
                value=st.session_state.get(_journal_field_key("self_care_tomorrow"), ""),
                key=_journal_field_key("self_care_tomorrow"),
                placeholder="z. B. Pausen blocken, früher ins Bett",
            )

        with journal_cols[3]:
            st.markdown("#### Lichtblicke & Dankbarkeit")
            gratitude_inputs = _render_gratitude_inputs(gratitude_suggestions)

        st.markdown("### Kategorien & Ziele")
        selected_categories = st.multiselect(
            "Welche Bereiche waren beteiligt?",
            options=list(Category),
            format_func=lambda option: option.label,
            default=st.session_state.get(_journal_field_key("categories"), []),
            key=_journal_field_key("categories"),
            help="Mehrfachauswahl mit Suche; verbindet Eintrag und Ziele.",
        )

        save_clicked = st.form_submit_button("Eintrag speichern", type="primary")
        if save_clicked:
            journal_entry = JournalEntry(
                date=selected_date,
                moods=moods,
                mood_notes=mood_notes,
                triggers_and_reactions=triggers_and_reactions,
                negative_thought=negative_thought,
                rational_response=rational_response,
                self_care_today=self_care_today,
                self_care_tomorrow=self_care_tomorrow,
                gratitudes=gratitude_inputs,
                categories=[Category(item) for item in selected_categories],
            )
            upsert_journal_entry(journal_entry)
            with st.spinner("Prüfe Eintrag gegen Ziele..."):
                alignment = suggest_journal_alignment(
                    entry=journal_entry,
                    todos=todos,
                    client=client if ai_enabled else None,
                )
            linked_target_ids = [
                candidate.target_id
                for candidate in getattr(alignment.payload, "actions", [])
                if getattr(candidate, "target_id", None)
            ]
            if linked_target_ids:
                journal_entry = append_journal_links(journal_entry, linked_target_ids)
                upsert_journal_entry(journal_entry)
            _store_journal_alignment(journal_entry.date, alignment)
            st.success("Eintrag gespeichert.")
            st.session_state[JOURNAL_FORM_SEED_KEY] = journal_entry.date
            st.rerun()

    _render_journal_alignment_review()

    if entries:
        st.markdown("#### Letzte Einträge")
        sorted_entries = sorted(entries.items(), key=lambda item: item[0], reverse=True)
        for entry_date, history_entry in sorted_entries[:5]:
            with st.expander(entry_date.isoformat()):
                st.write(" · ".join(history_entry.moods) if history_entry.moods else "—")
                st.caption(history_entry.triggers_and_reactions or "Keine Auslöser notiert")
                if history_entry.categories:
                    st.caption("Kategorien" + ", ".join(category.label for category in history_entry.categories))


def main() -> None:
    st.set_page_config(
        page_title="Gerris ErfolgsTracker",
        page_icon="✅",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    _inject_dark_theme_styles()
    storage_backend = _bootstrap_storage()
    init_state()
    is_cloud = _is_streamlit_cloud()

    client = get_openai_client()
    stats = get_kpi_stats()
    build_metadata = _get_build_metadata()
    settings = _ensure_settings_defaults(client=client, stats=stats)
    render_language_toggle()
    selection = render_navigation()

    ai_enabled, show_storage_notice = render_dashboard_header(
        settings=settings,
        stats=stats,
        client=client,
        build_metadata=build_metadata,
    )
    if show_storage_notice:
        _render_storage_notice(storage_backend, is_cloud=is_cloud)
    todos = get_todos()
    run_daily_coach_scan(todos)
    schedule_weekly_review(todos=todos, stats=stats)

    if not client:
        st.info(
            "Kein OPENAI_API_KEY gefunden. Vorschläge nutzen Fallbacks, bis ein Key in "
            "st.secrets oder der Umgebung hinterlegt ist."
        )

    category_goals = _sanitize_category_goals(settings)

    if selection == DASHBOARD_PAGE_KEY:
        render_dashboard_page(
            todos=todos,
            stats=stats,
            category_goals=category_goals,
            settings=settings,
            ai_enabled=ai_enabled,
            client=client,
        )
    elif selection == GOALS_PAGE_KEY:
        ai_enabled = render_goals_page(
            todos=todos,
            stats=stats,
            settings=settings,
            ai_enabled=ai_enabled,
            client=client,
        )
    elif selection == TASKS_PAGE_KEY:
        render_tasks_page(ai_enabled=ai_enabled, client=client, todos=todos, stats=stats)
    elif selection == EMAILS_PAGE_KEY:
        render_emails_page(ai_enabled=ai_enabled, client=client)
    else:
        render_journal_section(ai_enabled=ai_enabled, client=client, todos=todos)


if __name__ == "__main__":
    main()
