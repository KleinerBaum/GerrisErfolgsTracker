from __future__ import annotations

import os
import json
from contextlib import nullcontext

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal, Mapping, Optional, Sequence, TypedDict, cast

import plotly.graph_objects as go
import streamlit as st
from openai import OpenAI

from gerris_erfolgs_tracker.ai_features import (
    AISuggestion,
    suggest_milestones,
    suggest_quadrant,
)
from gerris_erfolgs_tracker.llm_schemas import (
    MilestoneSuggestionItem,
    MilestoneSuggestionList,
)
from gerris_erfolgs_tracker.charts import (
    PRIMARY_COLOR,
    build_category_weekly_completion_figure,
    build_weekly_completion_figure,
)
from gerris_erfolgs_tracker.constants import (
    AI_ENABLED_KEY,
    AI_MOTIVATION_KEY,
    AI_QUADRANT_RATIONALE_KEY,
    AVATAR_PROMPT_INDEX_KEY,
    FILTER_SELECTED_CATEGORIES_KEY,
    FILTER_SHOW_DONE_KEY,
    FILTER_SORT_OVERRIDE_KEY,
    GOAL_CREATION_VISIBLE_KEY,
    GOAL_OVERVIEW_SHOW_CATEGORY_KEY,
    GOAL_OVERVIEW_SHOW_KPI_KEY,
    GOAL_OVERVIEW_SELECTED_TASKS_KEY,
    NEW_TODO_CATEGORY_KEY,
    NEW_TODO_DESCRIPTION_KEY,
    NEW_TODO_DUE_KEY,
    NEW_TODO_ENABLE_TARGET_KEY,
    NEW_TODO_TEMPLATE_KEY,
    NEW_TODO_PRIORITY_KEY,
    NEW_TODO_PROGRESS_CURRENT_KEY,
    NEW_TODO_PROGRESS_TARGET_KEY,
    NEW_TODO_PROGRESS_UNIT_KEY,
    NEW_TODO_AUTO_COMPLETE_KEY,
    NEW_TODO_COMPLETION_CRITERIA_KEY,
    NEW_TODO_QUADRANT_KEY,
    NEW_TODO_QUADRANT_PREFILL_KEY,
    NEW_TODO_RESET_TRIGGER_KEY,
    NEW_TODO_TITLE_KEY,
    NEW_TODO_RECURRENCE_KEY,
    NEW_TODO_REMINDER_KEY,
    NEW_MILESTONE_COMPLEXITY_KEY,
    NEW_MILESTONE_NOTE_KEY,
    NEW_MILESTONE_POINTS_KEY,
    NEW_MILESTONE_SUGGESTIONS_KEY,
    NEW_MILESTONE_TITLE_KEY,
    NEW_TODO_DRAFT_MILESTONES_KEY,
    PENDING_DELETE_TODO_KEY,
    SETTINGS_GOAL_DAILY_KEY,
    SHOW_STORAGE_NOTICE_KEY,
    SS_SETTINGS,
)
from gerris_erfolgs_tracker.calendar_view import render_calendar_view
from gerris_erfolgs_tracker.eisenhower import (
    EisenhowerQuadrant,
    group_by_quadrant,
    sort_todos,
)
from gerris_erfolgs_tracker.gamification import (
    award_journal_points,
    calculate_progress_to_next_level,
    get_gamification_state,
    next_avatar_prompt,
    update_gamification_on_completion,
)
from gerris_erfolgs_tracker.kpis import (
    get_kpi_stats,
    get_weekly_completion_counts,
    update_kpis_on_completion,
)
from gerris_erfolgs_tracker.kpi import (
    CategoryKpi,
    aggregate_category_kpis,
    count_new_tasks_last_7_days,
    last_7_days_completions_by_category,
)
from gerris_erfolgs_tracker.journal import (
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
from gerris_erfolgs_tracker.i18n import (
    LanguageCode,
    get_language,
    localize_streamlit,
    translate_text,
)
from gerris_erfolgs_tracker.llm import get_openai_client
from gerris_erfolgs_tracker.models import (
    Category,
    EmailReminderOffset,
    GamificationMode,
    GamificationState,
    JournalEntry,
    KpiStats,
    Milestone,
    MilestoneComplexity,
    MilestoneStatus,
    RecurrencePattern,
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
from gerris_erfolgs_tracker.storage import FileStorageBackend
from gerris_erfolgs_tracker.todos import (
    add_kanban_card,
    add_todo,
    delete_todo,
    duplicate_todo,
    move_kanban_card,
    add_milestone,
    move_milestone,
    toggle_complete,
    update_todo,
    update_milestone,
)


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


def _goal_option_label(value: str, options: tuple[tuple[str, tuple[str, str]], ...]) -> str:
    for option_value, label in options:
        if option_value == value:
            return translate_text(label)
    return str(value)


localize_streamlit()


def quadrant_badge(quadrant: EisenhowerQuadrant, *, include_full_label: bool = False) -> str:
    label = translate_text((quadrant.short_label, quadrant.short_label))
    if include_full_label:
        full_label = translate_text(quadrant.label)
        label = f"{label} — {full_label}"
    return f"<span style='color:{quadrant.color_hex}; font-weight:600'>{label}</span>"


def _inject_dark_theme_styles() -> None:
    st.markdown(
        """
        <style>
            :root {
                --gerris-primary: #1c9c82;
                --gerris-surface: #10211f;
                --gerris-surface-alt: #0e1917;
                --gerris-border: #1f4a42;
                --gerris-text: #f3f7f5;
                --gerris-muted: #c5d5d1;
            }

            .stApp {
                background: radial-gradient(circle at 20% 20%, rgba(34, 70, 60, 0.25), transparent 30%),
                            radial-gradient(circle at 80% 0%, rgba(28, 156, 130, 0.18), transparent 30%),
                            linear-gradient(160deg, #0f1b19 0%, #0c1412 60%, #0b1311 100%);
                color: var(--gerris-text);
            }

            .block-container {
                padding-top: 1.2rem;
                padding-left: 1.5rem;
                padding-right: 1.5rem;
                max-width: 1600px;
                width: 100%;
            }

            h1, h2, h3, h4, h5, h6, label, p {
                color: var(--gerris-text);
            }

            div[data-testid="stMetric"] {
                background: linear-gradient(145deg, var(--gerris-surface), var(--gerris-surface-alt));
                border: 1px solid var(--gerris-border);
                border-radius: 14px;
                padding: 12px;
            }

            div[data-testid="stMetricValue"] {
                color: var(--gerris-text);
                font-weight: 700;
            }

            div[data-testid="stMetricDelta"] {
                color: #9ce6c3;
                font-weight: 600;
            }

            div[data-testid="stVerticalBlockBorderWrapper"] {
                border: 1px solid var(--gerris-border);
                background: linear-gradient(145deg, var(--gerris-surface), var(--gerris-surface-alt));
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 0.9rem;
            }

            [data-testid="stExpander"] {
                background: var(--gerris-surface);
                border: 1px solid var(--gerris-border);
                border-radius: 12px;
            }

            [data-testid="stExpander"] summary {
                color: var(--gerris-text);
                font-weight: 600;
            }

            .task-meta {
                color: var(--gerris-muted);
                font-size: 0.9rem;
                margin-top: -0.25rem;
            }

            .stAlert {
                margin-bottom: 0.8rem;
            }

            .stCaption {
                margin-bottom: 0.5rem;
            }

            /* Highlight today's date inside Streamlit date pickers without breaking dark mode */
            .stDateInput .flatpickr-day.today:not(.selected) {
                border: 1.5px solid var(--gerris-primary);
                background: rgba(28, 156, 130, 0.18);
                color: var(--gerris-text);
                font-weight: 700;
            }

            .stDateInput .flatpickr-day.today.selected,
            .stDateInput .flatpickr-day.today:focus {
                border: 1.5px solid var(--gerris-primary);
                background: rgba(28, 156, 130, 0.28);
                color: var(--gerris-text);
                font-weight: 700;
                box-shadow: 0 0 0 1px rgba(28, 156, 130, 0.35) inset;
            }
        </style>
    """,
        unsafe_allow_html=True,
    )


def _points_for_complexity(complexity: MilestoneComplexity) -> int:
    if complexity is MilestoneComplexity.SMALL:
        return 10
    if complexity is MilestoneComplexity.MEDIUM:
        return 25
    return 50


@dataclass
class TaskTemplate:
    key: str
    label: str
    description: str
    settings: Mapping[str, Any]


def _todo_templates(*, today: date) -> list[TaskTemplate]:
    next_week = today + timedelta(days=7)
    deep_dive_due = today + timedelta(days=2)

    return [
        TaskTemplate(
            key="free",
            label="Freie Eingabe",
            description="Manuell ausfüllen, ohne Vorgaben.",
            settings={},
        ),
        TaskTemplate(
            key="today_focus",
            label="Heute abschließen",
            description=(
                "Setzt Fälligkeit auf heute, Priorität 2 und eine 30-Minuten-Zielzeit mit Auto-Abschluss"
                " plus Erinnerung 1 Stunde vorher."
            ),
            settings={
                NEW_TODO_DUE_KEY: today,
                NEW_TODO_PRIORITY_KEY: 2,
                NEW_TODO_ENABLE_TARGET_KEY: True,
                NEW_TODO_PROGRESS_TARGET_KEY: 0.5,
                NEW_TODO_PROGRESS_UNIT_KEY: "h",
                NEW_TODO_AUTO_COMPLETE_KEY: True,
                NEW_TODO_COMPLETION_CRITERIA_KEY: ("30 Min. fokussiert arbeiten + kurzes Ergebnis notieren."),
                NEW_TODO_REMINDER_KEY: EmailReminderOffset.ONE_HOUR,
                NEW_TODO_RECURRENCE_KEY: RecurrencePattern.ONCE,
            },
        ),
        TaskTemplate(
            key="weekly_routine",
            label="Wöchentliche Routine",
            description=(
                "Nächste Woche fällig, wöchentliche Wiederholung, Priorität 3 und Erinnerung einen Tag vorher."
            ),
            settings={
                NEW_TODO_DUE_KEY: next_week,
                NEW_TODO_PRIORITY_KEY: 3,
                NEW_TODO_ENABLE_TARGET_KEY: False,
                NEW_TODO_REMINDER_KEY: EmailReminderOffset.ONE_DAY,
                NEW_TODO_RECURRENCE_KEY: RecurrencePattern.WEEKLY,
            },
        ),
        TaskTemplate(
            key="deep_dive",
            label="Deep Dive",
            description=(
                "Fälligkeit in 2 Tagen, Priorität 1, klares 2h-Ziel mit Auto-Abschluss und kurzer Review-Notiz."
            ),
            settings={
                NEW_TODO_DUE_KEY: deep_dive_due,
                NEW_TODO_PRIORITY_KEY: 1,
                NEW_TODO_ENABLE_TARGET_KEY: True,
                NEW_TODO_PROGRESS_TARGET_KEY: 2.0,
                NEW_TODO_PROGRESS_UNIT_KEY: "h",
                NEW_TODO_AUTO_COMPLETE_KEY: True,
                NEW_TODO_COMPLETION_CRITERIA_KEY: ("2h konzentriert + kurze Review (Lessons Learned)."),
                NEW_TODO_REMINDER_KEY: EmailReminderOffset.ONE_DAY,
                NEW_TODO_RECURRENCE_KEY: RecurrencePattern.ONCE,
            },
        ),
    ]


def _apply_task_template(template: TaskTemplate) -> None:
    for key, value in template.settings.items():
        st.session_state[key] = value
    st.session_state[NEW_TODO_TEMPLATE_KEY] = template.key
    st.session_state["_todo_template_last_applied"] = template.key


def _current_gamification_mode() -> GamificationMode:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    try:
        return GamificationMode(settings.get("gamification_mode", GamificationMode.POINTS.value))
    except ValueError:
        return GamificationMode.POINTS


def _render_delete_confirmation(todo: TodoItem, *, key_prefix: str) -> None:
    pending_key = f"{PENDING_DELETE_TODO_KEY}_{todo.id}"
    delete_label = "Löschen"
    confirm_label = "Ja, endgültig löschen"
    cancel_label = "Abbrechen"
    prompt = translate_text(
        (
            "Bist du sicher? Diese Aufgabe wird dauerhaft entfernt.",
            "Are you sure? This task will be removed permanently.",
        )
    )

    if st.session_state.get(pending_key):
        st.warning(prompt)
        confirm_cols = st.columns(2)
        if confirm_cols[0].button(confirm_label, key=f"{key_prefix}_confirm_{todo.id}"):
            st.session_state.pop(pending_key, None)
            delete_todo(todo.id)
            st.success("Aufgabe gelöscht.")
            st.rerun()

        if confirm_cols[1].button(cancel_label, key=f"{key_prefix}_cancel_{todo.id}"):
            st.session_state.pop(pending_key, None)
            st.info("Löschung abgebrochen.")
            st.rerun()
        return

    if st.button(
        delete_label,
        key=f"{key_prefix}_delete_{todo.id}",
        help="Aufgabe entfernen",
    ):
        st.session_state[pending_key] = True
        st.rerun()


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


def _sanitize_goal_overview_tasks(selection: object, todos: Sequence[TodoItem]) -> list[str]:
    valid_ids = {todo.id for todo in todos}
    if not isinstance(selection, list):
        return []

    sanitized: list[str] = []
    for candidate in selection:
        candidate_id = str(candidate)
        if candidate_id in valid_ids:
            sanitized.append(candidate_id)

    return sanitized


def _filter_goal_overview_todos(todos: Sequence[TodoItem], selected_ids: Sequence[str]) -> list[TodoItem]:
    if not selected_ids:
        return list(todos)

    selected_lookup = set(selected_ids)
    filtered = [todo for todo in todos if todo.id in selected_lookup]
    return filtered or list(todos)


SortOverride = Literal["priority", "due_date", "created_at"]
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

    st.markdown("#### Vorgeschlagene Updates")
    if summary:
        st.caption(f"{badge} {summary}")
    st.info("Bitte prüfe die vermuteten Fortschritte und bestätige die gewünschten Updates.")

    selected_indices: list[int] = []
    for index, action in enumerate(actions):
        if not isinstance(action, Mapping):
            continue

        title = str(action.get("target_title", "Ziel"))
        suggested_points = int(action.get("suggested_points", 0) or 0)
        follow_up = str(action.get("follow_up", ""))
        rationale = str(action.get("rationale", ""))

        checkbox_key = f"{JOURNAL_PENDING_SELECTION_PREFIX}{index}"
        label = f"{title} (+{suggested_points} Punkte)"
        confirmed = st.checkbox(label, key=checkbox_key)
        if follow_up:
            st.caption(follow_up)
        if rationale:
            st.caption(f"Grund: {rationale}")

        if confirmed:
            selected_indices.append(index)

    apply_disabled = len(selected_indices) == 0
    if st.button(
        "Ausgewählte Updates anwenden",
        type="primary",
        disabled=apply_disabled,
    ):
        for index in selected_indices:
            if index >= len(actions):
                continue
            action = actions[index]
            if not isinstance(action, Mapping):
                continue
            title = str(action.get("target_title", "Ziel"))
            points = int(action.get("suggested_points", 0) or 0)
            rationale = str(action.get("rationale", "")) or "Journalabgleich"
            award_journal_points(
                entry_date=entry_date,
                target_title=title,
                points=points,
                rationale=rationale,
            )

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


def _gamification_snapshot() -> GamificationState:
    return get_gamification_state().model_copy(deep=True)


def _celebrate_gamification_changes(before: GamificationState, after: GamificationState) -> None:
    new_badges = [badge for badge in after.badges if badge not in before.badges]

    if after.level > before.level:
        st.toast(
            translate_text(
                (
                    f"🎉 Levelaufstieg! Du bist jetzt Level {after.level}.",
                    f"🎉 Level up! You reached level {after.level}.",
                )
            )
        )

    for badge in new_badges:
        st.toast(
            translate_text(
                (
                    f"🏅 Neues Abzeichen: {badge}",
                    f"🏅 New badge unlocked: {badge}",
                )
            )
        )


def _handle_completion_success(todo: TodoItem, *, previous_state: GamificationState | None = None) -> None:
    completion_time = todo.completed_at or datetime.now(timezone.utc)
    stats = update_kpis_on_completion(completion_time)
    before_state = previous_state or _gamification_snapshot()
    after_state = update_gamification_on_completion(todo, stats)
    _celebrate_gamification_changes(before_state, after_state)
    st.success(
        translate_text(
            (
                f"Aktivität '{todo.title}' wurde als erledigt gespeichert.",
                f"Activity '{todo.title}' marked as done.",
            )
        )
    )


def _toggle_todo_completion(todo: TodoItem) -> None:
    previous_state = _gamification_snapshot()
    updated = toggle_complete(todo.id)
    if updated and updated.completed:
        _handle_completion_success(updated, previous_state=previous_state)
    st.rerun()


def _task_sort_key(todo: TodoItem, sort_override: SortOverride) -> tuple[object, ...]:
    due_key = (todo.due_date is None, todo.due_date or datetime.max)
    created_key = todo.created_at or datetime.max

    if sort_override == "due_date":
        return (due_key, todo.priority, created_key)
    if sort_override == "created_at":
        return (created_key, todo.priority, due_key)
    return (todo.priority, *due_key, created_key)


def _render_subtask_progress(todo: TodoItem) -> None:
    kanban = todo.kanban
    done_column_id = kanban.done_column_id()
    total_cards = len(kanban.cards)
    done_cards = len([card for card in kanban.cards if card.column_id == done_column_id])

    if total_cards == 0:
        st.caption("Keine Unteraufgaben vorhanden.")
        return

    completion_ratio = done_cards
    st.progress(
        completion_ratio,
        text=f"{done_cards}/{total_cards} Unteraufgaben erledigt",
    )


def _render_todo_kanban(todo: TodoItem) -> None:
    st.markdown("#### Kanban")
    kanban = todo.kanban
    ordered_columns = sorted(kanban.columns, key=lambda column: column.order)
    column_labels: dict[str, str] = {
        "backlog": "Backlog",
        "doing": "In Arbeit",
        "done": "Erledigt",
    }

    _render_subtask_progress(todo)

    with st.form(f"kanban_add_{todo.id}", clear_on_submit=True):
        subtask_title = st.text_input(
            "Titel der Unteraufgabe",
            key=f"kanban_title_{todo.id}",
            placeholder="Nächsten Schritt ergänzen",
        )
        subtask_description = st.text_area(
            "Beschreibung (optional)",
            key=f"kanban_description_{todo.id}",
            placeholder="Kurze Details oder Akzeptanzkriterien",
        )
        create_subtask = st.form_submit_button("Karte anlegen")
        if create_subtask:
            if not subtask_title.strip():
                st.warning("Bitte einen Titel für die Karte angeben.")
            else:
                add_kanban_card(todo.id, title=subtask_title.strip(), description_md=subtask_description.strip())
                st.success("Unteraufgabe hinzugefügt.")
                st.rerun()

    st.markdown("#### Spalten")
    column_containers = st.columns(len(ordered_columns))
    cards_by_column: dict[str, list] = {column.id: [] for column in ordered_columns}
    for card in sorted(kanban.cards, key=lambda card: card.created_at):
        cards_by_column.setdefault(card.column_id, []).append(card)

    for column_index, (column, container) in enumerate(zip(ordered_columns, column_containers)):
        with container:
            label = column_labels.get(column.id, column.title)
            st.markdown(f"**{label}**")
            column_cards = cards_by_column.get(column.id, [])
            if not column_cards:
                st.caption("Keine Karten hier.")
                continue

            for card in column_cards:
                with st.container(border=True):
                    st.markdown(card.title)
                    if card.description_md.strip():
                        snippet = card.description_md.strip().splitlines()[0]
                        st.caption(snippet[:140] + ("…" if len(snippet) > 140 else ""))

                    move_columns = st.columns(2)
                    if move_columns[0].button(
                        "← Links",
                        key=f"kanban_move_left_{todo.id}_{card.id}",
                        disabled=column_index == 0,
                    ):
                        move_kanban_card(todo.id, card_id=card.id, direction="left")
                        st.rerun()

                    if move_columns[1].button(
                        "Rechts →",
                        key=f"kanban_move_right_{todo.id}_{card.id}",
                        disabled=column_index == len(ordered_columns) - 1,
                    ):
                        move_kanban_card(todo.id, card_id=card.id, direction="right")
                        st.rerun()


def _render_milestone_suggestions(
    *,
    todo: TodoItem,
    gamification_mode: GamificationMode,
    ai_enabled: bool,
) -> None:
    suggestion_store: dict[str, list[dict[str, str]]] = st.session_state.get(NEW_MILESTONE_SUGGESTIONS_KEY, {})
    raw_suggestions = suggestion_store.get(todo.id, [])
    suggestions = [MilestoneSuggestionItem.model_validate(item) for item in raw_suggestions]

    trigger_ai = st.button(
        "AI: Meilensteine vorschlagen",
        key=f"milestone_ai_{todo.id}",
        disabled=not ai_enabled,
        help="Erzeuge Vorschläge für Unterziele",
    )

    if trigger_ai:
        suggestion: AISuggestion[MilestoneSuggestionList] = suggest_milestones(
            todo.title,
            gamification_mode=gamification_mode,
            client=get_openai_client() if ai_enabled else None,
        )
        st.session_state[NEW_MILESTONE_SUGGESTIONS_KEY] = suggestion_store | {
            todo.id: [item.model_dump() for item in suggestion.payload.milestones]
        }
        label = "KI-Vorschlag" if suggestion.from_ai else "Fallback"
        st.info(f"{label}: {len(suggestion.payload.milestones)} Optionen bereit.")
        suggestions = suggestion.payload.milestones

    if not suggestions:
        st.caption("Keine Vorschläge aktiv")
        return

    st.markdown("##### Vorschläge übernehmen")
    for index, item in enumerate(suggestions):
        complexity = MilestoneComplexity(item.complexity)
        default_points = _points_for_complexity(complexity)
        with st.container(border=True):
            st.markdown(f"**{item.title}**")
            st.caption(f"{complexity.label} · ~{default_points} Punkte | {item.rationale}")
            add_label = translate_text(("Übernehmen", "Add"))
            if st.button(
                f"{add_label}",
                key=f"apply_milestone_{todo.id}_{index}",
                help="Vorschlag zur Aufgabe hinzufügen",
            ):
                add_milestone(
                    todo.id,
                    title=item.title,
                    complexity=complexity,
                    points=default_points,
                    note=item.rationale,
                )
                st.success("Meilenstein übernommen")
                st.rerun()


def _render_milestone_board(todo: TodoItem, *, gamification_mode: GamificationMode) -> None:
    ai_enabled = bool(st.session_state.get(AI_ENABLED_KEY, False))
    st.markdown("#### Unterziele & Meilensteine")
    st.caption("Plane Etappenziele, die du auf einem kleinen Priority-Board nachverfolgst.")

    status_order = list(MilestoneStatus)
    status_columns = st.columns(len(status_order))
    for status, column in zip(status_order, status_columns):
        with column:
            column.markdown(f"**{status.label}**")
            items = [item for item in todo.milestones if item.status is status]
            if not items:
                column.caption("Keine Einträge")
                continue

            for milestone in sorted(items, key=lambda item: (-item.points, item.title.lower())):
                with st.container(border=True):
                    st.markdown(f"**{milestone.title}**")
                    st.caption(f"{milestone.complexity.label} · {milestone.points} Punkte")
                    if milestone.note.strip():
                        st.markdown(milestone.note)

                    move_cols = st.columns(2)
                    if move_cols[0].button(
                        "←", key=f"milestone_left_{todo.id}_{milestone.id}", disabled=status is status_order[0]
                    ):
                        move_milestone(todo.id, milestone.id, direction="left")
                        st.rerun()
                    if move_cols[1].button(
                        "→",
                        key=f"milestone_right_{todo.id}_{milestone.id}",
                        disabled=status is status_order[-1],
                    ):
                        move_milestone(todo.id, milestone.id, direction="right")
                        st.rerun()

                    with st.form(f"milestone_edit_{todo.id}_{milestone.id}"):
                        edit_complexity = st.selectbox(
                            "Aufwand",
                            options=list(MilestoneComplexity),
                            format_func=lambda option: option.label,
                            index=list(MilestoneComplexity).index(milestone.complexity),
                            key=f"milestone_complexity_{todo.id}_{milestone.id}",
                        )
                        recommended_points = _points_for_complexity(edit_complexity)
                        edit_points = st.number_input(
                            "Punkte",
                            min_value=0,
                            value=int(milestone.points or recommended_points),
                            step=1,
                            key=f"milestone_points_{todo.id}_{milestone.id}",
                            help=f"Empfohlen: {recommended_points}",
                        )
                        edit_note = st.text_area(
                            "Notiz (optional)",
                            value=milestone.note,
                            key=f"milestone_note_{todo.id}_{milestone.id}",
                        )
                        if st.form_submit_button("Speichern"):
                            update_milestone(
                                todo.id,
                                milestone.id,
                                complexity=edit_complexity,
                                points=int(edit_points),
                                note=edit_note,
                            )
                            st.success("Aktualisiert")
                            st.rerun()

    st.markdown("##### Neues Unterziel")
    with st.form(f"milestone_add_{todo.id}"):
        title = st.text_input(
            "Titel",
            key=f"{NEW_MILESTONE_TITLE_KEY}_{todo.id}",
            placeholder="z. B. Entwurf abstimmen",
        )
        complexity = st.selectbox(
            "Aufwand",
            options=list(MilestoneComplexity),
            format_func=lambda option: option.label,
            key=f"{NEW_MILESTONE_COMPLEXITY_KEY}_{todo.id}",
        )
        suggested_points = _points_for_complexity(complexity)
        points = st.number_input(
            "Punkte",
            min_value=0,
            value=int(suggested_points),
            step=1,
            key=f"{NEW_MILESTONE_POINTS_KEY}_{todo.id}",
            help="Empfohlene Punkte basierend auf Aufwand",
        )
        note = st.text_area(
            "Notiz (optional)",
            key=f"{NEW_MILESTONE_NOTE_KEY}_{todo.id}",
            placeholder="Warum ist dieser Schritt wichtig?",
        )
        add_clicked = st.form_submit_button("Hinzufügen")
        if add_clicked:
            if not title.strip():
                st.warning("Bitte Titel ergänzen")
            else:
                add_milestone(
                    todo.id,
                    title=title.strip(),
                    complexity=complexity,
                    points=int(points),
                    note=note.strip(),
                )
                st.success("Meilenstein gespeichert")
                st.rerun()

    _render_milestone_suggestions(todo=todo, gamification_mode=gamification_mode, ai_enabled=ai_enabled)


def render_task_row(todo: TodoItem, *, parent: Any | None = None) -> None:
    container = (parent or st).container(border=True)
    gamification_mode = _current_gamification_mode()
    with container:
        container.markdown("<div class='task-list-row'>", unsafe_allow_html=True)
        row_columns = st.columns([0.1, 0.38, 0.16, 0.18, 0.18])
        with row_columns[0]:
            st.checkbox(
                "Erledigt",
                value=todo.completed,
                label_visibility="collapsed",
                key=f"list_done_{todo.id}",
                on_change=_toggle_todo_completion,
                kwargs={"todo": todo},
                help="Hake Aufgabe ab oder öffne sie erneut",
            )

        with row_columns[1]:
            st.markdown(f"**{todo.title}**")
            st.caption(f"{translate_text(('Kategorie', 'Category'))}: {todo.category.label}")

        with row_columns[2]:
            st.markdown(f"<div class='task-priority'>P{todo.priority}</div>", unsafe_allow_html=True)
            st.caption("Priorität")

        with row_columns[3]:
            if todo.due_date:
                st.markdown(
                    f"<div class='task-due'>{translate_text(('Fällig', 'Due'))}: {todo.due_date.date().isoformat()}</div>",
                    unsafe_allow_html=True,
                )
            else:
                st.caption("Kein Fälligkeitsdatum")

        with row_columns[4]:
            st.markdown(
                f"<div class='task-quadrant'>{quadrant_badge(todo.quadrant, include_full_label=True)}</div>",
                unsafe_allow_html=True,
            )

        container.markdown("</div>", unsafe_allow_html=True)

        with st.expander("Details anzeigen"):
            st.caption(f"Kategorie: {todo.category.label}")
            if todo.description_md.strip():
                st.markdown(todo.description_md)
            else:
                st.caption("Keine Beschreibung vorhanden.")

            st.markdown("#### Terminierung")
            st.caption(f"Wiederholung: {todo.recurrence.label}")
            st.caption(f"Erinnerung: {todo.email_reminder.label}")

            st.markdown("#### Fortschrittsregel")
            if todo.progress_target is not None:
                if todo.progress_target > 0:
                    progress_ratio = min(1.0, todo.progress_current / todo.progress_target)
                else:
                    progress_ratio = 1.0
                st.progress(
                    progress_ratio,
                    text=f"{todo.progress_current:.2f} / {todo.progress_target:.2f} {todo.progress_unit}",
                )
                st.caption(f"Automatisch abschließen: {'Ja' if todo.auto_done_when_target_reached else 'Nein'}")
                if todo.completion_criteria_md.strip():
                    st.markdown(todo.completion_criteria_md)
            else:
                st.caption(f"Kein Ziel hinterlegt. Aktueller Stand: {todo.progress_current:.2f} {todo.progress_unit}")

            _render_milestone_board(todo, gamification_mode=gamification_mode)

            with st.form(f"quick_edit_{todo.id}"):
                left, right = st.columns(2)
                with left:
                    new_category = st.selectbox(
                        "Kategorie",
                        options=list(Category),
                        format_func=lambda option: option.label,
                        index=list(Category).index(todo.category),
                        key=f"quick_category_{todo.id}",
                        label_visibility="collapsed",
                    )
                    new_priority = st.slider(
                        "Priorität",
                        min_value=1,
                        max_value=5,
                        value=todo.priority,
                        key=f"quick_priority_{todo.id}",
                        label_visibility="collapsed",
                        help="1 = höchste Priorität, 5 = niedrigste",
                    )

                with right:
                    new_due = st.date_input(
                        "Fälligkeitsdatum",
                        value=todo.due_date.date() if todo.due_date else None,
                        format="YYYY-MM-DD",
                        key=f"quick_due_{todo.id}",
                        label_visibility="collapsed",
                    )
                    new_quadrant = st.selectbox(
                        "Eisenhower-Quadrant",
                        options=list(EisenhowerQuadrant),
                        format_func=lambda option: option.label,
                        index=list(EisenhowerQuadrant).index(todo.quadrant),
                        key=f"quick_quadrant_{todo.id}",
                        label_visibility="collapsed",
                    )

                recurrence_cols = st.columns(2)
                with recurrence_cols[0]:
                    new_recurrence = st.selectbox(
                        "Wiederholung",
                        options=list(RecurrencePattern),
                        format_func=lambda option: option.label,
                        index=list(RecurrencePattern).index(todo.recurrence),
                        key=f"quick_recurrence_{todo.id}",
                        label_visibility="collapsed",
                    )
                with recurrence_cols[1]:
                    new_reminder = st.selectbox(
                        "E-Mail-Erinnerung",
                        options=list(EmailReminderOffset),
                        format_func=lambda option: option.label,
                        index=list(EmailReminderOffset).index(todo.email_reminder),
                        key=f"quick_reminder_{todo.id}",
                        label_visibility="collapsed",
                    )

                with st.expander("Fortschrittsregel bearbeiten"):
                    enable_progress_target = st.checkbox(
                        "Ziel hinterlegen",
                        value=todo.progress_target is not None,
                        key=f"quick_progress_enable_{todo.id}",
                        label_visibility="collapsed",
                    )
                    progress_cols = st.columns([0.5, 0.5])
                    with progress_cols[0]:
                        edit_progress_target = st.number_input(
                            "Zielwert",
                            min_value=0.0,
                            value=float(todo.progress_target or 0.0),
                            step=1.0,
                            key=f"quick_progress_target_{todo.id}",
                            disabled=not enable_progress_target,
                            label_visibility="collapsed",
                        )
                    with progress_cols[1]:
                        edit_progress_unit = st.text_input(
                            "Einheit",
                            value=todo.progress_unit,
                            key=f"quick_progress_unit_{todo.id}",
                            disabled=not enable_progress_target,
                            label_visibility="collapsed",
                        )

                    edit_progress_current = st.number_input(
                        "Aktueller Stand",
                        min_value=0.0,
                        value=float(todo.progress_current),
                        step=0.5,
                        key=f"quick_progress_current_{todo.id}",
                        label_visibility="collapsed",
                    )

                    edit_auto_complete = st.toggle(
                        "Automatisch abschließen",
                        value=todo.auto_done_when_target_reached,
                        key=f"quick_progress_auto_{todo.id}",
                        disabled=not enable_progress_target,
                    )

                    edit_criteria_tabs = st.tabs(["Kriterien", "Vorschau"])
                    with edit_criteria_tabs[0]:
                        edit_completion_criteria = st.text_area(
                            "Erfüllungskriterien (Markdown)",
                            value=todo.completion_criteria_md,
                            key=f"quick_progress_criteria_{todo.id}",
                            disabled=not enable_progress_target,
                            label_visibility="collapsed",
                        )
                    with edit_criteria_tabs[1]:
                        if enable_progress_target and todo.completion_criteria_md.strip():
                            st.markdown(todo.completion_criteria_md)
                        elif enable_progress_target:
                            st.caption("Keine Kriterien gepflegt")
                        else:
                            st.caption("Kein Ziel aktiv")

                submitted_edit = st.form_submit_button("Speichern")
                if submitted_edit:
                    resolved_edit_target = edit_progress_target if enable_progress_target else None
                    resolved_edit_unit = edit_progress_unit if enable_progress_target else ""
                    resolved_edit_auto = edit_auto_complete if enable_progress_target else False
                    resolved_criteria = edit_completion_criteria if enable_progress_target else ""
                    update_todo(
                        todo.id,
                        category=new_category,
                        priority=new_priority,
                        due_date=new_due,
                        quadrant=new_quadrant,
                        progress_current=edit_progress_current,
                        progress_target=resolved_edit_target,
                        progress_unit=resolved_edit_unit,
                        auto_done_when_target_reached=resolved_edit_auto,
                        completion_criteria_md=resolved_criteria,
                        recurrence=new_recurrence,
                        email_reminder=new_reminder,
                    )
                    st.success("Aktualisiert.")
                    st.rerun()

            action_cols = st.columns(2)
            with action_cols[0]:
                _render_delete_confirmation(todo, key_prefix=f"list_delete_{todo.id}")

            if action_cols[1].button(
                "Duplizieren",
                key=f"list_duplicate_{todo.id}",
                help="Aufgabe kopieren",
            ):
                duplicate_todo(todo.id)
                st.success("Aufgabe dupliziert.")
                st.rerun()


def render_task_list_view(todos: list[TodoItem]) -> None:
    st.subheader("Aufgabenliste")
    st.caption("Gruppiert nach Kategorie mit Priorität, Fälligkeit und Erstellungsdatum.")

    st.markdown(
        """
        <style>
            .task-list-container [data-testid="stVerticalBlockBorderWrapper"] {
                margin-bottom: 0.45rem;
                padding: 0.6rem 0.8rem;
            }

            .task-list-container .task-list-row {
                display: flex;
                align-items: center;
                gap: 0.6rem;
            }

            .task-list-container .task-priority {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 2.5rem;
                padding: 0.2rem 0.5rem;
                border-radius: 0.5rem;
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid var(--gerris-border, #1f4a42);
                font-weight: 700;
            }

            .task-list-container .task-due,
            .task-list-container .task-quadrant {
                font-weight: 600;
            }

            .task-list-container [data-testid="stExpander"] {
                margin-top: 0.25rem;
            }

            .task-list-container [data-testid="stExpander"] > details {
                padding: 0.35rem 0.65rem;
            }

            .task-list-container [data-testid="stExpander"] summary {
                padding: 0.2rem 0.4rem;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )

    filter_columns = st.columns(3)
    with filter_columns[0]:
        show_done = st.checkbox(
            "Erledigte anzeigen",
            value=st.session_state.get(FILTER_SHOW_DONE_KEY, True),
            key=FILTER_SHOW_DONE_KEY,
        )

    with filter_columns[1]:
        default_categories = st.session_state.get(FILTER_SELECTED_CATEGORIES_KEY) or list(Category)
        selected_categories = st.multiselect(
            "Kategorien",
            options=list(Category),
            default=default_categories,
            format_func=lambda option: option.label,
            key=FILTER_SELECTED_CATEGORIES_KEY,
        )
        if not selected_categories:
            selected_categories = list(Category)

    with filter_columns[2]:
        sort_labels: dict[SortOverride, str] = {
            "priority": "Priorität, dann Fälligkeit",
            "due_date": "Fälligkeitsdatum zuerst",
            "created_at": "Erstellungsdatum zuerst",
        }
        current_sort_value = st.session_state.get(FILTER_SORT_OVERRIDE_KEY, "priority")
        current_sort: SortOverride = current_sort_value if current_sort_value in sort_labels else "priority"  # type: ignore[assignment]
        sort_override: SortOverride = st.selectbox(
            "Sortierung",
            options=list(sort_labels.keys()),
            format_func=lambda key: sort_labels[key],
            index=list(sort_labels.keys()).index(current_sort),
            key=FILTER_SORT_OVERRIDE_KEY,
        )

    visible_todos = [
        todo for todo in todos if (show_done or not todo.completed) and todo.category in selected_categories
    ]

    if not visible_todos:
        st.info("Keine passenden Aufgaben gefunden")
        return

    task_list_container = st.container()
    with task_list_container:
        st.markdown('<div class="task-list-container">', unsafe_allow_html=True)
        for category in Category:
            if category not in selected_categories:
                continue

            category_todos = [todo for todo in visible_todos if todo.category is category]
            if not category_todos:
                st.caption(f"Keine Aufgaben in {category.label}")
                continue

            st.markdown(f"### {category.label}")
            for todo in sorted(category_todos, key=lambda item: _task_sort_key(item, sort_override)):
                render_task_row(todo, parent=task_list_container)
        st.markdown("</div>", unsafe_allow_html=True)


def _ensure_settings_defaults(*, client: Optional[OpenAI], stats: KpiStats) -> dict[str, Any]:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    if not isinstance(settings, dict):
        settings = {}

    settings.setdefault(AI_ENABLED_KEY, bool(client))
    settings.setdefault(SHOW_STORAGE_NOTICE_KEY, False)
    settings.setdefault("goal_daily", stats.goal_daily)
    settings.setdefault("gamification_mode", GamificationMode.POINTS.value)
    settings["category_goals"] = _sanitize_category_goals(settings)
    settings["goal_profile"] = _sanitize_goal_profile(settings)

    st.session_state[SS_SETTINGS] = settings
    return settings


def _panel_section(panel: Any, label: str) -> Any:
    expander = getattr(panel, "expander", None)
    if callable(expander):
        return expander(label)
    return nullcontext()


def render_settings_panel(stats: KpiStats, client: Optional[OpenAI], *, panel: Any | None = None) -> bool:
    panel = panel or st
    panel.header("Ziele & Einstellungen")

    settings = _ensure_settings_defaults(client=client, stats=stats)
    ai_enabled = bool(settings.get(AI_ENABLED_KEY, bool(client)))
    goal_profile: GoalProfile = settings.get("goal_profile", _default_goal_profile())
    panel.info("Steuere den KI-Schalter jetzt in der Sidebar über dem Sprachen-Toggle.")

    if not st.session_state.get(GOAL_CREATION_VISIBLE_KEY, False):
        profile_title = goal_profile.get("title") or translate_text(("Neues Ziel", "New goal"))
        horizon_label = _goal_option_label(goal_profile.get("horizon", "30_days"), GOAL_HORIZON_OPTIONS)
        cadence_label = _goal_option_label(goal_profile.get("check_in_cadence", "weekly"), GOAL_CHECKIN_OPTIONS)
        panel.caption("Starte die Zielkonfiguration über den Button.")
        panel.info(f"{profile_title} · {horizon_label} · {translate_text(('Check-in: ', 'Check-in: '))}{cadence_label}")
        if panel.button("Ziel erstellen", type="primary"):
            st.session_state[GOAL_CREATION_VISIBLE_KEY] = True
            st.rerun()
        return ai_enabled

    panel.markdown("### Ziel-Canvas")
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
        )
        focus_categories = panel.multiselect(
            "Fokus-Kategorien",
            options=list(Category),
            default=[category for category in Category if category.value in goal_profile.get("focus_categories", [])],
            format_func=lambda option: option.label,
            help="Welche Lebensbereiche zahlt das Ziel ein?",
        )
        horizon = panel.selectbox(
            "Zeithorizont",
            options=horizon_options,
            index=max(0, horizon_index),
            format_func=lambda value: _goal_option_label(value, GOAL_HORIZON_OPTIONS),
            help="Wähle deinen Planungszeitraum",
        )
        start_date = panel.date_input(
            "Startdatum",
            value=goal_profile.get("start_date"),
            format="YYYY-MM-DD",
            help="Optional: Ab wann zählst du Fortschritt?",
        )
        target_date = panel.date_input(
            "Zieltermin",
            value=goal_profile.get("target_date"),
            format="YYYY-MM-DD",
            help="Wann soll das Ziel erreicht sein?",
        )
        check_in_cadence = panel.selectbox(
            "Check-in-Rhythmus",
            options=cadence_options,
            index=max(0, cadence_index),
            format_func=lambda value: _goal_option_label(value, GOAL_CHECKIN_OPTIONS),
            help="Wie oft reflektierst du Fortschritt?",
        )
    with canvas_columns[1]:
        enable_metric = panel.toggle(
            "Messbar machen",
            value=bool(goal_profile.get("metric_target") is not None or goal_profile.get("metric_unit")),
            help="Zielwert + Einheit pflegen, um Fortschritt klar messbar zu halten.",
        )
        metric_target = panel.number_input(
            "Zielwert",
            min_value=0.0,
            value=float(goal_profile.get("metric_target") or 0.0),
            step=0.5,
            disabled=not enable_metric,
            help="Numerischer Zielwert, z. B. 3.0 oder 10.0",
        )
        metric_unit = panel.text_input(
            "Einheit",
            value=goal_profile.get("metric_unit", ""),
            max_chars=40,
            disabled=not enable_metric,
            help="Einheit für den Zielwert, z. B. Bewerbungen, Minuten.",
        )
        next_step_tabs = panel.tabs(["Nächster Schritt", "Vorschau"])
        with next_step_tabs[0]:
            next_step_md = st.text_area(
                "Konkreter erster Schritt",
                value=goal_profile.get("next_step_md", ""),
                placeholder="Nächster kalendarischer Schritt oder Termin",
            )
        with next_step_tabs[1]:
            next_step_preview = goal_profile.get("next_step_md", "")
            if next_step_preview.strip():
                st.markdown(next_step_preview)
            else:
                st.caption("Noch kein nächster Schritt hinterlegt")
        celebration_tabs = panel.tabs(["Erfolg feiern", "Vorschau"])
        with celebration_tabs[0]:
            celebration_md = st.text_area(
                "Belohnung planen",
                value=goal_profile.get("celebration_md", ""),
                placeholder="Wie feierst du den Abschluss?",
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
        criteria_tabs = panel.tabs(["Erfolgskriterien", "Vorschau"])
        with criteria_tabs[0]:
            success_criteria_md = st.text_area(
                "Wie erkennst du Erfolg?",
                value=goal_profile.get("success_criteria_md", ""),
                placeholder="z. B. 2 Bewerbungen pro Woche mit Feedback",
            )
        with criteria_tabs[1]:
            criteria_preview = goal_profile.get("success_criteria_md", "")
            if criteria_preview.strip():
                st.markdown(criteria_preview)
            else:
                st.caption("Noch keine Kriterien definiert")
        risk_tabs = panel.tabs(["Risiken & Sicherungen", "Vorschau"])
        with risk_tabs[0]:
            risk_mitigation_md = st.text_area(
                "Risiken & Sicherungen",
                value=goal_profile.get("risk_mitigation_md", ""),
                placeholder="Hindernisse, Plan B, Accountability",
            )
        with risk_tabs[1]:
            risk_preview = goal_profile.get("risk_mitigation_md", "")
            if risk_preview.strip():
                st.markdown(risk_preview)
            else:
                st.caption("Noch keine Risiken notiert")
    with success_columns[1]:
        motivation_tabs = panel.tabs(["Motivation", "Vorschau"])
        with motivation_tabs[0]:
            motivation_md = st.text_area(
                "Warum ist das Ziel wichtig?",
                value=goal_profile.get("motivation_md", ""),
                placeholder="Persönlicher Nutzen, Chancen, Unterstützung",
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
        "Zielprofil speichern",
        key="settings_save_goal_profile",
        help="Sichert Titel, Kriterien, Motivation und Check-ins.",
    )
    if profile_saved:
        panel.success("Zielprofil aktualisiert")

    with _panel_section(panel, "Kategorienziele"):
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
                    key=f"goal_{category.value}",
                    help="Tagesziel für diese Kategorie",
                )
                category_goals[category.value] = int(goal_value)

        settings["category_goals"] = _sanitize_category_goals(settings)
        settings["category_goals"].update(category_goals)

    st.session_state[SS_SETTINGS] = settings
    persist_state()
    return ai_enabled


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


def render_goal_completion_logger(todos: list[TodoItem]) -> None:
    st.subheader("Aktivität abhaken / Log activity")

    open_todos = [todo for todo in todos if not todo.completed]
    if not open_todos:
        st.info(
            translate_text(
                (
                    "Alle Aufgaben sind bereits erledigt – großartig!",
                    "All tasks are done already — great job!",
                )
            )
        )
        return

    option_lookup = {todo.id: f"{todo.title} · {todo.category.label} · {todo.quadrant.label}" for todo in open_todos}

    selected_todo_id = st.selectbox(
        "Welche Aufgabe ist erledigt? / Which task is done?",
        options=list(option_lookup),
        format_func=lambda value: option_lookup.get(value, value),
        help=translate_text(
            (
                "Wähle eine offene Aufgabe aus, die du abschließen möchtest.",
                "Pick one of your open tasks to complete it.",
            )
        ),
    )

    if st.button(
        "Gelöst / Completed",
        type="primary",
        help=translate_text(
            (
                "Dokumentiert den Abschluss, aktualisiert KPI-Dashboard, Tachometer und Gamification.",
                "Logs the completion and refreshes the KPI dashboard, gauges, and gamification.",
            )
        ),
    ):
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

        previous_state = _gamification_snapshot()
        updated = toggle_complete(target.id)
        if updated and updated.completed:
            _handle_completion_success(updated, previous_state=previous_state)
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


def _render_goal_overview_settings(*, settings: dict[str, Any], todos: Sequence[TodoItem]) -> list[str]:
    with st.expander("Einstellungen", expanded=False):
        st.caption(
            translate_text(
                (
                    "Passe die Tachometer nach Wunsch an: Anzahl KPIs, Auswahl und Einrichtung einzelner Kennzahlen sowie Farbe oder Darstellungsart.",
                    "Customize the gauges to your liking: number of KPIs, selection and setup of individual metrics, plus color or visualization style.",
                )
            )
        )
        if not todos:
            st.info("Keine Aufgaben vorhanden.")
            return []

        option_lookup = {
            todo.id: f"{todo.title} · {translate_text(todo.category.label)} · "
            f"{translate_text(('Status: offen', 'Status: open')) if not todo.completed else translate_text(('Status: erledigt', 'Status: done'))}"
            for todo in todos
        }
        previous_selection = _sanitize_goal_overview_tasks(settings.get(GOAL_OVERVIEW_SELECTED_TASKS_KEY, []), todos)
        default_selection = previous_selection or list(option_lookup)

        selection = st.multiselect(
            "Aufgaben für das Dashboard",
            options=list(option_lookup),
            default=default_selection,
            format_func=lambda value: option_lookup.get(value, value),
            help=translate_text(
                (
                    "Setze ein Häkchen bei den Aufgaben, die in KPI-Zielen und Kategorien berücksichtigt werden sollen.",
                    "Check the tasks that should count toward KPI goals and category gauges.",
                )
            ),
        )
        sanitized_selection = _sanitize_goal_overview_tasks(selection, todos)
        if sanitized_selection != previous_selection:
            settings[GOAL_OVERVIEW_SELECTED_TASKS_KEY] = sanitized_selection
            st.session_state[SS_SETTINGS] = settings
            persist_state()

        return sanitized_selection


def render_goal_overview(
    todos: list[TodoItem], *, stats: KpiStats, category_goals: Mapping[str, int], settings: dict[str, Any]
) -> tuple[bool, bool]:
    st.subheader("Ziele im Überblick")
    overview_columns = st.columns([1, 1, 1, 1, 1, 0.8])

    with overview_columns[-1]:
        st.markdown("**Visualisierungen**")
        show_kpi_dashboard = st.checkbox(
            "KPI-Dashboard anzeigen",
            value=st.session_state.get(GOAL_OVERVIEW_SHOW_KPI_KEY, True),
            key=GOAL_OVERVIEW_SHOW_KPI_KEY,
            help="Steuerung für die Kennzahlen-Übersicht.",
        )
        show_category_trends = st.checkbox(
            "Kategorie-Trends anzeigen",
            value=st.session_state.get(GOAL_OVERVIEW_SHOW_CATEGORY_KEY, True),
            key=GOAL_OVERVIEW_SHOW_CATEGORY_KEY,
            help=("Blendet die Detailvisualisierungen zu den Kategorien ein."),
        )
        selected_task_ids = _render_goal_overview_settings(settings=settings, todos=todos)

    filtered_todos = _filter_goal_overview_todos(todos, selected_task_ids)
    snapshots = aggregate_category_kpis(
        filtered_todos,
        category_goals=category_goals,
        fallback_streak=stats.streak,
    )

    for category_index, category in enumerate(Category):
        snapshot = snapshots[category]
        with overview_columns[category_index]:
            st.plotly_chart(
                _build_category_gauge(snapshot),
                width="stretch",
                config={"displaylogo": False, "responsive": True},
            )

    return show_kpi_dashboard, show_category_trends


def render_category_dashboard(todos: list[TodoItem], *, stats: KpiStats, category_goals: Mapping[str, int]) -> None:
    st.subheader("Kategorie-Überblick")
    snapshots = aggregate_category_kpis(
        todos,
        category_goals=category_goals,
        fallback_streak=stats.streak,
    )
    card_columns = st.columns(len(Category))

    for category, column in zip(Category, card_columns):
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
    st.plotly_chart(
        build_category_weekly_completion_figure(weekly_data),
        width="stretch",
        config={"displaylogo": False, "responsive": True},
    )


def render_shared_calendar() -> None:
    st.subheader("Gemeinsamer Kalender / Shared calendar")
    st.caption("2025 von Carla, Miri & Gerrit · Google Kalender — 2025 by Carla, Miri & Gerrit · Google Calendar")
    calendar_iframe = """
    <iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Europe%2FAmsterdam&showPrint=0&src=e2a52f862c8088c82d9f74825b8c39f6069965fdc652472fbf5ec28e891c077e%40group.calendar.google.com&color=%23616161" style="border:solid 1px #777" width="800" height="600" frameborder="0" scrolling="no"></iframe>
    """
    st.markdown(calendar_iframe, unsafe_allow_html=True)


def render_todo_section(
    ai_enabled: bool,
    client: Optional[OpenAI],
    *,
    todos: Optional[list[TodoItem]] = None,
    stats: Optional[KpiStats] = None,
) -> None:
    template_state_key = "_todo_template_last_applied"
    todos = todos or get_todos()
    quadrant_options = list(EisenhowerQuadrant)

    st.subheader("ToDo hinzufügen")

    if st.session_state.pop(NEW_TODO_RESET_TRIGGER_KEY, False):
        for cleanup_key in (
            NEW_TODO_TITLE_KEY,
            NEW_TODO_DUE_KEY,
            NEW_TODO_QUADRANT_KEY,
            NEW_TODO_QUADRANT_PREFILL_KEY,
            AI_QUADRANT_RATIONALE_KEY,
            NEW_TODO_CATEGORY_KEY,
            NEW_TODO_PRIORITY_KEY,
            NEW_TODO_DESCRIPTION_KEY,
            NEW_TODO_PROGRESS_TARGET_KEY,
            NEW_TODO_PROGRESS_UNIT_KEY,
            NEW_TODO_PROGRESS_CURRENT_KEY,
            NEW_TODO_AUTO_COMPLETE_KEY,
            NEW_TODO_COMPLETION_CRITERIA_KEY,
            NEW_TODO_ENABLE_TARGET_KEY,
            NEW_TODO_RECURRENCE_KEY,
            NEW_TODO_REMINDER_KEY,
            NEW_TODO_DRAFT_MILESTONES_KEY,
            NEW_TODO_TEMPLATE_KEY,
            template_state_key,
            NEW_MILESTONE_TITLE_KEY,
            NEW_MILESTONE_COMPLEXITY_KEY,
            NEW_MILESTONE_POINTS_KEY,
            NEW_MILESTONE_NOTE_KEY,
        ):
            st.session_state.pop(cleanup_key, None)
        st.session_state.pop(NEW_MILESTONE_SUGGESTIONS_KEY, None)

    prefilled_quadrant = st.session_state.pop(
        NEW_TODO_QUADRANT_PREFILL_KEY,
        st.session_state.get(NEW_TODO_QUADRANT_KEY, EisenhowerQuadrant.URGENT_IMPORTANT),
    )

    st.session_state.setdefault(NEW_TODO_TITLE_KEY, "")
    st.session_state.setdefault(NEW_TODO_DUE_KEY, None)
    st.session_state[NEW_TODO_QUADRANT_KEY] = prefilled_quadrant
    st.session_state.setdefault(NEW_TODO_CATEGORY_KEY, Category.DAILY_STRUCTURE)
    st.session_state.setdefault(NEW_TODO_PRIORITY_KEY, 3)
    st.session_state.setdefault(NEW_TODO_DESCRIPTION_KEY, "")
    st.session_state.setdefault(NEW_TODO_PROGRESS_TARGET_KEY, 0.0)
    st.session_state.setdefault(NEW_TODO_PROGRESS_UNIT_KEY, "")
    st.session_state.setdefault(NEW_TODO_PROGRESS_CURRENT_KEY, 0.0)
    st.session_state.setdefault(NEW_TODO_AUTO_COMPLETE_KEY, True)
    st.session_state.setdefault(NEW_TODO_COMPLETION_CRITERIA_KEY, "")
    st.session_state.setdefault(NEW_TODO_ENABLE_TARGET_KEY, False)
    st.session_state.setdefault(NEW_TODO_RECURRENCE_KEY, RecurrencePattern.ONCE)
    st.session_state.setdefault(NEW_TODO_REMINDER_KEY, EmailReminderOffset.NONE)
    st.session_state.setdefault(NEW_TODO_DRAFT_MILESTONES_KEY, [])
    st.session_state.setdefault(NEW_MILESTONE_SUGGESTIONS_KEY, {})
    st.session_state.setdefault(NEW_TODO_TEMPLATE_KEY, "free")
    st.session_state.setdefault(template_state_key, "free")

    with st.form("add_todo_form", clear_on_submit=False):
        today = date.today()
        templates = _todo_templates(today=today)
        template_lookup = {template.key: template for template in templates}

        title_column, milestone_column, meta_column = st.columns(3)

        with title_column:
            template_key = st.selectbox(
                "Titel-Vorschlag / Task suggestion",
                options=[template.key for template in templates],
                key=NEW_TODO_TEMPLATE_KEY,
                format_func=lambda option: template_lookup[option].label,
                help=("Übernimmt Fälligkeit, Priorität, Erinnerung und optionale Zeitziele automatisch"),
            )

            selected_template = template_lookup[template_key]
            if template_key != st.session_state.get(template_state_key):
                _apply_task_template(selected_template)

            if selected_template.description:
                st.caption(f"📌 {selected_template.description}")

            title = st.text_input(
                "Titel / Title",
                key=NEW_TODO_TITLE_KEY,
                placeholder="Nächstes ToDo eingeben / Enter next task",
            )

            due_date: Optional[date] = st.date_input(
                "Fälligkeitsdatum / Due date",
                value=st.session_state.get(NEW_TODO_DUE_KEY),
                key=NEW_TODO_DUE_KEY,
                format="YYYY-MM-DD",
            )

            recurrence = st.selectbox(
                "Wiederholung / Recurrence",
                options=list(RecurrencePattern),
                key=NEW_TODO_RECURRENCE_KEY,
                format_func=lambda option: option.label,
                help="Einmalig, werktags oder feste Intervalle",
            )

            reminder = st.selectbox(
                "E-Mail-Erinnerung / Email reminder",
                options=list(EmailReminderOffset),
                key=NEW_TODO_REMINDER_KEY,
                format_func=lambda option: option.label,
                help="Optionale Mail-Erinnerung vor Fälligkeit",
            )

        with milestone_column:
            st.markdown("##### Unterziele / Milestones")
            draft_milestones: list[dict[str, object]] = st.session_state.get(NEW_TODO_DRAFT_MILESTONES_KEY, [])
            suggestion_store: dict[str, list[dict[str, str]]] = st.session_state.get(NEW_MILESTONE_SUGGESTIONS_KEY, {})
            milestone_title = st.text_input(
                "Titel des Meilensteins / Milestone title",
                key=NEW_MILESTONE_TITLE_KEY,
                placeholder="z. B. Konzept fertigstellen / e.g., finish concept",
            )
            milestone_complexity = st.selectbox(
                "Aufwand / Effort",
                options=list(MilestoneComplexity),
                key=NEW_MILESTONE_COMPLEXITY_KEY,
                format_func=lambda option: option.label,
            )
            suggested_points = _points_for_complexity(milestone_complexity)
            milestone_points = st.number_input(
                "Punkte / Points",
                min_value=0,
                value=int(st.session_state.get(NEW_MILESTONE_POINTS_KEY, suggested_points)),
                step=1,
                key=NEW_MILESTONE_POINTS_KEY,
                help=f"Empfehlung anhand Aufwand: {suggested_points}",
            )
            milestone_note = st.text_area(
                "Notiz (optional) / Note (optional)",
                key=NEW_MILESTONE_NOTE_KEY,
                placeholder="Kurze Beschreibung oder DoD / Short description or DoD",
            )
            add_milestone_draft = st.form_submit_button(
                "Meilenstein vormerken / Queue milestone",
                help="Unterziel für diese Aufgabe vormerken",
            )

            generate_suggestions = st.form_submit_button(
                "AI: Meilensteine vorschlagen / Suggest milestones",
                disabled=not ai_enabled,
                help="Erzeuge Vorschläge für Unterziele",
            )

            suggestion_candidates = [
                MilestoneSuggestionItem.model_validate(item) for item in suggestion_store.get("draft", [])
            ]
            if generate_suggestions:
                milestone_suggestion: AISuggestion[MilestoneSuggestionList] = suggest_milestones(
                    title or "Aufgabe",
                    gamification_mode=_current_gamification_mode(),
                    client=client if ai_enabled else None,
                )
                suggestion_store["draft"] = [item.model_dump() for item in milestone_suggestion.payload.milestones]
                st.session_state[NEW_MILESTONE_SUGGESTIONS_KEY] = suggestion_store
                suggestion_candidates = milestone_suggestion.payload.milestones
                label = "KI-Vorschlag" if milestone_suggestion.from_ai else "Fallback"
                st.info(f"{label}: {len(suggestion_candidates)} Ideen bereit.")

            if add_milestone_draft:
                if not milestone_title.strip():
                    st.warning("Bitte Titel ergänzen")
                else:
                    draft_milestones.append(
                        {
                            "title": milestone_title.strip(),
                            "complexity": milestone_complexity.value,
                            "points": int(milestone_points),
                            "note": milestone_note.strip(),
                        }
                    )
                    st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = draft_milestones
                    st.success("Meilenstein vorgemerkt")
                    st.rerun()

            if suggestion_candidates:
                st.markdown("###### Vorschläge übernehmen / Apply suggestions")
                for idx, candidate in enumerate(suggestion_candidates):
                    complexity = MilestoneComplexity(candidate.complexity)
                    default_points = _points_for_complexity(complexity)
                    st.caption(f"{candidate.title} · {complexity.label} · ~{default_points} Punkte")
                    if st.form_submit_button(
                        f"Übernehmen #{idx + 1}",
                        key=f"apply_new_milestone_{idx}",
                    ):
                        draft_milestones.append(
                            {
                                "title": candidate.title,
                                "complexity": complexity.value,
                                "points": default_points,
                                "note": candidate.rationale,
                            }
                        )
                        st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = draft_milestones
                        st.success("Vorschlag übernommen")
                        st.rerun()

            if draft_milestones:
                st.markdown("###### Vorgemerkte Unterziele / Queued milestones")
                for index, entry in enumerate(draft_milestones):
                    complexity_label = MilestoneComplexity(entry.get("complexity", "medium")).label
                    st.caption(f"{entry.get('title')} · {complexity_label} · {entry.get('points', 0)} Punkte")
                    if entry.get("note"):
                        st.caption(entry["note"])
                    if st.form_submit_button(f"Entfernen #{index + 1}", key=f"remove_draft_{index}"):
                        draft_milestones.pop(index)
                        st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = draft_milestones
                        st.rerun()

        with meta_column:
            category = st.selectbox(
                "Kategorie / Category",
                options=list(Category),
                key=NEW_TODO_CATEGORY_KEY,
                format_func=lambda option: option.label,
            )

            quadrant = st.selectbox(
                "Eisenhower-Quadrant / Quadrant",
                quadrant_options,
                key=NEW_TODO_QUADRANT_KEY,
                format_func=lambda option: option.label,
            )

            priority = st.selectbox(
                "Priorität (1=hoch) / Priority (1=high)",
                options=list(range(1, 6)),
                key=NEW_TODO_PRIORITY_KEY,
            )

            st.markdown("#### Fortschritt / Progress")
            enable_target: bool = st.checkbox(
                "Zielvorgabe nutzen / Enable target",
                value=bool(st.session_state.get(NEW_TODO_ENABLE_TARGET_KEY, False)),
                key=NEW_TODO_ENABLE_TARGET_KEY,
                help="Optionaler Zielwert mit Einheit",
            )

            target_cols = st.columns([0.5, 0.5])
            with target_cols[0]:
                target_value = st.number_input(
                    "Zielwert / Target value",
                    min_value=0.0,
                    value=float(st.session_state.get(NEW_TODO_PROGRESS_TARGET_KEY, 0.0)),
                    step=1.0,
                    key=NEW_TODO_PROGRESS_TARGET_KEY,
                    disabled=not enable_target,
                    help="Numerisches Ziel, z. B. 10.0",
                )
            with target_cols[1]:
                progress_unit = st.text_input(
                    "Einheit / Unit",
                    value=st.session_state.get(NEW_TODO_PROGRESS_UNIT_KEY, ""),
                    key=NEW_TODO_PROGRESS_UNIT_KEY,
                    disabled=not enable_target,
                    help="z. B. km, Seiten, Minuten",
                )

            current_value = st.number_input(
                "Aktueller Stand / Current progress",
                min_value=0.0,
                value=float(st.session_state.get(NEW_TODO_PROGRESS_CURRENT_KEY, 0.0)),
                step=0.5,
                key=NEW_TODO_PROGRESS_CURRENT_KEY,
                help="Fortschritt in derselben Einheit wie das Ziel",
            )

            auto_complete = st.toggle(
                "Automatisch als erledigt markieren, wenn Ziel erreicht / Auto-complete when target reached",
                value=bool(
                    st.session_state.get(
                        NEW_TODO_AUTO_COMPLETE_KEY,
                        bool(st.session_state.get(NEW_TODO_ENABLE_TARGET_KEY, False)),
                    )
                ),
                key=NEW_TODO_AUTO_COMPLETE_KEY,
                disabled=not enable_target,
            )

            criteria_tabs = st.tabs(["Kriterien / Criteria", "Vorschau / Preview"])
            with criteria_tabs[0]:
                completion_criteria_md = st.text_area(
                    "Erfüllungskriterien (Markdown) / Completion criteria (Markdown)",
                    value=st.session_state.get(NEW_TODO_COMPLETION_CRITERIA_KEY, ""),
                    key=NEW_TODO_COMPLETION_CRITERIA_KEY,
                    placeholder="Optional: Wie erkennst du den Abschluss? / Optional: how will you mark completion?",
                    disabled=not enable_target,
                )
            with criteria_tabs[1]:
                criteria_preview = st.session_state.get(NEW_TODO_COMPLETION_CRITERIA_KEY, "")
                if enable_target and criteria_preview.strip():
                    st.markdown(criteria_preview)
                else:
                    st.caption("Keine Kriterien gepflegt")

        description_col, _ = st.columns([1, 1])
        with description_col:
            description_tabs = st.tabs(["Schreiben", "Vorschau"])
            with description_tabs[0]:
                description_md = st.text_area(
                    "Beschreibung (Markdown) / Description (Markdown)",
                    key=NEW_TODO_DESCRIPTION_KEY,
                    placeholder=("Optional: Details, Checkliste oder Kontext"),
                )
            with description_tabs[1]:
                preview_text = st.session_state.get(NEW_TODO_DESCRIPTION_KEY, "")
                if preview_text.strip():
                    st.markdown(preview_text)
                else:
                    st.caption("Keine Beschreibung vorhanden")

        action_cols = st.columns(2)
        with action_cols[0]:
            suggest_quadrant_clicked = st.form_submit_button(
                "AI: Quadrant vorschlagen",
                disabled=not ai_enabled,
                help="Nutze OpenAI fuer eine Auto-Kategorisierung",
            )
        with action_cols[1]:
            submitted = st.form_submit_button(
                "ToDo hinzufügen",
                type="primary",
            )

        if suggest_quadrant_clicked:
            if not title.strip():
                st.warning("Bitte Titel angeben")
            else:
                suggestion: AISuggestion[Any] = suggest_quadrant(title.strip(), client=client if ai_enabled else None)
                st.session_state[NEW_TODO_QUADRANT_PREFILL_KEY] = EisenhowerQuadrant(suggestion.payload.quadrant)
                st.session_state[AI_QUADRANT_RATIONALE_KEY] = suggestion.payload.rationale
                label = "KI-Vorschlag" if suggestion.from_ai else "Fallback"
                st.info(f"{label}: {suggestion.payload.rationale}")
                st.rerun()

        if submitted:
            if not title.strip():
                st.warning("Bitte Titel angeben")
            else:
                resolved_target = target_value if enable_target else None
                resolved_auto_complete = auto_complete if enable_target else False
                resolved_unit = progress_unit if enable_target else ""
                resolved_criteria = completion_criteria_md if enable_target else ""
                draft_models = [
                    Milestone(
                        title=entry.get("title", ""),
                        complexity=MilestoneComplexity(entry.get("complexity", "medium")),
                        points=int(
                            entry.get(
                                "points",
                                _points_for_complexity(MilestoneComplexity.MEDIUM),
                            )
                        ),
                        note=str(entry.get("note", "")),
                    )
                    for entry in st.session_state.get(NEW_TODO_DRAFT_MILESTONES_KEY, [])
                    if str(entry.get("title", "")).strip()
                ]
                if draft_models:
                    add_todo(
                        title=title.strip(),
                        quadrant=quadrant,
                        due_date=due_date,
                        category=category,
                        priority=priority,
                        description_md=description_md,
                        progress_current=current_value,
                        progress_target=resolved_target,
                        progress_unit=resolved_unit,
                        auto_done_when_target_reached=resolved_auto_complete,
                        completion_criteria_md=resolved_criteria,
                        milestones=draft_models,
                        recurrence=recurrence,
                        email_reminder=reminder,
                    )
                else:
                    add_todo(
                        title=title.strip(),
                        quadrant=quadrant,
                        due_date=due_date,
                        category=category,
                        priority=priority,
                        description_md=description_md,
                        progress_current=current_value,
                        progress_target=resolved_target,
                        progress_unit=resolved_unit,
                        auto_done_when_target_reached=resolved_auto_complete,
                        completion_criteria_md=resolved_criteria,
                        recurrence=recurrence,
                        email_reminder=reminder,
                    )
                st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = []
                suggestion_store["draft"] = []
                st.session_state[NEW_MILESTONE_SUGGESTIONS_KEY] = suggestion_store
                st.success("ToDo gespeichert")
                st.session_state[NEW_TODO_RESET_TRIGGER_KEY] = True
                st.rerun()

    rationale = st.session_state.get(AI_QUADRANT_RATIONALE_KEY)
    if rationale:
        st.caption("Begründung (übersteuerbar)")

    st.markdown("### Aufgabenansichten")
    list_tab, board_tab, calendar_tab = st.tabs(
        [
            "Liste",
            "Eisenhower-Board",
            "Kalender",
        ]
    )

    with list_tab:
        render_task_list_view(todos)

    with board_tab:
        st.subheader("Eisenhower-Matrix")
        grouped = group_by_quadrant(sort_todos(todos, by="due_date"))
        quadrant_columns = st.columns(4)
        for quadrant, column in zip(EisenhowerQuadrant, quadrant_columns):
            render_quadrant_board(column, quadrant, grouped.get(quadrant, []))

    with calendar_tab:
        render_calendar_view()


def _render_quadrant_focus_items(todos: list[TodoItem]) -> None:
    focus_quadrants = (
        EisenhowerQuadrant.URGENT_IMPORTANT,
        EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
    )
    st.markdown("#### Fokusaufgaben")
    st.caption("Prüfe die wichtigsten Aufgaben aus den Aufgabenansichten und ihre Unterziele.")

    focus_columns = st.columns(2)
    for quadrant, column in zip(focus_quadrants, focus_columns):
        with column:
            st.markdown(f"**{quadrant.label}**")
            open_items = [
                todo for todo in sort_todos(todos, by="due_date") if todo.quadrant == quadrant and not todo.completed
            ]

            if not open_items:
                st.caption(
                    "Keine offenen Aufgaben",
                )
                continue

            for todo in open_items:
                with st.container(border=True):
                    st.markdown(f"**{todo.title}**")
                    st.caption(f"{translate_text(('Kategorie', 'Category'))}: {todo.category.label}")
                    due_label = translate_text(("Fällig", "Due"))
                    st.caption(
                        f"{due_label}: {todo.due_date.date().isoformat() if todo.due_date else translate_text(('Kein Datum', 'No date'))}"
                    )

                    if todo.milestones:
                        st.caption("Unterziele")
                        for milestone in todo.milestones:
                            milestone_note = f" — {milestone.note}" if milestone.note.strip() else ""
                            points_label = translate_text(("Punkte", "points"))
                            st.markdown(
                                f"- {milestone.title} ({milestone.status.label}, {points_label}: {milestone.points})"
                                f"{milestone_note}"
                            )


def render_kpi_dashboard(stats: KpiStats, *, todos: list[TodoItem]) -> None:
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

    _render_quadrant_focus_items(todos)

    st.caption("Wochenübersicht der Abschlüsse")
    weekly_data = get_weekly_completion_counts(stats)
    weekly_chart = build_weekly_completion_figure(weekly_data)
    st.plotly_chart(
        weekly_chart,
        width="stretch",
        config={"displaylogo": False, "responsive": True},
    )

    st.info(
        translate_text(
            (
                "Passe Kategorien und KI-Optionen im Bereich 'Ziele' an.",
                "Adjust categories and AI options in the 'Goals' area.",
            )
        )
    )


GOALS_PAGE_LABEL = "Ziele"
TASKS_PAGE_LABEL = "Aufgaben"
JOURNAL_PAGE_LABEL = "Tagebuch"


def render_language_toggle() -> LanguageCode:
    return get_language()


def render_ai_toggle_sidebar(settings: dict[str, Any], *, client: Optional[OpenAI]) -> bool:
    ai_enabled = st.sidebar.toggle(
        "AI aktiv",
        key=AI_ENABLED_KEY,
        value=bool(settings.get(AI_ENABLED_KEY, bool(client))),
        help=("Aktiviere KI-gestützte Vorschläge. Ohne Schlüssel werden Fallback-Texte genutzt"),
    )
    settings[AI_ENABLED_KEY] = ai_enabled
    st.session_state[SS_SETTINGS] = settings
    persist_state()
    return ai_enabled


def render_navigation() -> str:
    st.sidebar.title("Navigation")
    navigation_options = [GOALS_PAGE_LABEL, TASKS_PAGE_LABEL, JOURNAL_PAGE_LABEL]
    selection = st.sidebar.radio(
        "Bereich wählen",
        navigation_options,
        index=navigation_options.index(GOALS_PAGE_LABEL),
        label_visibility="collapsed",
    )
    st.sidebar.divider()
    return selection


def render_sidebar_sections(
    stats: KpiStats,
    *,
    ai_enabled: bool,
    client: Optional[OpenAI],
    settings: Mapping[str, Any],
) -> bool:
    gamification_panel = st.sidebar.expander("Gamification", expanded=True)
    with gamification_panel:
        render_gamification_panel(
            stats,
            ai_enabled=ai_enabled,
            client=client,
            panel=gamification_panel,
            allow_mode_selection=True,
        )

    safety_panel = st.sidebar.expander("Sicherheit & Daten", expanded=False)
    with safety_panel:
        show_storage_notice = render_safety_panel(panel=safety_panel)

    st.sidebar.divider()
    return (
        show_storage_notice if show_storage_notice is not None else bool(settings.get(SHOW_STORAGE_NOTICE_KEY, False))
    )


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
            help=("Wähle Punkte, Abzeichen oder die motivierende Avatar-Option"),
        )

        if selected_mode is not gamification_mode:
            gamification_mode = selected_mode
            settings["gamification_mode"] = selected_mode.value
            st.session_state[SS_SETTINGS] = settings
            persist_state()

        panel.caption(gamification_mode.label)
    else:
        panel.caption(gamification_mode.label)

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


def render_safety_panel(panel: Any) -> bool:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    panel.info(
        "Optionale lokale Persistenz speichert Daten in .data/gerris_state.json; "
        "auf Streamlit Community Cloud können Dateien nach einem Neustart verschwinden."
    )
    panel.warning(
        "Dieses Tool ersetzt keine Krisenhilfe oder Diagnosen. Bei akuten Notfällen wende dich an lokale Hotlines."
    )
    show_storage_notice = panel.toggle(
        "Speicherhinweis anzeigen",
        value=bool(settings.get(SHOW_STORAGE_NOTICE_KEY, False)),
        help=("Blendet den Hinweis zum aktuellen Speicherpfad oberhalb des Titels ein oder aus"),
    )
    settings[SHOW_STORAGE_NOTICE_KEY] = show_storage_notice

    if panel.button(
        "Session zurücksetzen",
        key="reset_session_btn",
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


def render_quadrant_board(
    container: st.delta_generator.DeltaGenerator,
    quadrant: EisenhowerQuadrant,
    todos: list[TodoItem],
) -> None:
    with container:
        st.markdown(
            f"### {quadrant_badge(quadrant, include_full_label=True)}",
            unsafe_allow_html=True,
        )
        if not todos:
            st.caption("Keine Aufgaben in diesem Quadranten")
            return

        for todo in todos:
            render_todo_card(todo)


def render_todo_card(todo: TodoItem) -> None:
    with st.container(border=True):
        status = ("Erledigt", "Done") if todo.completed else ("Offen", "Open")
        due_text = todo.due_date.date().isoformat() if todo.due_date is not None else "—"
        quadrant_label = quadrant_badge(todo.quadrant, include_full_label=True)
        category_label = translate_text(todo.category.label)
        st.markdown(f"**{todo.title}**")
        st.caption(
            (
                f"Fällig: {due_text} · Quadrant: {quadrant_label} · Status: {status[0]}",
                f"Due: {due_text} · Quadrant: {quadrant_label} · Status: {status[1]}",
            ),
            unsafe_allow_html=True,
        )
        st.caption(
            (
                f"Kategorie: {category_label} · Priorität: {todo.priority}",
                f"Category: {category_label} · Priority: {todo.priority}",
            )
        )
        if todo.description_md:
            st.markdown(todo.description_md)

        action_cols = st.columns([1, 1, 1])
        if action_cols[0].button(
            "Erledigt umschalten",
            key=f"complete_{todo.id}",
            help="Markiere Aufgabe als erledigt oder offen",
        ):
            _toggle_todo_completion(todo)

        with action_cols[1]:
            quadrant_selection = st.selectbox(
                "Quadrant wechseln",
                options=list(EisenhowerQuadrant),
                format_func=lambda option: option.label,
                index=list(EisenhowerQuadrant).index(todo.quadrant),
                key=f"quadrant_{todo.id}",
            )
            if quadrant_selection != todo.quadrant:
                update_todo(todo.id, quadrant=quadrant_selection)
                st.success("Quadrant aktualisiert")
                st.rerun()

        with action_cols[2]:
            _render_delete_confirmation(todo, key_prefix=f"card_delete_{todo.id}")

        with st.expander("Bearbeiten"):
            with st.form(f"edit_form_{todo.id}"):
                new_title = st.text_input(
                    "Titel",
                    value=todo.title,
                    key=f"edit_title_{todo.id}",
                )
                new_due = st.date_input(
                    "Fälligkeitsdatum",
                    value=todo.due_date.date() if todo.due_date else None,
                    format="YYYY-MM-DD",
                    key=f"edit_due_{todo.id}",
                )
                new_quadrant = st.selectbox(
                    "Eisenhower-Quadrant",
                    options=list(EisenhowerQuadrant),
                    format_func=lambda option: option.label,
                    index=list(EisenhowerQuadrant).index(todo.quadrant),
                    key=f"edit_quadrant_{todo.id}",
                )
                new_category = st.selectbox(
                    "Kategorie",
                    options=list(Category),
                    format_func=lambda option: option.label,
                    index=list(Category).index(todo.category),
                    key=f"edit_category_{todo.id}",
                )
                new_priority = st.selectbox(
                    "Priorität (1=hoch)",
                    options=list(range(1, 6)),
                    index=list(range(1, 6)).index(todo.priority),
                    key=f"edit_priority_{todo.id}",
                )
                edit_tabs = st.tabs(["Schreiben", "Vorschau"])
                with edit_tabs[0]:
                    new_description = st.text_area(
                        "Beschreibung (Markdown)",
                        value=todo.description_md,
                        key=f"edit_description_{todo.id}",
                    )
                with edit_tabs[1]:
                    preview = st.session_state.get(f"edit_description_{todo.id}", "")
                    if preview.strip():
                        st.markdown(preview)
                    else:
                        st.caption("Keine Beschreibung vorhanden")
                submitted_edit = st.form_submit_button("Speichern")
                if submitted_edit:
                    update_todo(
                        todo.id,
                        title=new_title.strip(),
                        quadrant=new_quadrant,
                        due_date=new_due,
                        category=new_category,
                        priority=new_priority,
                        description_md=new_description,
                    )
                    st.success("Aktualisiert")
                    st.rerun()

            st.divider()
            _render_todo_kanban(todo)


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
    settings = _ensure_settings_defaults(client=client, stats=stats)
    ai_enabled = render_ai_toggle_sidebar(settings, client=client)
    render_language_toggle()
    selection = render_navigation()

    show_storage_notice = render_sidebar_sections(
        stats,
        ai_enabled=ai_enabled,
        client=client,
        settings=settings,
    )

    st.title("Gerris ErfolgsTracker")
    if show_storage_notice:
        _render_storage_notice(storage_backend, is_cloud=is_cloud)
    todos = get_todos()

    if not client:
        st.info(
            "Kein OPENAI_API_KEY gefunden. Vorschläge nutzen Fallbacks, bis ein Key in "
            "st.secrets oder der Umgebung hinterlegt ist."
        )

    if selection == translate_text(GOALS_PAGE_LABEL):
        settings = st.session_state.get(SS_SETTINGS, {})
        if not isinstance(settings, dict):
            settings = {}
        category_goals = _sanitize_category_goals(settings)
        render_goal_completion_logger(todos)
        show_kpi_dashboard, show_category_trends = render_goal_overview(
            todos,
            stats=stats,
            category_goals=category_goals,
            settings=settings,
        )

        if show_kpi_dashboard:
            render_kpi_dashboard(stats, todos=todos)

        if show_category_trends:
            render_category_dashboard(
                todos,
                stats=stats,
                category_goals=category_goals,
            )

        render_shared_calendar()

        settings_container = st.container()
        ai_enabled = render_settings_panel(stats, client, panel=settings_container)
    elif selection == translate_text(TASKS_PAGE_LABEL):
        st.header("Aufgaben")
        st.caption("Verwalte und plane deine Aufgaben. Ziele & KI konfigurierst du im Bereich 'Ziele'.")
        render_todo_section(ai_enabled=ai_enabled, client=client, todos=todos, stats=stats)
    else:
        render_journal_section(ai_enabled=ai_enabled, client=client, todos=todos)


if __name__ == "__main__":
    main()
