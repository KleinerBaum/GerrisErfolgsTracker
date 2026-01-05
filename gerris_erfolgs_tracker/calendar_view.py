from __future__ import annotations

import html
from calendar import monthrange
from datetime import date, datetime
from typing import Iterable, Optional

import streamlit as st

from gerris_erfolgs_tracker.i18n import translate_text
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


def _ensure_calendar_styles() -> None:
    st.markdown(
        """
        <style>
            .calendar-day {
                border: 1px solid var(--gerris-border);
                background: linear-gradient(145deg, var(--gerris-surface), var(--gerris-surface-alt));
                border-radius: 12px;
                padding: 10px 12px;
                min-height: 120px;
            }

            .calendar-day--today {
                border: 2px solid var(--gerris-primary);
                box-shadow: 0 0 0 1px rgba(28, 156, 130, 0.35);
                background: linear-gradient(160deg, rgba(28, 156, 130, 0.16), var(--gerris-surface));
            }

            .calendar-day__header {
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--gerris-text);
                margin-bottom: 6px;
                font-weight: 700;
            }

            .calendar-day__badge {
                padding: 2px 8px;
                border-radius: 10px;
                background: rgba(28, 156, 130, 0.2);
                color: var(--gerris-text);
                font-size: 0.8rem;
                border: 1px solid var(--gerris-primary);
            }

            .calendar-day__tasks {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .calendar-day__task {
                color: var(--gerris-text);
                font-size: 0.95rem;
                line-height: 1.4;
            }

            .calendar-day__empty {
                color: var(--gerris-muted);
                font-size: 0.9rem;
            }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_day_cell(
    day: Optional[int],
    tasks_by_day: dict[int, list[TodoItem]],
    *,
    is_today: bool,
) -> None:
    classes = ["calendar-day"]
    if is_today:
        classes.append("calendar-day--today")

    if day is None:
        st.markdown(f'<div class="{" ".join(classes)}" aria-hidden="true">\u00a0</div>', unsafe_allow_html=True)
        return

    tasks = tasks_by_day.get(day, [])
    task_lines: list[str] = []
    for task in tasks:
        status = "⏳" if not task.completed else "✅"
        task_lines.append(f'<div class="calendar-day__task">{status} {html.escape(task.title)}</div>')

    content = "\n".join(task_lines) if task_lines else '<div class="calendar-day__empty">Keine Aufgaben</div>'
    badge = '<span class="calendar-day__badge">Heute</span>' if is_today else ""
    st.markdown(
        """
        <div class="{classes}">
            <div class="calendar-day__header">
                {badge}
                <span>{day}</span>
            </div>
            <div class="calendar-day__tasks">{tasks}</div>
        </div>
        """.format(
            classes=" ".join(classes),
            day=day,
            tasks=content,
            badge=badge,
        ),
        unsafe_allow_html=True,
    )


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
