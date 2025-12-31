from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Literal, Mapping, Optional, Sequence, cast

import streamlit as st
from openai import OpenAI

from gerris_erfolgs_tracker.ai_features import (
    AISuggestion,
    suggest_daily_plan,
    suggest_milestones,
    suggest_quadrant,
)
from gerris_erfolgs_tracker.calendar_view import render_calendar_view
from gerris_erfolgs_tracker.coach.engine import process_event
from gerris_erfolgs_tracker.coach.factory import build_completion_event
from gerris_erfolgs_tracker.coach.task_analyzer_models import MilestonePlanItem, TaskAIProposal
from gerris_erfolgs_tracker.constants import (
    AI_ENABLED_KEY,
    AI_QUADRANT_RATIONALE_KEY,
    FILTER_SELECTED_CATEGORIES_KEY,
    FILTER_SHOW_DONE_KEY,
    FILTER_SORT_OVERRIDE_KEY,
    JOURNAL_COMPLETION_NOTE_KEY,
    JOURNAL_COMPLETION_PROMPT_KEY,
    NEW_MILESTONE_COMPLEXITY_KEY,
    NEW_MILESTONE_NOTE_KEY,
    NEW_MILESTONE_POINTS_KEY,
    NEW_MILESTONE_SUGGESTIONS_KEY,
    NEW_MILESTONE_TITLE_KEY,
    NEW_TODO_AUTO_COMPLETE_KEY,
    NEW_TODO_CATEGORY_KEY,
    NEW_TODO_COMPLETION_CRITERIA_KEY,
    NEW_TODO_DESCRIPTION_KEY,
    NEW_TODO_DRAFT_MILESTONES_KEY,
    NEW_TODO_DUE_KEY,
    NEW_TODO_ENABLE_TARGET_KEY,
    NEW_TODO_PRIORITY_KEY,
    NEW_TODO_PROGRESS_CURRENT_KEY,
    NEW_TODO_PROGRESS_TARGET_KEY,
    NEW_TODO_PROGRESS_UNIT_KEY,
    NEW_TODO_QUADRANT_KEY,
    NEW_TODO_QUADRANT_PREFILL_KEY,
    NEW_TODO_RECURRENCE_KEY,
    NEW_TODO_REMINDER_KEY,
    NEW_TODO_RESET_TRIGGER_KEY,
    NEW_TODO_TEMPLATE_KEY,
    NEW_TODO_TITLE_KEY,
    PENDING_DELETE_TODO_KEY,
    SS_SETTINGS,
    TASK_AI_PROPOSAL_APPLY_KEY,
    TASK_AI_PROPOSAL_KEY,
    TODO_TEMPLATE_LAST_APPLIED_KEY,
)
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant, group_by_quadrant, sort_todos
from gerris_erfolgs_tracker.gamification import GamificationState, get_gamification_state
from gerris_erfolgs_tracker.i18n import translate_text
from gerris_erfolgs_tracker.journal import (
    append_journal_links,
    get_journal_entries,
    get_journal_entry,
    get_journal_links_by_todo,
    upsert_journal_entry,
)
from gerris_erfolgs_tracker.llm import LLMError, get_default_model, get_openai_client, request_structured_response
from gerris_erfolgs_tracker.llm_schemas import (
    DailyPlanningSuggestion,
    MilestoneSuggestionItem,
    MilestoneSuggestionList,
)
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
from gerris_erfolgs_tracker.state import get_todos
from gerris_erfolgs_tracker.todos import (
    add_kanban_card,
    add_milestone,
    add_todo,
    delete_todo,
    duplicate_todo,
    move_kanban_card,
    move_milestone,
    toggle_complete,
    update_milestone,
    update_todo,
)
from gerris_erfolgs_tracker.ui.common import quadrant_badge

SortOverride = Literal["priority", "due_date", "created_at"]


def _points_for_complexity(complexity: MilestoneComplexity) -> int:
    if complexity is MilestoneComplexity.SMALL:
        return 10
    if complexity is MilestoneComplexity.MEDIUM:
        return 25
    return 50


def _fallback_task_proposal(title: str, *, due_date: Optional[date]) -> TaskAIProposal:
    base_title = title.strip() or "Aufgabe"
    today = date.today()
    milestone_due = due_date or (today + timedelta(days=7))
    plan = [
        MilestonePlanItem(
            title=f"Ersten Schritt planen · {base_title}", suggested_due=today, effort=1, suggested_points=10
        ),
        MilestonePlanItem(
            title=f"Zwischenstand dokumentieren · {base_title}",
            suggested_due=min(milestone_due, today + timedelta(days=3)),
            effort=2,
            suggested_points=20,
        ),
        MilestonePlanItem(
            title=f"Abschluss vorbereiten · {base_title}",
            suggested_due=milestone_due,
            effort=2,
            suggested_points=25,
        ),
    ]
    return TaskAIProposal(
        complexity_score=3,
        estimated_minutes=90,
        suggested_quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        suggested_priority=3,
        milestone_plan=plan,
        start_date=today,
        due_date=due_date,
    )


def _request_task_proposal(
    *,
    title: str,
    description: str,
    due_date: Optional[date],
    quadrant: EisenhowerQuadrant,
    client: Optional[OpenAI],
) -> AISuggestion[TaskAIProposal]:
    if not client or not title.strip():
        return AISuggestion(_fallback_task_proposal(title, due_date=due_date), from_ai=False)

    today = date.today()
    model = get_default_model(reasoning=True)
    try:
        proposal = request_structured_response(
            client=client,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Du analysierst Aufgaben und schlägst Aufwand, Priorität und Milestones vor. "
                        "Keine Diagnosen, keine Krisentipps, kein Therapeuten-Rollenspiel. "
                        "Antworte zweisprachig (DE/EN) und halte dich strikt an das Schema."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Titel: {title}\n"
                        f"Beschreibung: {description or '—'}\n"
                        f"Fälligkeit: {due_date or 'kein Datum'}\n"
                        f"Quadrant: {quadrant.label}"
                    ),
                },
            ],
            response_model=TaskAIProposal,
        )
        validated = TaskAIProposal.model_validate(proposal.model_dump() | {"start_date": today, "due_date": due_date})
        return AISuggestion(validated, from_ai=True)
    except LLMError:
        return AISuggestion(_fallback_task_proposal(title, due_date=due_date), from_ai=False)


def _render_task_proposal_editor(*, due_date: Optional[date]) -> Optional[TaskAIProposal]:
    if not st.session_state.get(TASK_AI_PROPOSAL_KEY):
        return None

    try:
        proposal = TaskAIProposal.model_validate(
            st.session_state[TASK_AI_PROPOSAL_KEY] | {"start_date": date.today(), "due_date": due_date}
        )
    except Exception:
        return None

    st.markdown("###### AI: Plan & Komplexität / Plan & complexity")
    st.caption("Vorschlag prüfen, Felder anpassen und optional übernehmen.")

    complexity_score = st.number_input(
        "Komplexität (1-5)",
        min_value=1,
        max_value=5,
        value=int(proposal.complexity_score),
        key=f"{TASK_AI_PROPOSAL_KEY}_complexity",
    )
    estimated_minutes = st.number_input(
        "Geschätzte Minuten / Estimated minutes",
        min_value=0,
        value=int(proposal.estimated_minutes),
        key=f"{TASK_AI_PROPOSAL_KEY}_minutes",
    )
    suggested_quadrant = st.selectbox(
        "Quadrant-Vorschlag / Quadrant suggestion",
        options=list(EisenhowerQuadrant),
        index=list(EisenhowerQuadrant).index(proposal.suggested_quadrant),
        format_func=lambda option: option.label,
        key=f"{TASK_AI_PROPOSAL_KEY}_quadrant",
    )
    suggested_priority = st.selectbox(
        "Priorität (1=hoch) / Priority (1=high)",
        options=list(range(1, 6)),
        index=list(range(1, 6)).index(proposal.suggested_priority),
        key=f"{TASK_AI_PROPOSAL_KEY}_priority",
    )

    milestone_entries: list[MilestonePlanItem] = []
    for idx, item in enumerate(proposal.milestone_plan):
        st.divider()
        milestone_title = st.text_input(
            f"Milestone #{idx + 1}",
            value=item.title,
            key=f"{TASK_AI_PROPOSAL_KEY}_title_{idx}",
        )
        suggested_due = st.date_input(
            f"Fällig #{idx + 1}",
            value=item.suggested_due or due_date or date.today(),
            key=f"{TASK_AI_PROPOSAL_KEY}_due_{idx}",
            format="YYYY-MM-DD",
        )
        effort_value = st.number_input(
            f"Aufwand #{idx + 1}",
            min_value=0,
            value=int(item.effort),
            key=f"{TASK_AI_PROPOSAL_KEY}_effort_{idx}",
        )
        points_value = st.number_input(
            f"Punkte #{idx + 1}",
            min_value=0,
            value=int(item.suggested_points),
            key=f"{TASK_AI_PROPOSAL_KEY}_points_{idx}",
        )
        milestone_entries.append(
            MilestonePlanItem(
                title=milestone_title,
                suggested_due=suggested_due,
                effort=int(effort_value),
                suggested_points=int(points_value),
            )
        )

    try:
        updated = TaskAIProposal(
            complexity_score=int(complexity_score),
            estimated_minutes=int(estimated_minutes),
            suggested_quadrant=suggested_quadrant,
            suggested_priority=int(suggested_priority),
            milestone_plan=milestone_entries,
            start_date=date.today(),
            due_date=due_date,
        )
    except Exception:
        st.warning("Vorschlag konnte nicht validiert werden.")
        return None
    st.session_state[TASK_AI_PROPOSAL_KEY] = updated.model_dump()

    st.checkbox(
        "Diese Werte übernehmen / Apply these values",
        key=TASK_AI_PROPOSAL_APPLY_KEY,
        help="Aktiviere die Übernahme vor dem Speichern.",
    )

    return updated


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
    st.session_state[TODO_TEMPLATE_LAST_APPLIED_KEY] = template.key


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


def gamification_snapshot() -> GamificationState:
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


def handle_completion_success(todo: TodoItem, *, previous_state: GamificationState | None = None) -> None:
    before_state = previous_state or gamification_snapshot()
    after_state = get_gamification_state()
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
    previous_state = gamification_snapshot()
    updated = toggle_complete(todo.id)
    if updated and updated.completed:
        handle_completion_success(updated, previous_state=previous_state)
        process_event(build_completion_event(updated))
        st.session_state[JOURNAL_COMPLETION_PROMPT_KEY] = {
            "todo_id": updated.id,
            "title": updated.title,
            "category": updated.category.value,
        }
    st.rerun()


def _render_completion_journal_prompt(todos: Sequence[TodoItem]) -> None:
    prompt_data = st.session_state.get(JOURNAL_COMPLETION_PROMPT_KEY)
    if not isinstance(prompt_data, Mapping):
        return

    todo_lookup = {todo.id: todo for todo in todos}
    todo_id = str(prompt_data.get("todo_id", ""))
    target = todo_lookup.get(todo_id)
    if not target:
        st.session_state.pop(JOURNAL_COMPLETION_PROMPT_KEY, None)
        st.session_state.pop(JOURNAL_COMPLETION_NOTE_KEY, None)
        return

    reflection_note = st.session_state.get(JOURNAL_COMPLETION_NOTE_KEY, "")
    with st.expander(translate_text(("Reflexion zum Abschluss", "Reflect on completion")), expanded=True):
        st.info(
            translate_text(
                (
                    "Kurze Notiz zum Abschluss im heutigen Tagebuch speichern.",
                    "Capture a short note for today's journal entry.",
                )
            ),
            icon="📝",
        )
        note_value = st.text_area(
            translate_text(("Reflexion oder Lerneffekt", "Reflection or takeaway")),
            value=str(reflection_note),
            key=JOURNAL_COMPLETION_NOTE_KEY,
            placeholder=translate_text(("Was hat gut funktioniert?", "What went well?")),
        )
        action_cols = st.columns([1, 1])
        with action_cols[0]:
            save_clicked = st.button(
                translate_text(("Notiz im Tagebuch speichern", "Save note to journal")),
                type="primary",
                key=f"save_completion_note_{todo_id}",
            )
        with action_cols[1]:
            skip_clicked = st.button(
                translate_text(("Später", "Later")),
                key=f"skip_completion_note_{todo_id}",
            )

        if save_clicked:
            today = date.today()
            entry = get_journal_entry(today) or JournalEntry(date=today)
            completion_text = translate_text(
                (
                    f"Aufgabe abgeschlossen: {target.title}",
                    f"Task completed: {target.title}",
                )
            )
            if note_value.strip():
                completion_text = f"{completion_text} – {note_value.strip()}"
            triggers = entry.triggers_and_reactions.strip()
            updated_triggers = f"{triggers}\n- {completion_text}" if triggers else f"- {completion_text}"
            categories = list(entry.categories)
            if target.category not in categories:
                categories.append(target.category)
            updated_entry = entry.model_copy(
                update={
                    "triggers_and_reactions": updated_triggers,
                    "categories": categories,
                }
            )
            updated_entry = append_journal_links(updated_entry, [target.id])
            upsert_journal_entry(updated_entry)
            st.success(translate_text(("Notiz im Tagebuch gespeichert.", "Saved note to journal.")))
            st.session_state.pop(JOURNAL_COMPLETION_PROMPT_KEY, None)
            st.session_state.pop(JOURNAL_COMPLETION_NOTE_KEY, None)
            st.rerun()

        if skip_clicked:
            st.session_state.pop(JOURNAL_COMPLETION_PROMPT_KEY, None)
            st.session_state.pop(JOURNAL_COMPLETION_NOTE_KEY, None)
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

    for column_index, (column, container) in enumerate(zip(ordered_columns, column_containers, strict=True)):
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
    for status, column in zip(status_order, status_columns, strict=True):
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


def render_task_row(
    todo: TodoItem,
    *,
    parent: Any | None = None,
    journal_links: Mapping[str, list[date]] | None = None,
) -> None:
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

            mentions = journal_links.get(todo.id, []) if journal_links else []
            if mentions:
                mention_dates = ", ".join(entry_date.isoformat() for entry_date in mentions[:3])
                st.caption(
                    translate_text(
                        (
                            f"Journal-Notizen am: {mention_dates}",
                            f"Journal mentions on: {mention_dates}",
                        )
                    )
                )

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


def render_task_list_view(todos: list[TodoItem], *, journal_links: Mapping[str, list[date]] | None = None) -> None:
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

    filter_label = translate_text(("Filter & Sortierung", "Filters & sorting"))
    with st.expander(filter_label, expanded=False):
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
            current_sort: SortOverride = (
                cast(SortOverride, current_sort_value)
                if isinstance(current_sort_value, str) and current_sort_value in sort_labels
                else "priority"
            )
            sort_override_options: list[SortOverride] = list(sort_labels.keys())
            sort_override: SortOverride = st.selectbox(
                "Sortierung",
                options=sort_override_options,
                format_func=lambda key: sort_labels[key],
                index=sort_override_options.index(current_sort),
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
            sorted_todos = sorted(category_todos, key=lambda item: _task_sort_key(item, sort_override))
            preview_tasks = sorted_todos[:3]
            remaining_tasks = sorted_todos[3:]

            for todo in preview_tasks:
                render_task_row(todo, parent=task_list_container, journal_links=journal_links)

            if remaining_tasks:
                more_label = translate_text(
                    (
                        f"Mehr anzeigen ({len(remaining_tasks)})",
                        f"Show more ({len(remaining_tasks)})",
                    )
                )
                with st.expander(more_label, expanded=False):
                    for todo in remaining_tasks:
                        render_task_row(todo, parent=task_list_container, journal_links=journal_links)
        st.markdown("</div>", unsafe_allow_html=True)


def render_todo_section(
    ai_enabled: bool,
    client: Optional[OpenAI],
    *,
    todos: Optional[list[TodoItem]] = None,
    stats: Optional[KpiStats] = None,
    journal_links: Optional[Mapping[str, list[date]]] = None,
) -> None:
    template_state_key = TODO_TEMPLATE_LAST_APPLIED_KEY
    todos = todos or get_todos()
    journal_links = journal_links or get_journal_links_by_todo()
    quadrant_options = list(EisenhowerQuadrant)

    hero_left, hero_right = st.columns([0.6, 0.4])
    with hero_left:
        _render_daily_plan_panel(ai_enabled=ai_enabled, client=client, todos=todos, stats=stats)

    with hero_right:
        _render_completion_journal_prompt(todos)

    divider = getattr(st, "divider", None)
    if callable(divider):
        divider()
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
            TASK_AI_PROPOSAL_KEY,
            TASK_AI_PROPOSAL_APPLY_KEY,
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
    st.session_state.setdefault(TASK_AI_PROPOSAL_KEY, {})
    st.session_state.setdefault(TASK_AI_PROPOSAL_APPLY_KEY, False)

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
            analyze_plan = st.form_submit_button(
                "AI: Plan & Komplexität vorschlagen",
                disabled=not ai_enabled,
                help="Schätzt Aufwand, Priorität und Unterziele",
                key="analyze_plan_proposal",
            )
            if analyze_plan:
                if not title.strip():
                    st.warning("Bitte Titel ergänzen")
                else:
                    quadrant_guess = st.session_state.get(
                        NEW_TODO_QUADRANT_KEY, EisenhowerQuadrant.NOT_URGENT_IMPORTANT
                    )
                    description_text = st.session_state.get(NEW_TODO_DESCRIPTION_KEY, "")
                    plan_suggestion = _request_task_proposal(
                        title=title,
                        description=description_text,
                        due_date=due_date,
                        quadrant=quadrant_guess,
                        client=client if ai_enabled else None,
                    )
                    st.session_state[TASK_AI_PROPOSAL_KEY] = plan_suggestion.payload.model_dump()
                    st.session_state[TASK_AI_PROPOSAL_APPLY_KEY] = False
                    label = "KI-Vorschlag" if plan_suggestion.from_ai else "Fallback"
                    st.info(f"{label}: Plan aktualisiert.")

            _render_task_proposal_editor(due_date=due_date)
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
                apply_proposal = bool(st.session_state.get(TASK_AI_PROPOSAL_APPLY_KEY))
                if apply_proposal and st.session_state.get(TASK_AI_PROPOSAL_KEY):
                    try:
                        proposal_model = TaskAIProposal.model_validate(
                            st.session_state[TASK_AI_PROPOSAL_KEY] | {"start_date": date.today(), "due_date": due_date}
                        )
                        quadrant = proposal_model.suggested_quadrant
                        priority = proposal_model.suggested_priority
                        for item in proposal_model.milestone_plan:
                            draft_milestones.append(
                                {
                                    "title": item.title,
                                    "complexity": MilestoneComplexity.MEDIUM.value,
                                    "points": max(0, int(item.suggested_points)),
                                    "note": f"AI-Plan (Aufwand {item.effort})",
                                    "due_date": item.suggested_due.isoformat() if item.suggested_due else None,
                                }
                            )
                        st.session_state[NEW_TODO_DRAFT_MILESTONES_KEY] = draft_milestones
                    except Exception:
                        st.warning("AI-Vorschlag konnte nicht übernommen werden.")

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
        render_task_list_view(todos, journal_links=journal_links)

    with board_tab:
        st.subheader("Eisenhower-Matrix")
        grouped = group_by_quadrant(sort_todos(todos, by="due_date"))
        quadrant_columns = st.columns(4)
        for quadrant, column in zip(EisenhowerQuadrant, quadrant_columns, strict=True):
            render_quadrant_board(column, quadrant, grouped.get(quadrant, []), journal_links=journal_links)

    with calendar_tab:
        render_calendar_view()


def render_quadrant_focus_items(todos: list[TodoItem]) -> None:
    focus_quadrants = (
        EisenhowerQuadrant.URGENT_IMPORTANT,
        EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
    )
    st.markdown("#### Fokusaufgaben")
    st.caption("Prüfe die wichtigsten Aufgaben aus den Aufgabenansichten und ihre Unterziele.")

    focus_columns = st.columns(2)
    for quadrant, column in zip(focus_quadrants, focus_columns, strict=True):
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
                    due_label = translate_text(("Fällig", "Due"))
                    due_value = (
                        todo.due_date.date().isoformat() if todo.due_date else translate_text(("Kein Datum", "No date"))
                    )
                    st.caption(f"{due_label}: {due_value}")

                    if todo.milestones:
                        st.caption("Unterziele")
                        for milestone in todo.milestones:
                            milestone_note = f" — {milestone.note}" if milestone.note.strip() else ""
                            points_label = translate_text(("Punkte", "points"))
                            st.markdown(
                                f"- {milestone.title} ({milestone.status.label}, {points_label}: {milestone.points})"
                                f"{milestone_note}"
                            )


def render_quadrant_board(
    container: st.delta_generator.DeltaGenerator,
    quadrant: EisenhowerQuadrant,
    todos: list[TodoItem],
    *,
    journal_links: Mapping[str, list[date]] | None = None,
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
            render_todo_card(todo, journal_links=journal_links)


def _render_daily_plan_panel(
    *, ai_enabled: bool, client: Optional[OpenAI], todos: list[TodoItem], stats: Optional[KpiStats]
) -> None:
    container_factory = getattr(st, "container", None)
    if container_factory is None:
        return

    plan_container = container_factory()
    if not hasattr(plan_container, "markdown"):
        return
    plan_container.markdown("### KI-Planung heute / AI planning today")
    plan_container.caption(
        translate_text(
            (
                "Morgendliche Empfehlung nach Quadrant, Priorität, Fälligkeit und Stimmung.",
                "Morning suggestion based on quadrant, priority, due date, and mood.",
            )
        )
    )

    journal_entries = get_journal_entries()
    plan = suggest_daily_plan(
        todos=todos,
        stats=stats,
        journal_entries=journal_entries,
        client=client if ai_enabled else None,
    )
    payload: DailyPlanningSuggestion = cast(DailyPlanningSuggestion, plan.payload)

    with plan_container.container(border=True):
        source_label = translate_text(("Quelle", "Source"))
        plan_container.caption(f"{source_label}: {'KI' if plan.from_ai else 'Fallback'}")
        plan_container.markdown(f"**{payload.headline}**")
        if payload.mood_advice:
            plan_container.info(payload.mood_advice)

        if payload.focus_items:
            due_label = translate_text(("Fällig", "Due"))
            for item in payload.focus_items:
                try:
                    quadrant = EisenhowerQuadrant(item.quadrant)
                except ValueError:
                    quadrant = EisenhowerQuadrant.NOT_URGENT_IMPORTANT

                due_value = item.due_date or translate_text(("Kein Datum", "No date"))
                recommendation = item.recommendation.strip() or translate_text(
                    ("Fokus-Block einplanen", "Schedule one focus block")
                )
                priority_hint = f" · {item.priority_hint}" if item.priority_hint else ""
                plan_container.markdown(
                    (
                        f"- {quadrant_badge(quadrant, include_full_label=True)} — **{item.title}**<br>"
                        f"  {recommendation} ({due_label}: {due_value}){priority_hint}"
                    ),
                    unsafe_allow_html=True,
                )
        else:
            plan_container.caption(translate_text(("Keine offenen Empfehlungen", "No open recommendations")))

        if payload.buffer_tip:
            plan_container.success(payload.buffer_tip)


def render_todo_card(todo: TodoItem, *, journal_links: Mapping[str, list[date]] | None = None) -> None:
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

        mentions = journal_links.get(todo.id, []) if journal_links else []
        if mentions:
            mention_dates = ", ".join(entry_date.isoformat() for entry_date in mentions[:3])
            st.caption(
                translate_text(
                    (
                        f"Im Tagebuch erwähnt am: {mention_dates}",
                        f"Mentioned in the journal on: {mention_dates}",
                    )
                )
            )

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


def render_tasks_page(
    *, ai_enabled: bool, client: Optional[OpenAI], todos: list[TodoItem], stats: Optional[KpiStats] = None
) -> None:
    st.header("Aufgaben")
    st.caption("Verwalte und plane deine Aufgaben. Ziele & KI konfigurierst du im Bereich 'Ziele'.")
    render_todo_section(ai_enabled=ai_enabled, client=client, todos=todos, stats=stats)
