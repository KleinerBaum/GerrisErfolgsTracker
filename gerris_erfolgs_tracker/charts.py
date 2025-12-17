from __future__ import annotations

from typing import Iterable, Mapping, Sequence

import plotly.graph_objects as go

from gerris_erfolgs_tracker.analytics import BacklogHealth, CycleTimeMetrics
from gerris_erfolgs_tracker.kpi import DailyCategoryCount
from gerris_erfolgs_tracker.models import Category

PRIMARY_COLOR = "#1C9C82"
CATEGORY_COLORS = [
    "#1C9C82",
    "#1B7F6D",
    "#2FA48E",
    "#146853",
    "#35C2A1",
]
FONT_COLOR = "#E6F2EC"
GRID_COLOR = "#24544B"


def _apply_dark_theme(figure: go.Figure) -> go.Figure:
    figure.update_layout(
        template="plotly_dark",
        font=dict(color=FONT_COLOR),
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        xaxis=dict(gridcolor=GRID_COLOR, zerolinecolor=GRID_COLOR),
        yaxis=dict(gridcolor=GRID_COLOR, zerolinecolor=GRID_COLOR),
    )
    return figure


def build_category_weekly_completion_figure(
    weekly_data: Sequence[DailyCategoryCount],
    *,
    categories: Iterable[Category] = Category,
) -> go.Figure:
    """Create a stacked bar chart per category for the last 7 days."""

    dates = [str(entry.get("date", "")) for entry in weekly_data]
    category_list = list(categories)
    bars: list[go.Bar] = []

    for index, category in enumerate(category_list):
        color = CATEGORY_COLORS[index % len(CATEGORY_COLORS)]
        counts: list[int] = []
        for entry in weekly_data:
            counts_mapping: Mapping[str, int] = entry.get("counts", {})
            counts.append(int(counts_mapping.get(category.value, 0)))

        bars.append(
            go.Bar(
                x=dates,
                y=counts,
                name=category.label,
                textfont_color=FONT_COLOR,
                marker_color=color,
                hovertemplate=(f"<b>%{{x}}</b><br>{category.label}: %{{y}}<extra></extra>"),
            )
        )

    figure = go.Figure(data=bars)
    figure.update_layout(
        barmode="stack",
        bargap=0.35,
        legend_title_text="Kategorien",
        title_text="Abschlüsse nach Kategorie (7 Tage)",
        xaxis_title="Datum",
        yaxis_title="Abschlüsse",
        margin=dict(t=60, r=10, b=40, l=10),
        showlegend=True,
    )
    figure.update_yaxes(rangemode="tozero")
    _apply_dark_theme(figure)
    return figure


def build_cycle_time_overview_figure(
    cycle_time_by_category: Mapping[Category, CycleTimeMetrics], *, unit: str = "days"
) -> go.Figure:
    unit_label = "Tage" if unit == "days" else "Stunden"
    divisor = 86400 if unit == "days" else 3600

    categories: list[str] = []
    durations: list[float] = []

    for category, metrics in cycle_time_by_category.items():
        if metrics.average is None:
            continue
        categories.append(category.label)
        durations.append(metrics.average.total_seconds() / divisor)

    bar = go.Bar(
        x=categories,
        y=durations,
        marker_color=PRIMARY_COLOR,
        text=[f"{value:.1f} {unit_label}" for value in durations],
        textposition="outside",
    )

    figure = go.Figure(data=[bar])
    figure.update_layout(
        title_text=f"Cycle Time nach Kategorie ({unit_label})",
        xaxis_title="Kategorie",
        yaxis_title=f"Ø Cycle Time ({unit_label})",
        margin=dict(t=60, r=10, b=60, l=10),
    )
    figure.update_yaxes(rangemode="tozero")
    _apply_dark_theme(figure)
    return figure


def build_backlog_health_figure(health: BacklogHealth) -> go.Figure:
    overdue_label = "Überfällig"
    open_label = "Offen"

    overdue_value = health.overdue_count
    remaining_open = max(health.open_count - health.overdue_count, 0)

    pie = go.Pie(
        labels=[overdue_label, open_label],
        values=[overdue_value, remaining_open],
        hole=0.55,
        marker=dict(colors=["#E45858", PRIMARY_COLOR]),
        textinfo="label+percent",
    )
    figure = go.Figure(data=[pie])
    figure.update_layout(
        title_text="Backlog-Gesundheit",
        showlegend=False,
        margin=dict(t=60, r=10, b=10, l=10),
    )
    _apply_dark_theme(figure)
    return figure


__all__ = [
    "build_category_weekly_completion_figure",
    "build_backlog_health_figure",
    "build_cycle_time_overview_figure",
    "CATEGORY_COLORS",
    "PRIMARY_COLOR",
]
