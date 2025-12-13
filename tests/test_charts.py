from __future__ import annotations

from gerris_erfolgs_tracker.charts import (
    PRIMARY_COLOR,
    build_weekly_completion_figure,
)


def test_build_weekly_completion_figure_sets_expected_styling() -> None:
    weekly_data = [
        {"date": "2024-10-01", "completions": 3},
        {"date": "2024-10-02", "completions": 0},
        {"date": "2024-10-03", "completions": 5},
    ]

    figure = build_weekly_completion_figure(weekly_data)

    assert figure.data
    bar_trace = figure.data[0]
    assert bar_trace.type == "bar"
    assert list(bar_trace.x) == ["2024-10-01", "2024-10-02", "2024-10-03"]
    assert list(bar_trace.y) == [3, 0, 5]
    assert bar_trace.marker.color == PRIMARY_COLOR
    assert "Abschlüsse / Completions" in bar_trace.hovertemplate
    assert "Abschlüsse der letzten 7 Tage" in str(figure.layout.title.text)
    assert figure.layout.yaxis.rangemode == "tozero"
