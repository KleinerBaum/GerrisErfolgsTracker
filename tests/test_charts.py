from __future__ import annotations

from gerris_erfolgs_tracker.charts import build_category_weekly_completion_figure
from gerris_erfolgs_tracker.kpi import DailyCategoryCount
from gerris_erfolgs_tracker.models import Category


def test_build_category_weekly_completion_figure_stacks_categories() -> None:
    weekly_data: list[DailyCategoryCount] = [
        {
            "date": "2024-10-01",
            "counts": {
                Category.ADMIN.value: 2,
                Category.FRIENDS_FAMILY.value: 1,
            },
        },
        {
            "date": "2024-10-02",
            "counts": {
                Category.ADMIN.value: 0,
                Category.FRIENDS_FAMILY.value: 3,
            },
        },
    ]

    figure = build_category_weekly_completion_figure(weekly_data)

    assert len(figure.data) == len(list(Category))
    first_trace = figure.data[0]
    assert list(first_trace.x) == ["2024-10-01", "2024-10-02"]
    assert first_trace.type == "bar"
    assert figure.layout.barmode == "stack"
