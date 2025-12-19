from datetime import date, timedelta

import pytest

from gerris_erfolgs_tracker.coach.task_analyzer_models import MilestonePlanItem, TaskAIProposal
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant


def test_task_ai_proposal_validates_increasing_dates() -> None:
    start = date.today()
    due = start + timedelta(days=3)
    proposal = TaskAIProposal(
        complexity_score=6,
        estimated_minutes=45,
        suggested_quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        suggested_priority=0,
        milestone_plan=[
            MilestonePlanItem(title="Plan", suggested_due=start + timedelta(days=1)),
            MilestonePlanItem(title="Test", suggested_due=start + timedelta(days=2)),
        ],
        start_date=start,
        due_date=due,
    )

    assert proposal.complexity_score == 5
    assert proposal.suggested_priority == 1


def test_task_ai_proposal_rejects_out_of_bounds_date() -> None:
    start = date.today()
    due = start + timedelta(days=1)
    with pytest.raises(ValueError):
        TaskAIProposal(
            complexity_score=3,
            estimated_minutes=30,
            suggested_quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
            suggested_priority=3,
            milestone_plan=[
                MilestonePlanItem(title="Early", suggested_due=start - timedelta(days=1)),
                MilestonePlanItem(title="Late", suggested_due=due + timedelta(days=1)),
            ],
            start_date=start,
            due_date=due,
        )


def test_task_ai_proposal_requires_increasing_dates() -> None:
    start = date.today()
    due = start + timedelta(days=2)
    with pytest.raises(ValueError):
        TaskAIProposal(
            complexity_score=3,
            estimated_minutes=30,
            suggested_quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
            suggested_priority=3,
            milestone_plan=[
                MilestonePlanItem(title="First", suggested_due=due),
                MilestonePlanItem(title="Second", suggested_due=due),
            ],
            start_date=start,
            due_date=due,
        )
