from __future__ import annotations

import os
from datetime import date
from typing import Any, Optional

import pandas as pd
import streamlit as st
from openai import OpenAI
from pydantic import BaseModel, Field

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
    update_kpis_on_completion,
)
from gerris_erfolgs_tracker.models import KpiStats, TodoItem
from gerris_erfolgs_tracker.state import get_todos, init_state
from gerris_erfolgs_tracker.todos import (
    add_todo,
    delete_todo,
    toggle_complete,
    update_todo,
)


class OpenAIConfig(BaseModel):
    """Configuration for connecting to the OpenAI API."""

    api_key: Optional[str] = Field(
        default=None,
        description="API key for authenticating with OpenAI.",
    )
    base_url: Optional[str] = Field(
        default=None,
        description="Optional custom base URL (e.g., EU endpoint).",
    )

    @classmethod
    def from_environment(cls) -> "OpenAIConfig":
        return cls(
            api_key=st.secrets.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY"),
            base_url=st.secrets.get("OPENAI_BASE_URL") or os.getenv("OPENAI_BASE_URL"),
        )

    def create_client(self) -> Optional[OpenAI]:
        if not self.api_key:
            return None

        client_kwargs: dict[str, str] = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url

        return OpenAI(**client_kwargs)  # type: ignore[arg-type]


def render_todo_section() -> None:
    kpi_stats = get_kpi_stats()
    todos = get_todos()
    quadrant_options = list(EisenhowerQuadrant)

    with st.form("add_todo_form", clear_on_submit=True):
        title = st.text_input(
            "Titel / Title",
            placeholder="Nächstes ToDo eingeben / Enter next task",
        )
        col_left, col_right = st.columns(2)
        with col_left:
            due_date: Optional[date] = st.date_input(
                "Fälligkeitsdatum / Due date",
                value=None,
                format="YYYY-MM-DD",
            )
        with col_right:
            quadrant = st.selectbox(
                "Eisenhower-Quadrant / Quadrant",
                quadrant_options,
                format_func=lambda option: option.label,
            )

        submitted = st.form_submit_button("ToDo hinzufügen / Add task")
        if submitted:
            if not title.strip():
                st.warning("Bitte Titel angeben / Please provide a title.")
            else:
                add_todo(title=title.strip(), quadrant=quadrant, due_date=due_date)
                st.success("ToDo gespeichert / Task saved.")
                st.rerun()

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

    render_kpi_dashboard(kpi_stats)
    render_gamification_panel(kpi_stats)
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


def render_gamification_panel(stats: KpiStats) -> None:
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

    st.header("ToDos / Tasks")
    render_todo_section()

    st.divider()
    st.header("OpenAI Demo")
    st.write(
        """
        Willkommen! Dieses kleine Dashboard demonstriert eine minimale Streamlit-App
        mit optionaler OpenAI-Integration. Füge einen Prompt hinzu und nutze deinen
        eigenen API-Key, um eine Antwort vom Modell zu erhalten.
        """
    )

    config = OpenAIConfig.from_environment()
    client = config.create_client()

    prompt: str = st.text_area("Eingabe / Prompt (EN/DE)", height=160)
    model: str = st.selectbox(
        "Modell", ["gpt-4o-mini", "o3-mini"], index=0, help="Standard: gpt-4o-mini"
    )

    if not config.api_key:
        st.info(
            "Kein OPENAI_API_KEY gefunden. Hinterlege den Schlüssel lokal in der "
            "Umgebung oder in den Streamlit Secrets, um Antworten zu erhalten."
        )

    if st.button("Antwort generieren"):
        if not prompt.strip():
            st.warning("Bitte gib einen Prompt ein, bevor du fortfährst.")
            st.stop()

        if not client:
            st.error(
                "Es wurde kein OPENAI_API_KEY gefunden. Lege den Key als Environment-"
                "Variable oder in Streamlit Secrets an."
            )
            st.stop()
            return

        with st.spinner("Modell wird abgefragt..."):
            try:
                response: Any = client.responses.create(
                    model=model,
                    input=[{"role": "user", "content": prompt}],
                )
                output = response.output if hasattr(response, "output") else None
                message = output[0] if output else None
                content = (
                    message.content if message and hasattr(message, "content") else None
                )
                answer = content[0].text if content else ""
                st.success("Antwort erhalten")
                st.write(answer)
            except Exception as exc:  # noqa: BLE001
                st.error(
                    "Die Anfrage an die OpenAI API ist fehlgeschlagen. Bitte prüfe deinen "
                    "Schlüssel oder versuche es später erneut."
                )
                st.exception(exc)


if __name__ == "__main__":
    main()
