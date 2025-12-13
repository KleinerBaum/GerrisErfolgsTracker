from __future__ import annotations

from typing import List

import plotly.graph_objects as go

PRIMARY_COLOR = "#127475"


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
                marker_color=PRIMARY_COLOR,
                hovertemplate=("<b>%{x}</b><br>Abschlüsse / Completions: %{y}<extra></extra>"),
            )
        ]
    )

    figure.update_layout(
        template="plotly_white",
        bargap=0.35,
        title_text="Abschlüsse der letzten 7 Tage / Completions last 7 days",
        xaxis_title="Datum / Date",
        yaxis_title="Abschlüsse / Completions",
        plot_bgcolor="rgba(0,0,0,0)",
        paper_bgcolor="rgba(0,0,0,0)",
        margin=dict(t=60, r=10, b=40, l=10),
    )

    figure.update_yaxes(rangemode="tozero")

    return figure


__all__ = ["build_weekly_completion_figure", "PRIMARY_COLOR"]
