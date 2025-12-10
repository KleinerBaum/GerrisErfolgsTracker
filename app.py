from __future__ import annotations

from datetime import date
from typing import Any, Optional

import pandas as pd
import streamlit as st
from openai import OpenAI

from gerris_erfolgs_tracker.ai_features import (
    AISuggestion,
    generate_motivation,
    suggest_goals,
    suggest_quadrant,
)
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
    update_gamification_on_completion,
)
from gerris_erfolgs_tracker.kpis import (
    get_kpi_stats,
    get_weekly_completion_counts,
    update_goal_daily,
    update_kpis_on_completion,
)
from gerris_erfolgs_tracker.llm import get_default_model, get_openai_client
from gerris_erfolgs_tracker.models import KpiStats, TodoItem
from gerris_erfolgs_tracker.state import get_todos, init_state
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


def _ensure_ai_toggle(default_enabled: bool) -> bool:
    if AI_ENABLED_KEY not in st.session_state:
        st.session_state[AI_ENABLED_KEY] = default_enabled
    return bool(st.session_state[AI_ENABLED_KEY])


def render_todo_section(ai_enabled: bool, client: Optional[OpenAI]) -> None:
    kpi_stats = get_kpi_stats()
    todos = get_todos()
    quadrant_options = list(EisenhowerQuadrant)

    st.subheader("ToDo hinzufügen / Add task")

    st.session_state.setdefault("new_todo_title", "")
    st.session_state.setdefault("new_todo_due", None)
    st.session_state.setdefault(
        "new_todo_quadrant", EisenhowerQuadrant.URGENT_IMPORTANT
    )

    with st.form("add_todo_form", clear_on_submit=False):
        title = st.text_input(
            "Titel / Title",
            key="new_todo_title",
            placeholder="Nächstes ToDo eingeben / Enter next task",
        )
        col_left, col_right = st.columns(2)
        with col_left:
            due_date: Optional[date] = st.date_input(
                "Fälligkeitsdatum / Due date",
                value=st.session_state.get("new_todo_due"),
                key="new_todo_due",
                format="YYYY-MM-DD",
            )
        with col_right:
            quadrant = st.selectbox(
                "Eisenhower-Quadrant / Quadrant",
                quadrant_options,
                key="new_todo_quadrant",
                format_func=lambda option: option.label,
            )

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
                suggestion: AISuggestion[Any] = suggest_quadrant(
                    title.strip(), client=client if ai_enabled else None
                )
                st.session_state["new_todo_quadrant"] = EisenhowerQuadrant(
                    suggestion.payload.quadrant
                )
                st.session_state[AI_QUADRANT_RATIONALE_KEY] = (
                    suggestion.payload.rationale
                )
                label = (
                    "KI-Vorschlag / AI suggestion" if suggestion.from_ai else "Fallback"
                )
                st.info(f"{label}: {suggestion.payload.rationale}")
                st.rerun()

        if submitted:
            if not title.strip():
                st.warning("Bitte Titel angeben / Please provide a title.")
            else:
                add_todo(title=title.strip(), quadrant=quadrant, due_date=due_date)
                st.success("ToDo gespeichert / Task saved.")
                st.session_state["new_todo_title"] = ""
                st.session_state["new_todo_due"] = None
                st.session_state[AI_QUADRANT_RATIONALE_KEY] = None
                st.rerun()

    rationale = st.session_state.get(AI_QUADRANT_RATIONALE_KEY)
    if rationale:
        st.caption(
            f"Begründung (übersteuerbar) / Rationale (you can override): {rationale}"
        )

    filter_selection = st.radio(
        "Filter", ["Alle / All", "Offen / Open", "Erledigt / Done"], horizontal=True
    )

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

    render_kpi_dashboard(kpi_stats, ai_enabled=ai_enabled, client=client)
    render_gamification_panel(kpi_stats, ai_enabled=ai_enabled, client=client)
    st.subheader("Eisenhower-Matrix")
    quadrant_columns = st.columns(4)
    for quadrant, column in zip(EisenhowerQuadrant, quadrant_columns):
        render_quadrant_board(column, quadrant, grouped.get(quadrant, []))


def render_kpi_dashboard(
    stats: KpiStats, *, ai_enabled: bool, client: Optional[OpenAI]
) -> None:
    st.subheader("KPI-Dashboard")
    col_total, col_today, col_streak, col_goal = st.columns(4)

    col_total.metric("Erledigt gesamt / Done total", stats.done_total)
    col_today.metric("Heute erledigt / Done today", stats.done_today)
    col_streak.metric("Kontinuität / Streak", f"{stats.streak} Tage / days")

    goal_delta = (
        "🎯 Ziel erreicht / Goal achieved"
        if stats.goal_hit_today
        else "Noch nicht erreicht / Not reached yet"
    )
    col_goal.metric(
        "Zielerreichung / Goal progress",
        f"{stats.done_today}/{stats.goal_daily}",
        delta=goal_delta,
    )

    st.caption("Wochenübersicht der Abschlüsse / Week view of completions")
    weekly_data = get_weekly_completion_counts(stats)
    chart_data = pd.DataFrame(weekly_data).set_index("date")
    chart_data.rename(columns={"completions": "Abschlüsse / Completions"}, inplace=True)
    st.bar_chart(chart_data)

    st.markdown("#### Zielsetzung / Goal setting")
    st.session_state.setdefault("goal_daily_input", stats.goal_daily)
    goal_col, ai_goal_col = st.columns([2, 1])
    new_goal = goal_col.number_input(
        "Tagesziel / Daily goal",
        min_value=1,
        step=1,
        value=int(st.session_state.get("goal_daily_input", stats.goal_daily)),
        key="goal_daily_input",
        help="Definiere ein realistisches Tagesziel / Define a realistic daily target.",
    )

    if goal_col.button("Ziel speichern / Save goal", key="save_goal_btn"):
        update_goal_daily(int(new_goal))
        st.success("Tagesziel aktualisiert / Daily goal updated.")
        st.session_state[AI_GOAL_SUGGESTION_KEY] = None
        st.rerun()

    if ai_goal_col.button(
        "AI: Ziel vorschlagen / Suggest goal",
        key="ai_goal_btn",
        disabled=not ai_enabled,
        help=(
            "Lässt OpenAI einen Vorschlag machen; ohne Schlüssel wird ein Fallback genutzt / "
            "Let OpenAI suggest a goal; without a key a fallback is used."
        ),
    ):
        suggestion = suggest_goals(stats, client=client if ai_enabled else None)
        st.session_state[AI_GOAL_SUGGESTION_KEY] = suggestion
        st.session_state["goal_daily_input"] = suggestion.payload.daily_goal
        st.rerun()

    goal_suggestion: AISuggestion[Any] | None = st.session_state.get(
        AI_GOAL_SUGGESTION_KEY
    )
    if goal_suggestion:
        badge = "🤖" if goal_suggestion.from_ai else "🧭"
        tips = " · ".join(goal_suggestion.payload.tips)
        st.info(
            f"{badge} {goal_suggestion.payload.focus} — "
            f"{goal_suggestion.payload.daily_goal} Ziele / goals. {tips}"
        )


def render_gamification_panel(
    stats: KpiStats, *, ai_enabled: bool, client: Optional[OpenAI]
) -> None:
    gamification_state = get_gamification_state()
    st.subheader("Gamification")

    col_level, col_points = st.columns(2)
    col_level.metric("Level", gamification_state.level)
    col_points.metric("Punkte / Points", gamification_state.points)

    progress_points, required_points, progress_ratio = calculate_progress_to_next_level(
        gamification_state
    )
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

    st.markdown("#### Badges")
    if gamification_state.badges:
        badge_labels = " ".join(f"🏅 {badge}" for badge in gamification_state.badges)
        st.markdown(
            f"{badge_labels}<br/>"
            "(jede Auszeichnung wird nur einmal vergeben / each badge is awarded once)",
            unsafe_allow_html=True,
        )
    else:
        st.caption(
            "Noch keine Badges gesammelt / No badges earned yet. Arbeite an deinen Zielen!"
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
        st.session_state[AI_MOTIVATION_KEY] = generate_motivation(
            stats, client=client if ai_enabled else None
        )
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
            st.caption(
                "Keine Aufgaben in diesem Quadranten / No tasks in this quadrant."
            )
            return

        for todo in todos:
            render_todo_card(todo)


def render_todo_card(todo: TodoItem) -> None:
    with st.container(border=True):
        status = "✅ Erledigt / Done" if todo.completed else "⏳ Offen / Open"
        due_text = (
            todo.due_date.date().isoformat() if todo.due_date is not None else "—"
        )
        st.markdown(f"**{todo.title}**")
        st.caption(
            f"📅 Fällig / Due: {due_text} · 🧭 Quadrant: {todo.quadrant.label} · {status}"
        )

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
                submitted_edit = st.form_submit_button("Speichern / Save")
                if submitted_edit:
                    update_todo(
                        todo.id,
                        title=new_title.strip(),
                        quadrant=new_quadrant,
                        due_date=new_due,
                    )
                    st.success("Aktualisiert / Updated.")
                    st.rerun()


def main() -> None:
    st.set_page_config(page_title="Gerris ErfolgsTracker", page_icon="✅")
    init_state()
    st.title("Gerris ErfolgsTracker")

    client = get_openai_client()
    ai_enabled_default = bool(client)
    ai_enabled = _ensure_ai_toggle(ai_enabled_default)
    ai_enabled = st.toggle(
        "AI aktiv / AI enabled",
        key=AI_ENABLED_KEY,
        value=ai_enabled,
        help=(
            "Aktiviere KI-gestützte Vorschläge. Ohne Schlüssel werden Fallback-Texte genutzt / "
            "Enable AI suggestions. Without a key, fallback texts are used."
        ),
    )
    if not client:
        st.info(
            "Kein OPENAI_API_KEY gefunden. Vorschläge nutzen Fallbacks, bis ein Key in "
            "st.secrets oder der Umgebung hinterlegt ist."
        )
    else:
        st.caption(
            f"Aktives Modell: {get_default_model()} (konfigurierbar via OPENAI_MODEL)."
        )

    st.header("ToDos / Tasks")
    render_todo_section(ai_enabled=ai_enabled, client=client)

    st.divider()
    render_calendar_view()


if __name__ == "__main__":
    main()
