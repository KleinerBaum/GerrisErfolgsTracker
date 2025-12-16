from __future__ import annotations

import os
import json
from contextlib import nullcontext
from datetime import date, datetime
from typing import Any, Literal, Mapping, Optional

import plotly.graph_objects as go
import streamlit as st
from openai import OpenAI

from gerris_erfolgs_tracker.ai_features import (
    AISuggestion,
    generate_motivation,
    suggest_goals,
    suggest_milestones,
    suggest_quadrant,
)
from gerris_erfolgs_tracker.charts import (
    PRIMARY_COLOR,
    build_category_weekly_completion_figure,
    build_weekly_completion_figure,
)
from gerris_erfolgs_tracker.constants import (
    AI_ENABLED_KEY,
    AI_GOAL_SUGGESTION_KEY,
    AI_MOTIVATION_KEY,
    AI_QUADRANT_RATIONALE_KEY,
    AVATAR_PROMPT_INDEX_KEY,
    FILTER_SELECTED_CATEGORIES_KEY,
    FILTER_SHOW_DONE_KEY,
    FILTER_SORT_OVERRIDE_KEY,
    GOAL_SUGGESTED_VALUE_KEY,
    NEW_TODO_CATEGORY_KEY,
    NEW_TODO_DESCRIPTION_KEY,
    NEW_TODO_DUE_KEY,
    NEW_TODO_ENABLE_TARGET_KEY,
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
    calculate_progress_to_next_level,
    get_gamification_state,
    next_avatar_prompt,
    update_gamification_on_completion,
)
from gerris_erfolgs_tracker.kpis import (
    get_kpi_stats,
    get_weekly_completion_counts,
    update_goal_daily,
    update_kpis_on_completion,
)
from gerris_erfolgs_tracker.kpi import (
    CategoryKpi,
    aggregate_category_kpis,
    last_7_days_completions_by_category,
)
from gerris_erfolgs_tracker.journal import (
    ensure_journal_state,
    get_journal_entries,
    journal_gratitude_suggestions,
    upsert_journal_entry,
)
from gerris_erfolgs_tracker.llm_schemas import MilestoneSuggestionItem, MilestoneSuggestionList
from gerris_erfolgs_tracker.i18n import (
    LANGUAGE_OPTIONS,
    LanguageCode,
    get_language,
    localize_streamlit,
    set_language,
    translate_text,
)
from gerris_erfolgs_tracker.llm import get_openai_client
from gerris_erfolgs_tracker.models import (
    Category,
    EmailReminderOffset,
    GamificationMode,
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


def _current_gamification_mode() -> GamificationMode:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    try:
        return GamificationMode(settings.get("gamification_mode", GamificationMode.POINTS.value))
    except ValueError:
        return GamificationMode.POINTS


def _render_delete_confirmation(todo: TodoItem, *, key_prefix: str) -> None:
    pending_key = f"{PENDING_DELETE_TODO_KEY}_{todo.id}"
    delete_label = "Löschen / Delete"
    confirm_label = "Ja, endgültig löschen / Yes, delete permanently"
    cancel_label = "Abbrechen / Cancel"
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
            st.success("Aufgabe gelöscht / Task deleted.")
            st.rerun()

        if confirm_cols[1].button(cancel_label, key=f"{key_prefix}_cancel_{todo.id}"):
            st.session_state.pop(pending_key, None)
            st.info("Löschen abgebrochen / Delete cancelled.")
            st.rerun()
        return

    if st.button(
        delete_label,
        key=f"{key_prefix}_delete_{todo.id}",
        help="Aufgabe entfernen / Delete task",
    ):
        st.session_state[pending_key] = True
        st.rerun()


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


SortOverride = Literal["priority", "due_date", "created_at"]
JOURNAL_ACTIVE_DATE_KEY = "journal_active_date"
JOURNAL_FORM_SEED_KEY = "journal_form_seed"
JOURNAL_FIELD_PREFIX = "journal_field_"
GOAL_CREATION_VISIBLE_KEY = "goal_creation_visible"
GOAL_OVERVIEW_SHOW_KPI_KEY = "goal_overview_show_kpi"
GOAL_OVERVIEW_SHOW_CATEGORY_KEY = "goal_overview_show_category"
MOOD_PRESETS: tuple[str, ...] = (
    "ruhig / calm",
    "dankbar / grateful",
    "hoffnungsvoll / hopeful",
    "energievoll / energised",
    "gestresst / stressed",
    "überfordert / overwhelmed",
    "fokussiert / focused",
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

    gratitudes = entry.gratitudes or [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3]
    cleaned_gratitudes = [value for value in gratitudes if value.strip()]
    st.session_state[_journal_field_key("gratitudes")] = cleaned_gratitudes
    for index, value in enumerate(cleaned_gratitudes):
        st.session_state[f"journal_gratitude_{index}"] = value


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
        lines.append(f"**Stimmung / Mood:** {moods}")
        if entry.mood_notes.strip():
            lines.append(entry.mood_notes.strip())
        lines.append("")
        lines.append("**Auslöser & Reaktionen / Triggers & reactions**")
        lines.append(entry.triggers_and_reactions or "—")
        lines.append("")
        lines.append("**Gedanken-Challenge / Thought challenge**")
        lines.append(f"- Automatischer Gedanke / Automatic thought: {entry.negative_thought or '—'}")
        lines.append(f"- Reframing / Reframe: {entry.rational_response or '—'}")
        lines.append("")
        lines.append("**Selbstfürsorge / Self-care**")
        lines.append(f"- Heute / Today: {entry.self_care_today or '—'}")
        lines.append(f"- Morgen / Tomorrow: {entry.self_care_tomorrow or '—'}")
        lines.append("")
        lines.append("**Lichtblicke / Gratitude**")
        gratitudes = entry.gratitudes or [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3]
        if not gratitudes:
            gratitudes = [""]

        for idx, value in enumerate(gratitudes, start=1):
            lines.append(f"- Dankbarkeit {idx}: {value or '—'}")
        if entry.categories:
            labels = ", ".join(category.label for category in entry.categories)
            lines.append("")
            lines.append(f"**Kategorien / Categories:** {labels}")
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
            f"Dankbarkeit {index + 1} / Gratitude {index + 1}",
            value=default_value,
            key=f"journal_gratitude_{index}",
            placeholder=("z. B. Kaffee am Morgen, Gespräch mit Freund:in / e.g., morning coffee, chat with a friend"),
        )
        rendered_values.append(rendered)

    cleaned_gratitudes = [value.strip() for value in rendered_values if value.strip()]
    st.session_state[_journal_field_key("gratitudes")] = cleaned_gratitudes

    if gratitude_suggestions:
        st.caption(
            "Vorschläge aus früheren Einträgen / Suggestions from past entries: " + ", ".join(gratitude_suggestions[:6])
        )

    return cleaned_gratitudes


def _render_storage_notice(backend: FileStorageBackend, *, is_cloud: bool) -> None:
    storage_note = (
        "Persistenz aktiv: JSON unter "
        f"{backend.path} (lokal beschreibbar) / Persistence active: JSON stored at {backend.path}."
    )
    onedrive_hint = (
        "OneDrive-Sync erkannt; mobile Einträge werden abgeglichen / OneDrive sync detected; mobile entries stay aligned."
        if any(part.lower() == "onedrive" for part in backend.path.parts)
        else "Lokaler Pfad ohne Sync – OneDrive-Pfad via Umgebungsvariable setzen / Local path without sync – point GERRIS_ONEDRIVE_DIR to your OneDrive folder."
    )
    if is_cloud:
        storage_note += (
            " Streamlit Community Cloud speichert Dateien oft nur temporär – nach Neustarts "
            "kann der Zustand verloren gehen. / Streamlit Community Cloud storage can be "
            "ephemeral; state may reset after a restart."
        )
    st.info(f"{storage_note} {onedrive_hint}")


def _toggle_todo_completion(todo: TodoItem) -> None:
    updated = toggle_complete(todo.id)
    if updated and updated.completed:
        stats = update_kpis_on_completion(updated.completed_at)
        update_gamification_on_completion(updated, stats)
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
        st.caption("Keine Unteraufgaben vorhanden / No subtasks yet.")
        return

    completion_ratio = done_cards / total_cards
    st.progress(
        completion_ratio,
        text=f"{done_cards}/{total_cards} Unteraufgaben erledigt / subtasks completed",
    )


def _render_todo_kanban(todo: TodoItem) -> None:
    st.markdown("#### Kanban")
    kanban = todo.kanban
    ordered_columns = sorted(kanban.columns, key=lambda column: column.order)
    column_labels: dict[str, str] = {
        "backlog": "Backlog / Eingang",
        "doing": "Doing / In Arbeit",
        "done": "Done / Erledigt",
    }

    _render_subtask_progress(todo)

    with st.form(f"kanban_add_{todo.id}", clear_on_submit=True):
        subtask_title = st.text_input(
            "Titel der Unteraufgabe / Subtask title",
            key=f"kanban_title_{todo.id}",
            placeholder="Nächsten Schritt ergänzen / Add the next step",
        )
        subtask_description = st.text_area(
            "Beschreibung (optional) / Description (optional)",
            key=f"kanban_description_{todo.id}",
            placeholder="Kurze Details oder Akzeptanzkriterien / Short details or acceptance criteria",
        )
        create_subtask = st.form_submit_button("Karte anlegen / Add card")
        if create_subtask:
            if not subtask_title.strip():
                st.warning("Bitte einen Titel für die Karte angeben / Please provide a card title.")
            else:
                add_kanban_card(todo.id, title=subtask_title.strip(), description_md=subtask_description.strip())
                st.success("Unteraufgabe hinzugefügt / Subtask added.")
                st.rerun()

    st.markdown("#### Spalten / Columns")
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
                st.caption("Keine Karten hier / No cards yet.")
                continue

            for card in column_cards:
                with st.container(border=True):
                    st.markdown(card.title)
                    if card.description_md.strip():
                        snippet = card.description_md.strip().splitlines()[0]
                        st.caption(snippet[:140] + ("…" if len(snippet) > 140 else ""))

                    move_columns = st.columns(2)
                    if move_columns[0].button(
                        "← Links / Move left",
                        key=f"kanban_move_left_{todo.id}_{card.id}",
                        disabled=column_index == 0,
                    ):
                        move_kanban_card(todo.id, card_id=card.id, direction="left")
                        st.rerun()

                    if move_columns[1].button(
                        "Rechts / Move right →",
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
        "AI: Meilensteine vorschlagen / Suggest milestones",
        key=f"milestone_ai_{todo.id}",
        disabled=not ai_enabled,
        help="Erzeuge Vorschläge für Unterziele / Generate milestone suggestions.",
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
        label = "KI-Vorschlag / AI suggestion" if suggestion.from_ai else "Fallback"
        st.info(f"{label}: {len(suggestion.payload.milestones)} Optionen bereit.")
        suggestions = suggestion.payload.milestones

    if not suggestions:
        st.caption("Keine Vorschläge aktiv / No active suggestions. Klicke auf den Button für Ideen.")
        return

    st.markdown("##### Vorschläge übernehmen / Apply suggestions")
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
                help="Vorschlag zur Aufgabe hinzufügen / Add suggestion to the task.",
            ):
                add_milestone(
                    todo.id,
                    title=item.title,
                    complexity=complexity,
                    points=default_points,
                    note=item.rationale,
                )
                st.success("Meilenstein übernommen / Milestone added.")
                st.rerun()


def _render_milestone_board(todo: TodoItem, *, gamification_mode: GamificationMode) -> None:
    ai_enabled = bool(st.session_state.get(AI_ENABLED_KEY, False))
    st.markdown("#### Unterziele & Meilensteine / Sub-goals & milestones")
    st.caption(
        "Plane Etappenziele, die du auf einem kleinen Priority-Board nachverfolgst / "
        "Plan milestones and track them on a compact priority board."
    )

    status_order = list(MilestoneStatus)
    status_columns = st.columns(len(status_order))
    for status, column in zip(status_order, status_columns):
        with column:
            column.markdown(f"**{status.label}**")
            items = [item for item in todo.milestones if item.status is status]
            if not items:
                column.caption("Keine Einträge / No items")
                continue

            for milestone in sorted(items, key=lambda item: (-item.points, item.title.lower())):
                with st.container(border=True):
                    st.markdown(f"**{milestone.title}**")
                    st.caption(f"{milestone.complexity.label} · {milestone.points} Punkte / points")
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
                            "Aufwand / Complexity",
                            options=list(MilestoneComplexity),
                            format_func=lambda option: option.label,
                            index=list(MilestoneComplexity).index(milestone.complexity),
                            key=f"milestone_complexity_{todo.id}_{milestone.id}",
                        )
                        recommended_points = _points_for_complexity(edit_complexity)
                        edit_points = st.number_input(
                            "Punkte / Points",
                            min_value=0,
                            value=int(milestone.points or recommended_points),
                            step=1,
                            key=f"milestone_points_{todo.id}_{milestone.id}",
                            help=f"Empfohlen: {recommended_points}",
                        )
                        edit_note = st.text_area(
                            "Notiz (optional) / Note (optional)",
                            value=milestone.note,
                            key=f"milestone_note_{todo.id}_{milestone.id}",
                        )
                        if st.form_submit_button("Speichern / Save"):
                            update_milestone(
                                todo.id,
                                milestone.id,
                                complexity=edit_complexity,
                                points=int(edit_points),
                                note=edit_note,
                            )
                            st.success("Aktualisiert / Updated")
                            st.rerun()

    st.markdown("##### Neues Unterziel / New sub-goal")
    with st.form(f"milestone_add_{todo.id}"):
        title = st.text_input(
            "Titel / Title",
            key=f"{NEW_MILESTONE_TITLE_KEY}_{todo.id}",
            placeholder="z. B. Entwurf abstimmen / e.g., align draft",
        )
        complexity = st.selectbox(
            "Aufwand / Complexity",
            options=list(MilestoneComplexity),
            format_func=lambda option: option.label,
            key=f"{NEW_MILESTONE_COMPLEXITY_KEY}_{todo.id}",
        )
        suggested_points = _points_for_complexity(complexity)
        points = st.number_input(
            "Punkte / Points",
            min_value=0,
            value=int(suggested_points),
            step=1,
            key=f"{NEW_MILESTONE_POINTS_KEY}_{todo.id}",
            help=f"Empfohlene Punkte basierend auf Aufwand / Suggested: {suggested_points}",
        )
        note = st.text_area(
            "Notiz (optional) / Note (optional)",
            key=f"{NEW_MILESTONE_NOTE_KEY}_{todo.id}",
            placeholder="Warum ist dieser Schritt wichtig? / Why is this step important?",
        )
        add_clicked = st.form_submit_button("Hinzufügen / Add")
        if add_clicked:
            if not title.strip():
                st.warning("Bitte Titel ergänzen / Please provide a title")
            else:
                add_milestone(
                    todo.id,
                    title=title.strip(),
                    complexity=complexity,
                    points=int(points),
                    note=note.strip(),
                )
                st.success("Meilenstein gespeichert / Milestone saved")
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
                "Erledigt / Done",
                value=todo.completed,
                label_visibility="collapsed",
                key=f"list_done_{todo.id}",
                on_change=_toggle_todo_completion,
                kwargs={"todo": todo},
                help="Hake Aufgabe ab oder öffne sie erneut / Toggle completion state.",
            )

        with row_columns[1]:
            st.markdown(f"**{todo.title}**")
            st.caption(f"{translate_text(('Kategorie', 'Category'))}: {todo.category.label}")

        with row_columns[2]:
            st.markdown(f"<div class='task-priority'>P{todo.priority}</div>", unsafe_allow_html=True)
            st.caption("Priorität / Priority")

        with row_columns[3]:
            if todo.due_date:
                st.markdown(
                    f"<div class='task-due'>{translate_text(('Fällig', 'Due'))}: {todo.due_date.date().isoformat()}</div>",
                    unsafe_allow_html=True,
                )
            else:
                st.caption("Kein Fälligkeitsdatum / No due date")

        with row_columns[4]:
            st.markdown(
                f"<div class='task-quadrant'>{quadrant_badge(todo.quadrant, include_full_label=True)}</div>",
                unsafe_allow_html=True,
            )

        container.markdown("</div>", unsafe_allow_html=True)

        with st.expander("Details anzeigen / Show details"):
            st.caption(f"Kategorie / Category: {todo.category.label}")
            if todo.description_md.strip():
                st.markdown(todo.description_md)
            else:
                st.caption("Keine Beschreibung vorhanden / No description yet.")

            st.markdown("#### Terminierung / Scheduling")
            st.caption(f"Wiederholung / Recurrence: {todo.recurrence.label}")
            st.caption(f"Erinnerung / Reminder: {todo.email_reminder.label}")

            st.markdown("#### Fortschrittsregel / Progress rule")
            if todo.progress_target is not None:
                if todo.progress_target > 0:
                    progress_ratio = min(1.0, todo.progress_current / todo.progress_target)
                else:
                    progress_ratio = 1.0
                st.progress(
                    progress_ratio,
                    text=f"{todo.progress_current:.2f} / {todo.progress_target:.2f} {todo.progress_unit}",
                )
                st.caption(
                    (
                        f"Automatisch abschließen: {'Ja' if todo.auto_done_when_target_reached else 'Nein'}",
                        f"Auto-complete when target reached: {'Yes' if todo.auto_done_when_target_reached else 'No'}",
                    )
                )
                if todo.completion_criteria_md.strip():
                    st.markdown(todo.completion_criteria_md)
            else:
                st.caption(
                    (
                        f"Kein Ziel hinterlegt. Aktueller Stand: {todo.progress_current:.2f} {todo.progress_unit}",
                        f"No target configured. Current progress: {todo.progress_current:.2f} {todo.progress_unit}",
                    )
                )

            _render_milestone_board(todo, gamification_mode=gamification_mode)

            with st.form(f"quick_edit_{todo.id}"):
                left, right = st.columns(2)
                with left:
                    new_category = st.selectbox(
                        "Kategorie / Category",
                        options=list(Category),
                        format_func=lambda option: option.label,
                        index=list(Category).index(todo.category),
                        key=f"quick_category_{todo.id}",
                        label_visibility="collapsed",
                    )
                    new_priority = st.slider(
                        "Priorität / Priority",
                        min_value=1,
                        max_value=5,
                        value=todo.priority,
                        key=f"quick_priority_{todo.id}",
                        label_visibility="collapsed",
                        help="1 = höchste Priorität, 5 = niedrigste / 1 = highest priority, 5 = lowest.",
                    )

                with right:
                    new_due = st.date_input(
                        "Fälligkeitsdatum / Due date",
                        value=todo.due_date.date() if todo.due_date else None,
                        format="YYYY-MM-DD",
                        key=f"quick_due_{todo.id}",
                        label_visibility="collapsed",
                    )
                    new_quadrant = st.selectbox(
                        "Eisenhower-Quadrant / Quadrant",
                        options=list(EisenhowerQuadrant),
                        format_func=lambda option: option.label,
                        index=list(EisenhowerQuadrant).index(todo.quadrant),
                        key=f"quick_quadrant_{todo.id}",
                        label_visibility="collapsed",
                    )

                recurrence_cols = st.columns(2)
                with recurrence_cols[0]:
                    new_recurrence = st.selectbox(
                        "Wiederholung / Recurrence",
                        options=list(RecurrencePattern),
                        format_func=lambda option: option.label,
                        index=list(RecurrencePattern).index(todo.recurrence),
                        key=f"quick_recurrence_{todo.id}",
                        label_visibility="collapsed",
                    )
                with recurrence_cols[1]:
                    new_reminder = st.selectbox(
                        "E-Mail-Erinnerung / Email reminder",
                        options=list(EmailReminderOffset),
                        format_func=lambda option: option.label,
                        index=list(EmailReminderOffset).index(todo.email_reminder),
                        key=f"quick_reminder_{todo.id}",
                        label_visibility="collapsed",
                    )

                with st.expander("Fortschrittsregel bearbeiten / Edit progress rule"):
                    enable_progress_target = st.checkbox(
                        "Ziel hinterlegen / Set target",
                        value=todo.progress_target is not None,
                        key=f"quick_progress_enable_{todo.id}",
                        label_visibility="collapsed",
                    )
                    progress_cols = st.columns([0.5, 0.5])
                    with progress_cols[0]:
                        edit_progress_target = st.number_input(
                            "Zielwert / Target",
                            min_value=0.0,
                            value=float(todo.progress_target or 0.0),
                            step=1.0,
                            key=f"quick_progress_target_{todo.id}",
                            disabled=not enable_progress_target,
                            label_visibility="collapsed",
                        )
                    with progress_cols[1]:
                        edit_progress_unit = st.text_input(
                            "Einheit / Unit",
                            value=todo.progress_unit,
                            key=f"quick_progress_unit_{todo.id}",
                            disabled=not enable_progress_target,
                            label_visibility="collapsed",
                        )

                    edit_progress_current = st.number_input(
                        "Aktueller Stand / Current progress",
                        min_value=0.0,
                        value=float(todo.progress_current),
                        step=0.5,
                        key=f"quick_progress_current_{todo.id}",
                        label_visibility="collapsed",
                    )

                    edit_auto_complete = st.toggle(
                        "Automatisch abschließen / Auto-complete",
                        value=todo.auto_done_when_target_reached,
                        key=f"quick_progress_auto_{todo.id}",
                        disabled=not enable_progress_target,
                    )

                    edit_criteria_tabs = st.tabs(["Kriterien / Criteria", "Vorschau / Preview"])
                    with edit_criteria_tabs[0]:
                        edit_completion_criteria = st.text_area(
                            "Erfüllungskriterien (Markdown) / Completion criteria (markdown)",
                            value=todo.completion_criteria_md,
                            key=f"quick_progress_criteria_{todo.id}",
                            disabled=not enable_progress_target,
                            label_visibility="collapsed",
                        )
                    with edit_criteria_tabs[1]:
                        if enable_progress_target and todo.completion_criteria_md.strip():
                            st.markdown(todo.completion_criteria_md)
                        elif enable_progress_target:
                            st.caption("Keine Kriterien gepflegt / No criteria provided.")
                        else:
                            st.caption("Kein Ziel aktiv / No target active.")

                submitted_edit = st.form_submit_button("Speichern / Save")
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
                    st.success("Aktualisiert / Updated.")
                    st.rerun()

            action_cols = st.columns(2)
            with action_cols[0]:
                _render_delete_confirmation(todo, key_prefix=f"list_delete_{todo.id}")

            if action_cols[1].button(
                "Duplizieren / Duplicate",
                key=f"list_duplicate_{todo.id}",
                help="Aufgabe kopieren / Duplicate task",
            ):
                duplicate_todo(todo.id)
                st.success("Aufgabe dupliziert / Task duplicated.")
                st.rerun()


def render_task_list_view(todos: list[TodoItem]) -> None:
    st.subheader("Aufgabenliste / Task list")
    st.caption(
        "Gruppiert nach Kategorie mit Priorität zuerst, danach Fälligkeit und Erstellungsdatum / "
        "Grouped by category with priority first, then due date and created timestamp."
    )

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
            "Erledigte anzeigen / Show completed",
            value=st.session_state.get(FILTER_SHOW_DONE_KEY, True),
            key=FILTER_SHOW_DONE_KEY,
        )

    with filter_columns[1]:
        default_categories = st.session_state.get(FILTER_SELECTED_CATEGORIES_KEY) or list(Category)
        selected_categories = st.multiselect(
            "Kategorien / Categories",
            options=list(Category),
            default=default_categories,
            format_func=lambda option: option.label,
            key=FILTER_SELECTED_CATEGORIES_KEY,
        )
        if not selected_categories:
            selected_categories = list(Category)

    with filter_columns[2]:
        sort_labels: dict[SortOverride, str] = {
            "priority": "Priorität, dann Fälligkeit / Priority then due date",
            "due_date": "Fälligkeitsdatum zuerst / Sort by due date",
            "created_at": "Erstellungsdatum zuerst / Sort by created at",
        }
        current_sort_value = st.session_state.get(FILTER_SORT_OVERRIDE_KEY, "priority")
        current_sort: SortOverride = current_sort_value if current_sort_value in sort_labels else "priority"  # type: ignore[assignment]
        sort_override: SortOverride = st.selectbox(
            "Sortierung / Sorting",
            options=list(sort_labels.keys()),
            format_func=lambda key: sort_labels[key],
            index=list(sort_labels.keys()).index(current_sort),
            key=FILTER_SORT_OVERRIDE_KEY,
        )

    visible_todos = [
        todo for todo in todos if (show_done or not todo.completed) and todo.category in selected_categories
    ]

    if not visible_todos:
        st.info("Keine passenden Aufgaben gefunden / No matching tasks.")
        return

    task_list_container = st.container()
    with task_list_container:
        st.markdown('<div class="task-list-container">', unsafe_allow_html=True)
        for category in Category:
            if category not in selected_categories:
                continue

            category_todos = [todo for todo in visible_todos if todo.category is category]
            if not category_todos:
                st.caption(f"Keine Aufgaben in {category.label} / No tasks in {category.label}.")
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

    st.session_state[SS_SETTINGS] = settings
    return settings


def _resolve_goal_input_value(settings: dict[str, Any], stats: KpiStats) -> int:
    suggested_goal = st.session_state.get(GOAL_SUGGESTED_VALUE_KEY)
    existing_goal_value = st.session_state.get(SETTINGS_GOAL_DAILY_KEY)
    default_goal = int(settings.get("goal_daily", stats.goal_daily))

    if suggested_goal is not None:
        resolved_goal = int(suggested_goal)
    elif existing_goal_value is not None:
        resolved_goal = int(existing_goal_value)
    else:
        resolved_goal = default_goal

    st.session_state[SETTINGS_GOAL_DAILY_KEY] = resolved_goal
    return resolved_goal


def _panel_section(panel: Any, label: str) -> Any:
    expander = getattr(panel, "expander", None)
    if callable(expander):
        return expander(label)
    return nullcontext()


def render_settings_panel(stats: KpiStats, client: Optional[OpenAI], *, panel: Any | None = None) -> bool:
    panel = panel or st
    panel.header("Ziele & Einstellungen / Goals & settings")

    settings = _ensure_settings_defaults(client=client, stats=stats)
    ai_enabled = bool(settings.get(AI_ENABLED_KEY, bool(client)))
    panel.info(
        "Steuere den KI-Schalter jetzt in der Sidebar über dem Sprachen-Toggle. / "
        "Control the AI toggle from the sidebar above the language switch.",
    )

    if not st.session_state.get(GOAL_CREATION_VISIBLE_KEY, False):
        panel.caption("Starte die Zielkonfiguration über den Button. / Begin configuring goals via the button.")
        if panel.button("Ziel erstellen / Create goal", type="primary"):
            st.session_state[GOAL_CREATION_VISIBLE_KEY] = True
            st.rerun()
        return ai_enabled

    panel.markdown("### Tagesziel / Daily goal")
    goal_input_value = _resolve_goal_input_value(settings=settings, stats=stats)
    goal_row = panel.columns(3)
    with goal_row[0]:
        goal_value = panel.number_input(
            "Ziel pro Tag / Target per day",
            min_value=1,
            step=1,
            value=goal_input_value,
            key=SETTINGS_GOAL_DAILY_KEY,
            help=("Lege ein realistisches Tagesziel fest / Set a realistic daily target."),
        )
    with goal_row[1]:
        if panel.button("Ziel speichern / Save goal", key="settings_save_goal"):
            update_goal_daily(int(goal_value))
            panel.success("Tagesziel aktualisiert / Daily goal updated.")
            st.rerun()
    with goal_row[2]:
        if panel.button(
            "AI: Ziel vorschlagen / Suggest goal",
            key="settings_ai_goal",
            disabled=not ai_enabled,
            help=(
                "Lässt OpenAI einen Vorschlag machen; ohne Schlüssel wird ein Fallback genutzt / "
                "Let OpenAI suggest a goal; without a key a fallback is used."
            ),
        ):
            suggestion = suggest_goals(stats, client=client if ai_enabled else None)
            st.session_state[AI_GOAL_SUGGESTION_KEY] = suggestion
            st.session_state[GOAL_SUGGESTED_VALUE_KEY] = suggestion.payload.daily_goal
            st.rerun()
    settings["goal_daily"] = int(goal_value)

    goal_suggestion: AISuggestion[Any] | None = st.session_state.get(AI_GOAL_SUGGESTION_KEY)
    if goal_suggestion:
        badge = "🤖" if goal_suggestion.from_ai else "🧭"
        tips = " · ".join(goal_suggestion.payload.tips)
        panel.info(
            f"{badge} {goal_suggestion.payload.focus} — {goal_suggestion.payload.daily_goal} Ziele / goals. {tips}"
        )

    with _panel_section(panel, "Kategorienziele / Category goals"):
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
                    help="Tagesziel für diese Kategorie / Daily target for this category",
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
        hovertemplate=(
            f"{snapshot.category.label}<br>"
            "Heute erledigt / Done today: %{x}<br>"
            "Tagesziel / Daily goal: %{text}<extra></extra>"
        ),
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


def render_goal_overview(
    todos: list[TodoItem], *, stats: KpiStats, category_goals: Mapping[str, int]
) -> tuple[bool, bool]:
    st.subheader("Ziele im Überblick / Goals at a glance")
    snapshots = aggregate_category_kpis(
        todos,
        category_goals=category_goals,
        fallback_streak=stats.streak,
    )

    overview_columns = st.columns([1, 1, 1, 1, 1, 0.8])
    for category_index, category in enumerate(Category):
        snapshot = snapshots[category]
        with overview_columns[category_index]:
            st.plotly_chart(
                _build_category_gauge(snapshot),
                width="stretch",
                config={"displaylogo": False, "responsive": True},
            )

    with overview_columns[-1]:
        st.markdown("**Visualisierungen / Visualisations**")
        show_kpi_dashboard = st.checkbox(
            "KPI-Dashboard anzeigen / Show KPI dashboard",
            value=st.session_state.get(GOAL_OVERVIEW_SHOW_KPI_KEY, True),
            key=GOAL_OVERVIEW_SHOW_KPI_KEY,
            help="Steuerung für die Kennzahlen-Übersicht / Toggle the KPI overview.",
        )
        show_category_trends = st.checkbox(
            "Kategorie-Trends anzeigen / Show category trends",
            value=st.session_state.get(GOAL_OVERVIEW_SHOW_CATEGORY_KEY, True),
            key=GOAL_OVERVIEW_SHOW_CATEGORY_KEY,
            help="Blendet die Detailvisualisierungen zu den Kategorien ein / Show detailed category charts.",
        )

    return show_kpi_dashboard, show_category_trends


def render_category_dashboard(todos: list[TodoItem], *, stats: KpiStats, category_goals: Mapping[str, int]) -> None:
    st.subheader("Kategorie-Überblick / Category overview")
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
                    f"Δ {snapshot.done_today - snapshot.daily_goal} zum Ziel / to goal"
                    if snapshot.daily_goal > 0
                    else "Kein Tagesziel / No daily goal"
                )
                st.metric(
                    "Heute erledigt / Done today",
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
                            f"Offen / Open: {snapshot.open_count}",
                            f"Gesamt / Total: {snapshot.done_total}",
                            f"Streak: {snapshot.streak} Tage / days",
                        ]
                    )
                )

    weekly_data = last_7_days_completions_by_category(todos)
    st.plotly_chart(
        build_category_weekly_completion_figure(weekly_data),
        width="stretch",
        config={"displaylogo": False, "responsive": True},
    )


def render_todo_section(
    ai_enabled: bool,
    client: Optional[OpenAI],
    *,
    todos: Optional[list[TodoItem]] = None,
    stats: Optional[KpiStats] = None,
) -> None:
    todos = todos or get_todos()
    quadrant_options = list(EisenhowerQuadrant)

    st.subheader("ToDo hinzufügen / Add task")

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

    with st.form("add_todo_form", clear_on_submit=False):
        title_col, _ = st.columns([1, 1])
        with title_col:
            title = st.text_input(
                "Titel / Title",
                key=NEW_TODO_TITLE_KEY,
                placeholder="Nächstes ToDo eingeben / Enter next task",
            )
        col_left, col_right = st.columns(2)
        with col_left:
            due_date: Optional[date] = st.date_input(
                "Fälligkeitsdatum / Due date",
                value=st.session_state.get(NEW_TODO_DUE_KEY),
                key=NEW_TODO_DUE_KEY,
                format="YYYY-MM-DD",
            )
        with col_right:
            quadrant = st.selectbox(
                "Eisenhower-Quadrant / Quadrant",
                quadrant_options,
                key=NEW_TODO_QUADRANT_KEY,
                format_func=lambda option: option.label,
            )

        recurrence_left, recurrence_right = st.columns(2)
        with recurrence_left:
            recurrence = st.selectbox(
                "Wiederholung / Recurrence",
                options=list(RecurrencePattern),
                key=NEW_TODO_RECURRENCE_KEY,
                format_func=lambda option: option.label,
                help="Einmalig, werktags oder feste Intervalle / One-time, weekdays, or fixed intervals.",
            )
        with recurrence_right:
            reminder = st.selectbox(
                "E-Mail-Erinnerung / Email reminder",
                options=list(EmailReminderOffset),
                key=NEW_TODO_REMINDER_KEY,
                format_func=lambda option: option.label,
                help="Optionale Mail-Erinnerung vor Fälligkeit / Optional email reminder before due date.",
            )

        meta_left, meta_right = st.columns(2)
        with meta_left:
            category = st.selectbox(
                "Kategorie / Category",
                options=list(Category),
                key=NEW_TODO_CATEGORY_KEY,
                format_func=lambda option: option.label,
            )
        with meta_right:
            priority = st.selectbox(
                "Priorität (1=hoch) / Priority (1=high)",
                options=list(range(1, 6)),
                key=NEW_TODO_PRIORITY_KEY,
            )

        description_col, _ = st.columns([1, 1])
        with description_col:
            description_tabs = st.tabs(["Schreiben / Write", "Vorschau / Preview"])
            with description_tabs[0]:
                description_md = st.text_area(
                    "Beschreibung (Markdown) / Description (markdown)",
                    key=NEW_TODO_DESCRIPTION_KEY,
                    placeholder=(
                        "Optional: Details, Checkliste oder Kontext / Optional: details, checklist, or context"
                    ),
                )
            with description_tabs[1]:
                preview_text = st.session_state.get(NEW_TODO_DESCRIPTION_KEY, "")
                if preview_text.strip():
                    st.markdown(preview_text)
                else:
                    st.caption("Keine Beschreibung vorhanden / No description yet.")

        with st.expander("Fortschrittsregel (optional) / Progress rule (optional)"):
            enable_target: bool = st.checkbox(
                "Zielvorgabe nutzen / Enable target",
                value=bool(st.session_state.get(NEW_TODO_ENABLE_TARGET_KEY, False)),
                key=NEW_TODO_ENABLE_TARGET_KEY,
                help="Optionaler Zielwert mit Einheit / Optional numeric target with unit.",
            )

            target_cols = st.columns([0.5, 0.5])
            with target_cols[0]:
                target_value = st.number_input(
                    "Zielwert / Target",
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
                    help="z. B. km, Seiten, Minuten / e.g., km, pages, minutes",
                )

            current_value = st.number_input(
                "Aktueller Stand / Current progress",
                min_value=0.0,
                value=float(st.session_state.get(NEW_TODO_PROGRESS_CURRENT_KEY, 0.0)),
                step=0.5,
                key=NEW_TODO_PROGRESS_CURRENT_KEY,
                help="Fortschritt in derselben Einheit wie das Ziel / Progress in same unit as target.",
            )

            auto_complete = st.toggle(
                "Automatisch als erledigt markieren, wenn Ziel erreicht / Auto-complete when target is reached",
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
                    "Erfüllungskriterien (Markdown) / Completion criteria (markdown)",
                    value=st.session_state.get(NEW_TODO_COMPLETION_CRITERIA_KEY, ""),
                    key=NEW_TODO_COMPLETION_CRITERIA_KEY,
                    placeholder="Optional: Wie erkennst du den Abschluss? / Optional: how do you know it's done?",
                    disabled=not enable_target,
                )
            with criteria_tabs[1]:
                criteria_preview = st.session_state.get(NEW_TODO_COMPLETION_CRITERIA_KEY, "")
                if enable_target and criteria_preview.strip():
                    st.markdown(criteria_preview)
                else:
                    st.caption("Keine Kriterien gepflegt / No criteria provided.")

            st.markdown("##### Unterziele / Milestones")
            draft_milestones: list[dict[str, object]] = st.session_state.get(NEW_TODO_DRAFT_MILESTONES_KEY, [])
            suggestion_store: dict[str, list[dict[str, str]]] = st.session_state.get(NEW_MILESTONE_SUGGESTIONS_KEY, {})
            milestone_title = st.text_input(
                "Titel des Meilensteins / Milestone title",
                key=NEW_MILESTONE_TITLE_KEY,
                placeholder="z. B. Konzept fertigstellen / e.g., finalize concept",
            )
            milestone_complexity = st.selectbox(
                "Aufwand / Complexity",
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
                placeholder="Kurze Beschreibung oder DoD / Brief description or DoD",
            )
            add_milestone_draft = st.button(
                "Meilenstein vormerken / Queue milestone",
                key="queue_new_milestone",
                help="Unterziel für diese Aufgabe vormerken / Queue a milestone for this task.",
            )

            generate_suggestions = st.button(
                "AI: Meilensteine vorschlagen / Suggest milestones",
                key="ai_suggest_new_milestones",
                disabled=not ai_enabled,
                help="Erzeuge Vorschläge für Unterziele / Generate milestone proposals",
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
                label = "KI-Vorschlag / AI suggestion" if milestone_suggestion.from_ai else "Fallback"
                st.info(f"{label}: {len(suggestion_candidates)} Ideen bereit.")

            if add_milestone_draft:
                if not milestone_title.strip():
                    st.warning("Bitte Titel ergänzen / Please provide a title")
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
                    st.success("Meilenstein vorgemerkt / Milestone queued")
                    st.rerun()

            if suggestion_candidates:
                st.markdown("###### Vorschläge übernehmen / Apply suggestions")
                for idx, candidate in enumerate(suggestion_candidates):
                    complexity = MilestoneComplexity(candidate.complexity)
                    default_points = _points_for_complexity(complexity)
                    st.caption(f"{candidate.title} · {complexity.label} · ~{default_points} Punkte")
                    if st.button(f"Übernehmen #{idx + 1}", key=f"apply_new_milestone_{idx}"):
                        draft_milestones.append(
                            {
                                "title": candidate.title,
                                "complexity": complexity.value,
                                "points": default_points,
                                "note": candidate.rationale,
                            }
                        )
                        st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = draft_milestones
                        st.success("Vorschlag übernommen / Suggestion added")
                        st.rerun()

            if draft_milestones:
                st.markdown("###### Vorgemerkte Unterziele / Draft milestones")
                for index, entry in enumerate(draft_milestones):
                    complexity_label = MilestoneComplexity(entry.get("complexity", "medium")).label
                    st.caption(f"{entry.get('title')} · {complexity_label} · {entry.get('points', 0)} Punkte")
                    if entry.get("note"):
                        st.caption(entry["note"])
                    if st.button(f"Entfernen #{index + 1}", key=f"remove_draft_{index}"):
                        draft_milestones.pop(index)
                        st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = draft_milestones
                        st.rerun()

        action_cols = st.columns(2)
        with action_cols[0]:
            suggest_quadrant_clicked = st.form_submit_button(
                "AI: Quadrant vorschlagen / Suggest quadrant",
                disabled=not ai_enabled,
                help="Nutze OpenAI fuer eine Auto-Kategorisierung / Use OpenAI to classify the task.",
            )
        with action_cols[1]:
            submitted = st.form_submit_button(
                "ToDo hinzufügen / Add task",
                type="primary",
            )

        if suggest_quadrant_clicked:
            if not title.strip():
                st.warning("Bitte Titel angeben / Please provide a title.")
            else:
                suggestion: AISuggestion[Any] = suggest_quadrant(title.strip(), client=client if ai_enabled else None)
                st.session_state[NEW_TODO_QUADRANT_PREFILL_KEY] = EisenhowerQuadrant(suggestion.payload.quadrant)
                st.session_state[AI_QUADRANT_RATIONALE_KEY] = suggestion.payload.rationale
                label = "KI-Vorschlag / AI suggestion" if suggestion.from_ai else "Fallback"
                st.info(f"{label}: {suggestion.payload.rationale}")
                st.rerun()

        if submitted:
            if not title.strip():
                st.warning("Bitte Titel angeben / Please provide a title.")
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
                st.success("ToDo gespeichert / Task saved.")
                st.session_state[NEW_TODO_RESET_TRIGGER_KEY] = True
                st.rerun()

    rationale = st.session_state.get(AI_QUADRANT_RATIONALE_KEY)
    if rationale:
        st.caption(f"Begründung (übersteuerbar) / Rationale (you can override): {rationale}")

    st.markdown("### Aufgabenansichten / Task views")
    list_tab, board_tab, calendar_tab = st.tabs(
        [
            "Liste / List",
            "Eisenhower-Board",
            "Kalender / Calendar",
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


def render_kpi_dashboard(stats: KpiStats) -> None:
    st.subheader("KPI-Dashboard")
    col_total, col_today, col_streak, col_goal = st.columns(4)

    col_total.metric("Erledigt gesamt / Done total", stats.done_total)
    col_today.metric("Heute erledigt / Done today", stats.done_today)
    col_streak.metric(
        "Kontinuität / Streak",
        translate_text((f"{stats.streak} Tage", f"{stats.streak} days")),
    )

    goal_delta = translate_text(("🎯 Ziel erreicht", "🎯 Goal achieved"))
    if not stats.goal_hit_today:
        goal_delta = translate_text(("Noch nicht erreicht", "Not reached yet"))
    col_goal.metric(
        "Zielerreichung / Goal progress",
        f"{stats.done_today}/{stats.goal_daily}",
        delta=goal_delta,
    )

    st.caption("Wochenübersicht der Abschlüsse / Week view of completions")
    weekly_data = get_weekly_completion_counts(stats)
    weekly_chart = build_weekly_completion_figure(weekly_data)
    st.plotly_chart(
        weekly_chart,
        width="stretch",
        config={"displaylogo": False, "responsive": True},
    )

    st.info(
        "Passe Tagesziel, Kategorien und KI-Optionen im Bereich 'Ziele' an / "
        "Adjust the daily goal, categories, and AI options inside the 'Goals' view."
    )


GOALS_PAGE_LABEL = "Ziele / Goals"
TASKS_PAGE_LABEL = "Aufgaben / Tasks"
JOURNAL_PAGE_LABEL = "Tagebuch / Journal"


def render_language_toggle() -> LanguageCode:
    current_language = get_language()
    language_labels = list(LANGUAGE_OPTIONS.keys())
    selected_label = st.sidebar.radio(
        translate_text("Sprache / Language"),
        options=language_labels,
        index=list(LANGUAGE_OPTIONS.values()).index(current_language),
    )
    chosen_language = LANGUAGE_OPTIONS[selected_label]

    if chosen_language != current_language:
        set_language(chosen_language)
        st.rerun()

    st.sidebar.divider()
    return chosen_language


def render_ai_toggle_sidebar(settings: dict[str, Any], *, client: Optional[OpenAI]) -> bool:
    ai_enabled = st.sidebar.toggle(
        "AI aktiv / AI enabled",
        key=AI_ENABLED_KEY,
        value=bool(settings.get(AI_ENABLED_KEY, bool(client))),
        help=(
            "Aktiviere KI-gestützte Vorschläge. Ohne Schlüssel werden Fallback-Texte genutzt / "
            "Enable AI suggestions. Without a key, fallback texts are used."
        ),
    )
    settings[AI_ENABLED_KEY] = ai_enabled
    st.session_state[SS_SETTINGS] = settings
    persist_state()
    return ai_enabled


def render_navigation() -> str:
    st.sidebar.title("Navigation")
    navigation_options = [GOALS_PAGE_LABEL, TASKS_PAGE_LABEL, JOURNAL_PAGE_LABEL]
    selection = st.sidebar.radio(
        "Bereich wählen / Choose a page",
        navigation_options,
        index=navigation_options.index(TASKS_PAGE_LABEL),
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
            motivation_key_suffix="sidebar",
            allow_mode_selection=True,
        )

    safety_panel = st.sidebar.expander("Sicherheit & Daten / Safety & data", expanded=False)
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
    motivation_key_suffix: str = "panel",
    allow_mode_selection: bool = False,
) -> None:
    panel = panel or st
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    try:
        gamification_mode = GamificationMode(settings.get("gamification_mode", GamificationMode.POINTS.value))
    except ValueError:
        gamification_mode = GamificationMode.POINTS

    panel.subheader("Gamification-Variante / Gamification variant")

    if allow_mode_selection:
        gamification_mode_options = list(GamificationMode)
        mode_index = gamification_mode_options.index(gamification_mode)
        selected_mode = panel.selectbox(
            "Gamification-Variante / Gamification mode",
            options=gamification_mode_options,
            format_func=lambda option: option.label,
            index=mode_index,
            help=(
                "Wähle Punkte, Abzeichen oder die motivierende Avatar-Option / "
                "Choose points, badges, or the motivational avatar option."
            ),
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
        col_points.metric("Punkte / Points", gamification_state.points)

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
        panel.markdown("#### Badges")
        if gamification_state.badges:
            badge_labels = " ".join(f"🏅 {badge}" for badge in gamification_state.badges)
            panel.markdown(
                f"{badge_labels}<br/>(jede Auszeichnung wird nur einmal vergeben / each badge is awarded once)",
                unsafe_allow_html=True,
            )
        else:
            panel.caption("Noch keine Badges gesammelt / No badges earned yet. Arbeite an deinen Zielen!")
        panel.info(
            "Sammle Abzeichen für Meilensteine wie erste Aufgabe, 3-Tage-Streak und 10 Abschlüsse / "
            "Earn badges for milestones like your first task, a 3-day streak, and 10 completions."
        )

    else:
        panel.markdown("#### Avatar")
        message_index = int(st.session_state.get(AVATAR_PROMPT_INDEX_KEY, 0))
        avatar_message = next_avatar_prompt(message_index)
        panel.info(f"👩‍⚕️ {avatar_message}")

        if panel.button("Neuen Spruch anzeigen / Show another quote", key="avatar_prompt_btn"):
            st.session_state[AVATAR_PROMPT_INDEX_KEY] = message_index + 1
            st.rerun()

        panel.caption(
            "Klicke erneut für weitere motivierende Botschaften im Therapiezimmer-Stil / "
            "Click again for more therapeutic, motivational messages."
        )

    if panel.button(
        "AI: Motivation / Motivation",
        key=f"ai_motivation_btn_{motivation_key_suffix}",
        disabled=not ai_enabled,
        help=(
            "Lässt OpenAI eine kurze Motivation erstellen; ohne Key wird ein Fallback genutzt / "
            "Ask OpenAI for motivation; without a key we use a fallback."
        ),
    ):
        st.session_state[AI_MOTIVATION_KEY] = generate_motivation(stats, client=client if ai_enabled else None)
        st.rerun()

    motivation: AISuggestion[Any] | None = st.session_state.get(AI_MOTIVATION_KEY)
    if motivation:
        badge = "🤖" if motivation.from_ai else "💡"
        panel.success(f"{badge} {motivation.payload}")


def render_safety_panel(panel: Any) -> bool:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    panel.info(
        "Optionale lokale Persistenz speichert Daten in .data/gerris_state.json; "
        "auf Streamlit Community Cloud können Dateien nach einem Neustart verschwinden. / "
        "Optional local persistence writes to .data/gerris_state.json; on Streamlit Community Cloud "
        "files may reset after a restart.",
    )
    panel.warning(
        "Dieses Tool ersetzt keine Krisenhilfe oder Diagnosen / This tool is not "
        "a crisis or diagnostic service. Bei akuten Notfällen wende dich an lokale "
        "Hotlines / In emergencies, contact local hotlines.",
    )
    show_storage_notice = panel.toggle(
        "Speicherhinweis anzeigen / Show storage notice",
        value=bool(settings.get(SHOW_STORAGE_NOTICE_KEY, False)),
        help=(
            "Blendet den Hinweis zum aktuellen Speicherpfad oberhalb des Titels ein oder aus / "
            "Toggle the storage location notice above the title on or off."
        ),
    )
    settings[SHOW_STORAGE_NOTICE_KEY] = show_storage_notice

    if panel.button(
        "Session zurücksetzen / Reset session",
        key="reset_session_btn",
        help=(
            "Löscht ToDos, KPIs, Gamification und Einstellungen aus dieser Sitzung / "
            "Clear todos, KPIs, gamification, and settings for this session."
        ),
    ):
        for cleanup_key in (
            AI_ENABLED_KEY,
            AI_GOAL_SUGGESTION_KEY,
            AI_QUADRANT_RATIONALE_KEY,
            AI_MOTIVATION_KEY,
            NEW_TODO_TITLE_KEY,
            NEW_TODO_DUE_KEY,
            NEW_TODO_QUADRANT_KEY,
            SETTINGS_GOAL_DAILY_KEY,
            GOAL_SUGGESTED_VALUE_KEY,
        ):
            st.session_state.pop(cleanup_key, None)
        reset_state()
        panel.success("Session zurückgesetzt / Session reset.")
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
            st.caption("Keine Aufgaben in diesem Quadranten / No tasks in this quadrant.")
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
            "Erledigt umschalten / Toggle status",
            key=f"complete_{todo.id}",
            help="Markiere Aufgabe als erledigt oder offen / Toggle done or open",
        ):
            _toggle_todo_completion(todo)

        with action_cols[1]:
            quadrant_selection = st.selectbox(
                "Quadrant wechseln / Change quadrant",
                options=list(EisenhowerQuadrant),
                format_func=lambda option: option.label,
                index=list(EisenhowerQuadrant).index(todo.quadrant),
                key=f"quadrant_{todo.id}",
            )
            if quadrant_selection != todo.quadrant:
                update_todo(todo.id, quadrant=quadrant_selection)
                st.success("Quadrant aktualisiert / Quadrant updated.")
                st.rerun()

        with action_cols[2]:
            _render_delete_confirmation(todo, key_prefix=f"card_delete_{todo.id}")

        with st.expander("Bearbeiten / Edit"):
            with st.form(f"edit_form_{todo.id}"):
                new_title = st.text_input(
                    "Titel / Title",
                    value=todo.title,
                    key=f"edit_title_{todo.id}",
                )
                new_due = st.date_input(
                    "Fälligkeitsdatum / Due date",
                    value=todo.due_date.date() if todo.due_date else None,
                    format="YYYY-MM-DD",
                    key=f"edit_due_{todo.id}",
                )
                new_quadrant = st.selectbox(
                    "Eisenhower-Quadrant / Quadrant",
                    options=list(EisenhowerQuadrant),
                    format_func=lambda option: option.label,
                    index=list(EisenhowerQuadrant).index(todo.quadrant),
                    key=f"edit_quadrant_{todo.id}",
                )
                new_category = st.selectbox(
                    "Kategorie / Category",
                    options=list(Category),
                    format_func=lambda option: option.label,
                    index=list(Category).index(todo.category),
                    key=f"edit_category_{todo.id}",
                )
                new_priority = st.selectbox(
                    "Priorität (1=hoch) / Priority (1=high)",
                    options=list(range(1, 6)),
                    index=list(range(1, 6)).index(todo.priority),
                    key=f"edit_priority_{todo.id}",
                )
                edit_tabs = st.tabs(["Schreiben / Write", "Vorschau / Preview"])
                with edit_tabs[0]:
                    new_description = st.text_area(
                        "Beschreibung (Markdown) / Description (markdown)",
                        value=todo.description_md,
                        key=f"edit_description_{todo.id}",
                    )
                with edit_tabs[1]:
                    preview = st.session_state.get(f"edit_description_{todo.id}", "")
                    if preview.strip():
                        st.markdown(preview)
                    else:
                        st.caption("Keine Beschreibung vorhanden / No description yet.")
                submitted_edit = st.form_submit_button("Speichern / Save")
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
                    st.success("Aktualisiert / Updated.")
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


def render_journal_section() -> None:
    ensure_journal_state()
    entries = get_journal_entries()
    active_date = _resolve_active_journal_date()

    action_cols = st.columns([0.45, 0.55])
    with action_cols[0]:
        if st.button(
            "Tagebucheintrag erstellen / Create journal entry",
            type="primary",
            help="Öffnet das Formular für den heutigen Tag oder lädt den gespeicherten Entwurf. / "
            "Opens today's form or loads the saved draft.",
        ):
            st.session_state[JOURNAL_ACTIVE_DATE_KEY] = date.today()
            st.session_state[JOURNAL_FORM_SEED_KEY] = None
            st.rerun()
    with action_cols[1]:
        st.info(
            "Der Eintrag bleibt zwischengespeichert, bis du ihn speicherst. / "
            "Drafts stay in the form until you hit save.",
            icon="📝",
        )

    selection_cols = st.columns([0.6, 0.4])
    with selection_cols[0]:
        selected_date = st.date_input(
            "Datum des Eintrags / Entry date",
            value=active_date,
            format="YYYY-MM-DD",
            max_value=date.today(),
            key=JOURNAL_ACTIVE_DATE_KEY,
            help="Ein Eintrag pro Kalendertag; bestehende Entwürfe werden automatisch geladen. / "
            "One entry per calendar day; existing drafts load automatically.",
        )

    existing_entry = entries.get(selected_date)
    if existing_entry:
        st.success("Vorhandener Entwurf geladen / Existing draft loaded.")
        entry = existing_entry
    else:
        entry = JournalEntry(date=selected_date, moods=list(MOOD_PRESETS[:2]))

    gratitude_suggestions = journal_gratitude_suggestions(exclude_date=selected_date)
    _prefill_journal_form(entry)

    with st.form("journal_form"):
        st.markdown("### Stimmung / Emotionen")
        mood_cols = st.columns([0.6, 0.4])
        with mood_cols[0]:
            moods = st.multiselect(
                "Wie fühlst du dich? / How do you feel?",
                options=list(MOOD_PRESETS),
                default=st.session_state.get(_journal_field_key("moods"), list(MOOD_PRESETS[:2])),
                key=_journal_field_key("moods"),
                help="Tags mit Autosuggest; eigene Einträge möglich. / Tag-based, searchable list (custom entries allowed).",
            )
        with mood_cols[1]:
            mood_notes = st.text_area(
                "Kurzbeschreibung / Notes",
                value=st.session_state.get(_journal_field_key("mood_notes"), ""),
                key=_journal_field_key("mood_notes"),
                placeholder="z. B. ruhig nach dem Spaziergang / e.g., calm after a walk",
            )

        journal_cols = st.columns(4)

        with journal_cols[0]:
            st.markdown("#### Auslöser & Reaktionen / Triggers & reactions")
            triggers_and_reactions = st.text_area(
                "Was ist passiert und wie hast du reagiert? / What happened and how did you react?",
                value=st.session_state.get(_journal_field_key("triggers_and_reactions"), ""),
                key=_journal_field_key("triggers_and_reactions"),
                placeholder="z. B. stressiges Telefonat, dann 5 Minuten geatmet / stressful call, then 5 minutes of breathing",
            )

        with journal_cols[1]:
            st.markdown("#### Gedanken-Challenge / Thought challenge")
            negative_thought = st.text_area(
                "Automatischer Gedanke / Automatic thought",
                value=st.session_state.get(_journal_field_key("negative_thought"), ""),
                key=_journal_field_key("negative_thought"),
                placeholder="z. B. 'Ich schaffe das nie' / e.g., 'I will never manage this'",
            )
            rational_response = st.text_area(
                "Reframe / Rational response",
                value=st.session_state.get(_journal_field_key("rational_response"), ""),
                key=_journal_field_key("rational_response"),
                placeholder="z. B. 'Ein Schritt nach dem anderen' / e.g., 'One step at a time'",
            )

        with journal_cols[2]:
            st.markdown("#### Selbstfürsorge / Self-care")
            self_care_today = st.text_area(
                "Was habe ich heute für mich getan? / What did I do for myself today?",
                value=st.session_state.get(_journal_field_key("self_care_today"), ""),
                key=_journal_field_key("self_care_today"),
                placeholder="z. B. kurzer Spaziergang, Tee in Ruhe / e.g., short walk, mindful tea",
            )
            self_care_tomorrow = st.text_area(
                "Was mache ich morgen besser? / What will I do better tomorrow?",
                value=st.session_state.get(_journal_field_key("self_care_tomorrow"), ""),
                key=_journal_field_key("self_care_tomorrow"),
                placeholder="z. B. Pausen blocken, früher ins Bett / e.g., block breaks, go to bed earlier",
            )

        with journal_cols[3]:
            st.markdown("#### Lichtblicke & Dankbarkeit / Highlights & gratitude")
            gratitude_inputs = _render_gratitude_inputs(gratitude_suggestions)

        st.markdown("### Kategorien & Ziele / Categories & goals")
        selected_categories = st.multiselect(
            "Welche Bereiche waren beteiligt? / Which categories apply?",
            options=list(Category),
            format_func=lambda option: option.label,
            default=st.session_state.get(_journal_field_key("categories"), []),
            key=_journal_field_key("categories"),
            help="Mehrfachauswahl mit Suche; verbindet Eintrag und Ziele. / Multi-select with search to link goals.",
        )

        save_clicked = st.form_submit_button("Eintrag speichern / Save entry", type="primary")
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
            st.success("Eintrag gespeichert / Entry saved.")
            st.session_state[JOURNAL_FORM_SEED_KEY] = journal_entry.date
            st.rerun()

    if entries:
        st.markdown("#### Letzte Einträge / Recent entries")
        sorted_entries = sorted(entries.items(), key=lambda item: item[0], reverse=True)
        for entry_date, history_entry in sorted_entries[:5]:
            with st.expander(entry_date.isoformat()):
                st.write(" · ".join(history_entry.moods) if history_entry.moods else "—")
                st.caption(history_entry.triggers_and_reactions or "Keine Auslöser notiert / No triggers noted")
                if history_entry.categories:
                    st.caption(
                        "Kategorien / Categories: " + ", ".join(category.label for category in history_entry.categories)
                    )


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
        category_goals = _sanitize_category_goals(st.session_state.get(SS_SETTINGS, {}))
        show_kpi_dashboard, show_category_trends = render_goal_overview(
            todos,
            stats=stats,
            category_goals=category_goals,
        )

        if show_kpi_dashboard:
            render_kpi_dashboard(stats)

        if show_category_trends:
            render_category_dashboard(
                todos,
                stats=stats,
                category_goals=category_goals,
            )

        settings_container = st.container()
        ai_enabled = render_settings_panel(stats, client, panel=settings_container)
    elif selection == translate_text(TASKS_PAGE_LABEL):
        st.header("Aufgaben / Tasks")
        st.caption("Verwalte und plane deine Aufgaben. Ziele & KI konfigurierst du im Bereich 'Ziele'.")
        render_todo_section(ai_enabled=ai_enabled, client=client, todos=todos, stats=stats)
    else:
        render_journal_section()


if __name__ == "__main__":
    main()
