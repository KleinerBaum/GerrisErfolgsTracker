from __future__ import annotations

from typing import Iterable, List, Mapping, Sequence

import plotly.graph_objects as go

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


def build_weekly_completion_figure(
    weekly_data: List[dict[str, object]],
) -> go.Figure:
    """Create an interactive bar chart for the last 7 days.

    Args:
        weekly_data: Sequence of mappings with ``date`` (ISO string) and
            ``completions`` (int) entries.

    Returns:
        A Plotly figure configured with bilingual labels and hover details.
    """

    dates = [str(entry.get("date", "")) for entry in weekly_data]
    completions: list[int] = []
    for entry in weekly_data:
        value = entry.get("completions")
        if isinstance(value, (int, float)):
            completions.append(int(value))
        elif isinstance(value, str) and value.strip():
            try:
                completions.append(int(float(value)))
            except ValueError:
                completions.append(0)
        else:
            completions.append(0)

    figure = go.Figure(
        data=[
            go.Bar(
                x=dates,
                y=completions,
                text=completions,
                textposition="auto",
                textfont_color=FONT_COLOR,
                marker_color=PRIMARY_COLOR,
                hovertemplate=("<b>%{x}</b><br>Abschlüsse / Completions: %{y}<extra></extra>"),
            )
        ]
    )

    figure.update_layout(
        bargap=0.35,
        title_text="Abschlüsse der letzten 7 Tage / Completions last 7 days",
        xaxis_title="Datum / Date",
        yaxis_title="Abschlüsse / Completions",
        margin=dict(t=60, r=10, b=40, l=10),
    )

    figure.update_yaxes(rangemode="tozero")
    _apply_dark_theme(figure)

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
        legend_title_text="Kategorien / Categories",
        title_text="Abschlüsse nach Kategorie (7 Tage) / Completions by category (7 days)",
        xaxis_title="Datum / Date",
        yaxis_title="Abschlüsse / Completions",
        margin=dict(t=60, r=10, b=40, l=10),
        showlegend=True,
    )
    figure.update_yaxes(rangemode="tozero")
    _apply_dark_theme(figure)
    return figure


__all__ = [
    "build_category_weekly_completion_figure",
    "build_weekly_completion_figure",
    "CATEGORY_COLORS",
    "PRIMARY_COLOR",
]
