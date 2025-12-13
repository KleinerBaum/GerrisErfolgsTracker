from __future__ import annotations

from datetime import date
from typing import Any, Optional

import streamlit as st
from openai import OpenAI

from gerris_erfolgs_tracker.ai_features import (
    AISuggestion,
    generate_motivation,
    suggest_goals,
    suggest_quadrant,
)
from gerris_erfolgs_tracker.charts import build_weekly_completion_figure
from gerris_erfolgs_tracker.constants import SS_SETTINGS
from gerris_erfolgs_tracker.calendar_view import render_calendar_view
from gerris_erfolgs_tracker.eisenhower import (
    EisenhowerQuadrant,
    SortKey,
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
from gerris_erfolgs_tracker.llm import get_default_model, get_openai_client
from gerris_erfolgs_tracker.models import Category, GamificationMode, KpiStats, TodoItem
from gerris_erfolgs_tracker.state import get_todos, init_state, reset_state
from gerris_erfolgs_tracker.todos import (
    add_todo,
    delete_todo,
    toggle_complete,
    update_todo,
)


AI_ENABLED_KEY = "ai_enabled"
AI_QUADRANT_RATIONALE_KEY = "ai_quadrant_rationale"
AI_GOAL_SUGGESTION_KEY = "ai_goal_suggestion"
AI_MOTIVATION_KEY = "ai_motivation_message"
GOAL_SUGGESTED_VALUE_KEY = "suggested_goal_daily"
NEW_TODO_TITLE_KEY = "new_todo_title"
NEW_TODO_DUE_KEY = "new_todo_due"
NEW_TODO_QUADRANT_KEY = "new_todo_quadrant"
NEW_TODO_QUADRANT_PREFILL_KEY = "new_todo_quadrant_prefill"
NEW_TODO_RESET_TRIGGER_KEY = "new_todo_reset_trigger"
NEW_TODO_CATEGORY_KEY = "new_todo_category"
NEW_TODO_PRIORITY_KEY = "new_todo_priority"
NEW_TODO_DESCRIPTION_KEY = "new_todo_description"


def _ensure_settings_defaults(*, client: Optional[OpenAI], stats: KpiStats) -> dict[str, Any]:
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    if not isinstance(settings, dict):
        settings = {}

    settings.setdefault(AI_ENABLED_KEY, bool(client))
    settings.setdefault("goal_daily", stats.goal_daily)
    settings.setdefault("gamification_mode", GamificationMode.POINTS.value)

    st.session_state[SS_SETTINGS] = settings
    return settings


def _resolve_goal_input_value(settings: dict[str, Any], stats: KpiStats) -> int:
    suggested_goal = st.session_state.get(GOAL_SUGGESTED_VALUE_KEY)
    existing_goal_value = st.session_state.get("settings_goal_daily")
    default_goal = int(settings.get("goal_daily", stats.goal_daily))

    if suggested_goal is not None:
        resolved_goal = int(suggested_goal)
    elif existing_goal_value is not None:
        resolved_goal = int(existing_goal_value)
    else:
        resolved_goal = default_goal

    st.session_state["settings_goal_daily"] = resolved_goal
    return resolved_goal


def render_settings_panel(stats: KpiStats, client: Optional[OpenAI]) -> bool:
    st.sidebar.header("Einstellungen / Settings")

    settings = _ensure_settings_defaults(client=client, stats=stats)

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

    st.sidebar.markdown("### Tagesziel / Daily goal")
    goal_input_value = _resolve_goal_input_value(settings=settings, stats=stats)
    goal_value = st.sidebar.number_input(
        "Ziel pro Tag / Target per day",
        min_value=1,
        step=1,
        value=goal_input_value,
        key="settings_goal_daily",
        help=("Lege ein realistisches Tagesziel fest / Set a realistic daily target."),
    )
    settings["goal_daily"] = int(goal_value)

    goal_action_cols = st.sidebar.columns(2)
    with goal_action_cols[0]:
        if goal_action_cols[0].button("Ziel speichern / Save goal", key="settings_save_goal"):
            update_goal_daily(int(goal_value))
            st.sidebar.success("Tagesziel aktualisiert / Daily goal updated.")
            st.rerun()

    with goal_action_cols[1]:
        if goal_action_cols[1].button(
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

    goal_suggestion: AISuggestion[Any] | None = st.session_state.get(AI_GOAL_SUGGESTION_KEY)
    if goal_suggestion:
        badge = "🤖" if goal_suggestion.from_ai else "🧭"
        tips = " · ".join(goal_suggestion.payload.tips)
        st.sidebar.info(
            f"{badge} {goal_suggestion.payload.focus} — {goal_suggestion.payload.daily_goal} Ziele / goals. {tips}"
        )

    st.sidebar.divider()
    st.sidebar.markdown("### Gamification-Stil / Gamification style")
    gamification_mode_options = list(GamificationMode)
    current_mode_value = settings.get("gamification_mode", GamificationMode.POINTS.value)
    try:
        current_mode = GamificationMode(current_mode_value)
    except ValueError:
        current_mode = GamificationMode.POINTS

    selected_mode = st.sidebar.selectbox(
        "Gamification-Variante / Gamification mode",
        options=gamification_mode_options,
        format_func=lambda option: option.label,
        index=gamification_mode_options.index(current_mode),
        help=(
            "Wähle Punkte, Abzeichen oder die motivierende Avatar-Option Dipl.-Psych. Roß / "
            "Choose points, badges, or the motivational avatar option Dipl.-Psych. Roß."
        ),
    )
    settings["gamification_mode"] = selected_mode.value

    st.sidebar.caption(
        "Dipl.-Psych. Roß steht für warme, therapeutische Motivation (Brünette, ca. 45 Jahre, Brille) / "
        "Dipl.-Psych. Roß offers warm, therapeutic motivation (brunette, about 45 years old, with glasses)."
    )

    st.sidebar.divider()
    st.sidebar.subheader("Sicherheit & Daten / Safety & data")
    st.sidebar.info(
        "Alle Angaben bleiben im Session-State und werden nicht gespeichert / "
        "All data stays in session state only (not persisted)."
    )
    st.sidebar.warning(
        "Dieses Tool ersetzt keine Krisenhilfe oder Diagnosen / This tool is not "
        "a crisis or diagnostic service. Bei akuten Notfällen wende dich an lokale "
        "Hotlines / In emergencies, contact local hotlines."
    )

    if st.sidebar.button(
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
            "new_todo_title",
            "new_todo_due",
            "new_todo_quadrant",
            "settings_goal_daily",
            GOAL_SUGGESTED_VALUE_KEY,
        ):
            st.session_state.pop(cleanup_key, None)
        reset_state()
        st.sidebar.success("Session zurückgesetzt / Session reset.")
        st.rerun()

    st.session_state[SS_SETTINGS] = settings
    return ai_enabled


def render_todo_section(ai_enabled: bool, client: Optional[OpenAI]) -> None:
    kpi_stats = get_kpi_stats()
    todos = get_todos()
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
        ):
            st.session_state.pop(cleanup_key, None)

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

    with st.form("add_todo_form", clear_on_submit=False):
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

        description_tabs = st.tabs(["Schreiben / Write", "Vorschau / Preview"])
        with description_tabs[0]:
            description_md = st.text_area(
                "Beschreibung (Markdown) / Description (markdown)",
                key=NEW_TODO_DESCRIPTION_KEY,
                placeholder=("Optional: Details, Checkliste oder Kontext / Optional: details, checklist, or context"),
            )
        with description_tabs[1]:
            preview_text = st.session_state.get(NEW_TODO_DESCRIPTION_KEY, "")
            if preview_text.strip():
                st.markdown(preview_text)
            else:
                st.caption("Keine Beschreibung vorhanden / No description yet.")

        action_cols = st.columns(2)
        suggest_quadrant_clicked = action_cols[0].form_submit_button(
            "AI: Quadrant vorschlagen / Suggest quadrant",
            disabled=not ai_enabled,
            help="Nutze OpenAI fuer eine Auto-Kategorisierung / Use OpenAI to classify the task.",
        )
        submitted = action_cols[1].form_submit_button("ToDo hinzufügen / Add task")

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
                add_todo(
                    title=title.strip(),
                    quadrant=quadrant,
                    due_date=due_date,
                    category=category,
                    priority=priority,
                    description_md=description_md,
                )
                st.success("ToDo gespeichert / Task saved.")
                st.session_state[NEW_TODO_RESET_TRIGGER_KEY] = True
                st.rerun()

    rationale = st.session_state.get(AI_QUADRANT_RATIONALE_KEY)
    if rationale:
        st.caption(f"Begründung (übersteuerbar) / Rationale (you can override): {rationale}")

    filter_selection = st.radio("Filter", ["Alle / All", "Offen / Open", "Erledigt / Done"], horizontal=True)

    filtered_todos = todos
    if "Offen" in filter_selection or "Open" in filter_selection:
        filtered_todos = [todo for todo in todos if not todo.completed]
    elif "Erledigt" in filter_selection or "Done" in filter_selection:
        filtered_todos = [todo for todo in todos if todo.completed]

    sort_labels: dict[SortKey, str] = {
        "due_date": "Nach Fälligkeit sortieren / Sort by due date",
        "created_at": "Nach Anlage-Datum sortieren / Sort by created date",
        "title": "Nach Titel sortieren / Sort by title",
    }
    sort_by: SortKey = st.selectbox(
        "Sortierung / Sorting",
        options=list(sort_labels.keys()),
        format_func=lambda key: sort_labels[key],
        index=0,
    )

    if not filtered_todos:
        st.info("Keine ToDos vorhanden / No tasks yet.")
        return

    sorted_todos = sort_todos(filtered_todos, by=sort_by)
    grouped = group_by_quadrant(sorted_todos)

    render_kpi_dashboard(kpi_stats)
    render_gamification_panel(kpi_stats, ai_enabled=ai_enabled, client=client)
    st.subheader("Eisenhower-Matrix")
    quadrant_columns = st.columns(4)
    for quadrant, column in zip(EisenhowerQuadrant, quadrant_columns):
        render_quadrant_board(column, quadrant, grouped.get(quadrant, []))


def render_kpi_dashboard(stats: KpiStats) -> None:
    st.subheader("KPI-Dashboard")
    col_total, col_today, col_streak, col_goal = st.columns(4)

    col_total.metric("Erledigt gesamt / Done total", stats.done_total)
    col_today.metric("Heute erledigt / Done today", stats.done_today)
    col_streak.metric("Kontinuität / Streak", f"{stats.streak} Tage / days")

    goal_delta = "🎯 Ziel erreicht / Goal achieved" if stats.goal_hit_today else "Noch nicht erreicht / Not reached yet"
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
        use_container_width=True,
        config={"displaylogo": False, "responsive": True},
    )

    st.info(
        "Passe das Tagesziel und die KI-Einstellungen im Seitenbereich an / "
        "Adjust the daily goal and AI settings in the sidebar."
    )


def render_gamification_panel(stats: KpiStats, *, ai_enabled: bool, client: Optional[OpenAI]) -> None:
    gamification_state = get_gamification_state()
    settings: dict[str, Any] = st.session_state.get(SS_SETTINGS, {})
    try:
        gamification_mode = GamificationMode(settings.get("gamification_mode", GamificationMode.POINTS.value))
    except ValueError:
        gamification_mode = GamificationMode.POINTS

    st.subheader("Gamification")
    st.caption(gamification_mode.label)

    if gamification_mode is GamificationMode.POINTS:
        col_level, col_points = st.columns(2)
        col_level.metric("Level", gamification_state.level)
        col_points.metric("Punkte / Points", gamification_state.points)

        (
            progress_points,
            required_points,
            progress_ratio,
        ) = calculate_progress_to_next_level(gamification_state)
        st.progress(
            progress_ratio,
            text=(
                "Fortschritt / Progress: "
                f"{progress_points}/{required_points} Punkte bis Level {gamification_state.level + 1} "
                "/ points to next level"
            ),
        )

        st.caption(
            "Aktueller Streak / Current streak: "
            f"{stats.streak} Tage / days · Erledigt gesamt / Done total: {stats.done_total}"
        )

    elif gamification_mode is GamificationMode.BADGES:
        st.markdown("#### Badges")
        if gamification_state.badges:
            badge_labels = " ".join(f"🏅 {badge}" for badge in gamification_state.badges)
            st.markdown(
                f"{badge_labels}<br/>(jede Auszeichnung wird nur einmal vergeben / each badge is awarded once)",
                unsafe_allow_html=True,
            )
        else:
            st.caption("Noch keine Badges gesammelt / No badges earned yet. Arbeite an deinen Zielen!")
        st.info(
            "Sammle Abzeichen für Meilensteine wie erste Aufgabe, 3-Tage-Streak und 10 Abschlüsse / "
            "Earn badges for milestones like your first task, a 3-day streak, and 10 completions."
        )

    else:
        st.markdown("#### Dipl.-Psych. Roß")
        st.caption(
            "Avatar: brünette Therapeutin (~45 Jahre) mit Brille, warme Ansprache / "
            "Avatar: brunette therapist (~45 years) with glasses, warm encouragement."
        )
        message_index = int(st.session_state.get("avatar_prompt_index", 0))
        avatar_message = next_avatar_prompt(message_index)
        st.info(f"👩‍⚕️ Dipl.-Psych. Roß: {avatar_message}")

        if st.button("Neuen Spruch anzeigen / Show another quote", key="avatar_prompt_btn"):
            st.session_state["avatar_prompt_index"] = message_index + 1
            st.rerun()

        st.caption(
            "Klicke erneut für weitere motivierende Botschaften im Therapiezimmer-Stil / "
            "Click again for more therapeutic, motivational messages."
        )

    motivation_col, _ = st.columns([1, 1])
    if motivation_col.button(
        "AI: Motivation / Motivation",
        key="ai_motivation_btn",
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
        st.success(f"{badge} {motivation.payload}")


def render_quadrant_board(
    container: st.delta_generator.DeltaGenerator,
    quadrant: EisenhowerQuadrant,
    todos: list[TodoItem],
) -> None:
    with container:
        st.markdown(f"### {quadrant.label}")
        if not todos:
            st.caption("Keine Aufgaben in diesem Quadranten / No tasks in this quadrant.")
            return

        for todo in todos:
            render_todo_card(todo)


def render_todo_card(todo: TodoItem) -> None:
    with st.container(border=True):
        status = "✅ Erledigt / Done" if todo.completed else "⏳ Offen / Open"
        due_text = todo.due_date.date().isoformat() if todo.due_date is not None else "—"
        st.markdown(f"**{todo.title}**")
        st.caption(f"📅 Fällig / Due: {due_text} · 🧭 Quadrant: {todo.quadrant.label} · {status}")
        st.caption(f"📂 {todo.category.label} · 🔢 Priorität / Priority: {todo.priority}")
        if todo.description_md:
            st.markdown(todo.description_md)

        action_cols = st.columns([1, 1, 1])
        if action_cols[0].button(
            "Erledigt umschalten / Toggle status",
            key=f"complete_{todo.id}",
            help="Markiere Aufgabe als erledigt oder offen / Toggle done or open",
        ):
            updated = toggle_complete(todo.id)
            if updated and updated.completed:
                stats = update_kpis_on_completion(updated.completed_at)
                update_gamification_on_completion(updated, stats)
            st.rerun()

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
            if st.button(
                "Löschen / Delete",
                key=f"delete_{todo.id}",
                help="Aufgabe entfernen / Delete task",
            ):
                delete_todo(todo.id)
                st.rerun()

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


def main() -> None:
    st.set_page_config(page_title="Gerris ErfolgsTracker", page_icon="✅")
    init_state()

    client = get_openai_client()
    stats = get_kpi_stats()
    ai_enabled = render_settings_panel(stats, client)

    st.title("Gerris ErfolgsTracker")
    if not client:
        st.info(
            "Kein OPENAI_API_KEY gefunden. Vorschläge nutzen Fallbacks, bis ein Key in "
            "st.secrets oder der Umgebung hinterlegt ist."
        )
    else:
        st.caption(f"Aktives Modell: {get_default_model()} (konfigurierbar via OPENAI_MODEL).")

    st.header("ToDos / Tasks")
    render_todo_section(ai_enabled=ai_enabled, client=client)

    st.divider()
    render_calendar_view()


if __name__ == "__main__":
    main()
