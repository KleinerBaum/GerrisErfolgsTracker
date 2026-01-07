from __future__ import annotations

import html
from calendar import monthrange
from datetime import date, datetime, time, timezone
from typing import Iterable, Optional

import streamlit as st

from gerris_erfolgs_tracker.i18n import translate_text
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import Category, TodoItem
from gerris_erfolgs_tracker.state import get_todos
from gerris_erfolgs_tracker.todos import update_todo


def _normalize_due_date(due_date: Optional[datetime]) -> Optional[date]:
    if due_date is None:
        return None
    return due_date.date()


def _group_tasks_by_day(
    todos: Iterable[TodoItem],
    target_month: int,
    target_year: int,
    *,
    open_only: bool,
) -> dict[int, list[TodoItem]]:
    tasks_by_day: dict[int, list[TodoItem]] = {}
    for todo in todos:
        if open_only and todo.completed:
            continue

        due_date = _normalize_due_date(todo.due_date)
        if not due_date:
            continue

        if due_date.year != target_year or due_date.month != target_month:
            continue

        tasks_by_day.setdefault(due_date.day, []).append(todo)

    return tasks_by_day


def _month_grid(first_weekday: int, days_in_month: int) -> list[list[Optional[int]]]:
    weeks: list[list[Optional[int]]] = []
    current_day = 1
    current_week: list[Optional[int]] = [None] * first_weekday

    while current_day <= days_in_month:
        current_week.append(current_day)
        if len(current_week) == 7:
            weeks.append(current_week)
            current_week = []
        current_day += 1

    if current_week:
        current_week.extend([None] * (7 - len(current_week)))
        weeks.append(current_week)

    return weeks


def _ensure_calendar_styles() -> None:
    st.markdown(
        """
        <style>
            .calendar-day__badge {
                padding: 2px 8px;
                border-radius: 10px;
                background: rgba(28, 156, 130, 0.2);
                color: var(--gerris-text);
                font-size: 0.8rem;
                border: 1px solid var(--gerris-primary);
            }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _as_utc_midnight(value: Optional[date]) -> Optional[datetime]:
    if value is None:
        return None
    return datetime.combine(value, time.min, tzinfo=timezone.utc)


def _render_task_edit_form(todo: TodoItem, *, key_prefix: str) -> None:
    with st.form(f"{key_prefix}_form_{todo.id}"):
        updated_title = st.text_input(
            translate_text(("Titel", "Title")),
            value=todo.title,
            key=f"{key_prefix}_title_{todo.id}",
        )
        no_due_date = st.checkbox(
            translate_text(("Kein Fälligkeitsdatum", "No due date")),
            value=todo.due_date is None,
            key=f"{key_prefix}_no_due_{todo.id}",
        )
        new_due_value: date | None = None
        if not no_due_date:
            new_due_value = st.date_input(
                translate_text(("Fälligkeitsdatum", "Due date")),
                value=todo.due_date.date() if todo.due_date else None,
                format="YYYY-MM-DD",
                key=f"{key_prefix}_due_{todo.id}",
            )
        new_priority = st.selectbox(
            translate_text(("Priorität (1=hoch)", "Priority (1=high)")),
            options=list(range(1, 6)),
            index=list(range(1, 6)).index(todo.priority),
            key=f"{key_prefix}_priority_{todo.id}",
        )
        new_quadrant = st.selectbox(
            translate_text(("Eisenhower-Quadrant", "Eisenhower quadrant")),
            options=list(EisenhowerQuadrant),
            format_func=lambda option: option.label,
            index=list(EisenhowerQuadrant).index(todo.quadrant),
            key=f"{key_prefix}_quadrant_{todo.id}",
        )
        new_category = st.selectbox(
            translate_text(("Kategorie", "Category")),
            options=list(Category),
            format_func=lambda option: option.label,
            index=list(Category).index(todo.category),
            key=f"{key_prefix}_category_{todo.id}",
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
                key=f"{key_prefix}_description_{todo.id}",
            )
        with description_tabs[1]:
            preview = st.session_state.get(f"{key_prefix}_description_{todo.id}", "")
            if preview.strip():
                st.markdown(preview)
            else:
                st.caption(translate_text(("Keine Beschreibung vorhanden", "No description available")))

        submitted = st.form_submit_button(translate_text(("Aktualisieren", "Update")))
        if submitted:
            update_todo(
                todo.id,
                title=updated_title.strip(),
                due_date=_as_utc_midnight(new_due_value),
                priority=new_priority,
                quadrant=new_quadrant,
                category=new_category,
                description_md=new_description,
            )
            st.success(translate_text(("Aufgabe aktualisiert", "Task updated")))
            st.rerun()


def _render_day_cell(
    day: Optional[int],
    tasks_by_day: dict[int, list[TodoItem]],
    *,
    is_today: bool,
) -> None:
    if day is None:
        with st.container(border=True):
            st.markdown("&nbsp;", unsafe_allow_html=True)
        return

    tasks = tasks_by_day.get(day, [])
    with st.container(border=True):
        badge_label = translate_text(("Heute", "Today"))
        badge = f'<span class="calendar-day__badge">{badge_label}</span>' if is_today else ""
        st.markdown(f"{badge} **{day}**", unsafe_allow_html=True)
        if not tasks:
            st.caption(translate_text(("Keine Aufgaben", "No tasks")))
            return

        for task in tasks:
            status = "⏳" if not task.completed else "✅"
            title = html.escape(task.title)
            task_columns = st.columns([4, 1])
            task_columns[0].markdown(f"{status} {title}")
            with task_columns[1]:
                with st.popover(
                    translate_text(("Bearbeiten", "Edit")),
                    use_container_width=True,
                    key=f"calendar_edit_{task.id}",
                ):
                    _render_task_edit_form(task, key_prefix=f"calendar_{task.id}")


def render_calendar_view(todos: Optional[list[TodoItem]] = None, *, open_only: bool = True) -> None:
    st.subheader("Kalenderansicht")
    st.caption(
        translate_text(
            (
                "Zeigt offene Aufgaben pro Tag im ausgewählten Monat.",
                "Displays open tasks per day in the selected month.",
            )
        )
    )
    _ensure_calendar_styles()
    selected_date = st.date_input(
        "Monat auswählen",
        value=date.today().replace(day=1),
        format="YYYY-MM-DD",
    )

    if isinstance(selected_date, list):
        selected_date = selected_date[0]

    month = selected_date.month
    year = selected_date.year

    todos = todos or get_todos()
    tasks_by_day = _group_tasks_by_day(
        todos,
        month,
        year,
        open_only=open_only,
    )

    first_weekday, days_in_month = monthrange(year, month)
    weeks = _month_grid(first_weekday, days_in_month)

    weekday_labels = [
        "Mo",
        "Di",
        "Mi",
        "Do",
        "Fr",
        "Sa",
        "So",
    ]

    header_columns = st.columns(7)
    for idx, label in enumerate(weekday_labels):
        header_columns[idx].markdown(f"**{label}**")

    for week in weeks:
        week_columns = st.columns(7)
        for idx, day in enumerate(week):
            with week_columns[idx]:
                is_today = bool(
                    day and day == date.today().day and month == date.today().month and year == date.today().year
                )
                _render_day_cell(day, tasks_by_day, is_today=is_today)


__all__ = ["render_calendar_view"]
