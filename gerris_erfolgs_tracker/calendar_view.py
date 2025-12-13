from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from typing import Iterable, Optional

import streamlit as st

from gerris_erfolgs_tracker.models import TodoItem
from gerris_erfolgs_tracker.state import get_todos


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


def _render_day_cell(day: Optional[int], tasks_by_day: dict[int, list[TodoItem]]) -> None:
    with st.container(border=True):
        if day is None:
            st.write("\u00a0")
            return

        st.markdown(f"**{day}**")
        tasks = tasks_by_day.get(day, [])
        if not tasks:
            st.caption("Keine Aufgaben / No tasks")
            return

        for task in tasks:
            status = "⏳" if not task.completed else "✅"
            st.write(f"{status} {task.title}")


def render_calendar_view() -> None:
    st.subheader("Kalenderansicht / Calendar view")
    selected_date = st.date_input(
        "Monat auswählen / Select month",
        value=date.today().replace(day=1),
        format="YYYY-MM-DD",
    )

    if isinstance(selected_date, list):
        selected_date = selected_date[0]

    month = selected_date.month
    year = selected_date.year

    show_only_open = st.checkbox("Nur offene Aufgaben / Only open tasks", value=False)

    todos = get_todos()
    tasks_by_day = _group_tasks_by_day(
        todos,
        month,
        year,
        open_only=show_only_open,
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
                _render_day_cell(day, tasks_by_day)


__all__ = ["render_calendar_view"]
