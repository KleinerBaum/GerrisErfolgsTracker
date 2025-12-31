from __future__ import annotations

from datetime import datetime, timezone

from gerris_erfolgs_tracker.constants import SS_GAMIFICATION
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.gamification import (
    BADGE_CONSISTENCY_3,
    BADGE_CONSISTENCY_7,
    BADGE_CONSISTENCY_30,
    BADGE_DOUBLE_DIGITS,
    BADGE_FIRST_STEP,
    MIN_MILESTONE_POINTS,
    POINTS_PER_QUADRANT,
    PROGRESS_REWARD_POINTS,
    award_milestone_points,
    award_progress_points,
    calculate_progress_to_next_level,
    update_gamification_on_completion,
)
from gerris_erfolgs_tracker.models import (
    GamificationState,
    KpiStats,
    Milestone,
    MilestoneStatus,
    TodoItem,
)


def _completed_todo(quadrant: EisenhowerQuadrant) -> TodoItem:
    return TodoItem(
        title="Test",
        quadrant=quadrant,
        completed=True,
        completed_at=datetime(2024, 1, 1, 8, 0, tzinfo=timezone.utc),
    )


def test_points_and_level_progress(session_state: dict[str, object]) -> None:
    session_state[SS_GAMIFICATION] = GamificationState(points=95).model_dump()
    todo = _completed_todo(EisenhowerQuadrant.URGENT_IMPORTANT)
    stats = KpiStats(done_total=5, streak=2)

    state = update_gamification_on_completion(todo, stats)

    assert state.points == 95 + POINTS_PER_QUADRANT[EisenhowerQuadrant.URGENT_IMPORTANT]
    assert state.level == 2

    progress_points, required_points, progress_ratio = calculate_progress_to_next_level(state)
    assert progress_points == state.points - 100
    assert required_points == 100
    assert 0 < progress_ratio <= 1.0


def test_badges_are_awarded_once(session_state: dict[str, object]) -> None:
    todo = _completed_todo(EisenhowerQuadrant.NOT_URGENT_IMPORTANT)
    stats = KpiStats(done_total=12, streak=3)

    state_first = update_gamification_on_completion(todo, stats)
    assert set(state_first.badges) == {
        BADGE_FIRST_STEP,
        BADGE_CONSISTENCY_3,
        BADGE_DOUBLE_DIGITS,
    }
    assert len(state_first.processed_completions) == 1

    state_second = update_gamification_on_completion(todo, stats)
    assert state_second.points == state_first.points
    assert state_second.badges == state_first.badges
    assert len(state_second.processed_completions) == 1


def test_completion_event_is_logged_once(session_state: dict[str, object]) -> None:
    todo = _completed_todo(EisenhowerQuadrant.URGENT_NOT_IMPORTANT)
    stats = KpiStats(done_total=2, streak=1)

    state_first = update_gamification_on_completion(todo, stats)
    assert len(state_first.history) == 1
    assert todo.id in state_first.history[0]

    state_second = update_gamification_on_completion(todo, stats)
    assert len(state_second.history) == 1


def test_extended_badges(session_state: dict[str, object]) -> None:
    todo = _completed_todo(EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT)
    stats = KpiStats(done_total=120, streak=31)

    state = update_gamification_on_completion(todo, stats)

    assert BADGE_CONSISTENCY_7 in state.badges
    assert BADGE_CONSISTENCY_30 in state.badges
    assert BADGE_DOUBLE_DIGITS in state.badges


def test_progress_rewards_are_granted_once(session_state: dict[str, object]) -> None:
    todo = TodoItem(
        title="Progress Task",
        quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        progress_current=0,
        progress_target=100,
        progress_unit="%",
    )

    first_state = award_progress_points(todo=todo, previous_progress=0, updated_progress=50)
    assert first_state.points == PROGRESS_REWARD_POINTS * 2
    assert len(first_state.processed_progress_rewards) == 2

    repeated_state = award_progress_points(todo=todo, previous_progress=10, updated_progress=60)
    assert repeated_state.points == first_state.points
    assert len(repeated_state.processed_progress_rewards) == 2


def test_milestone_points_awarded_once(session_state: dict[str, object]) -> None:
    milestone = Milestone(title="Teilziel", points=0, status=MilestoneStatus.DONE)
    todo = TodoItem(title="Mit Milestone", quadrant=EisenhowerQuadrant.URGENT_IMPORTANT)

    state = award_milestone_points(todo=todo, milestone=milestone)
    assert state.points == MIN_MILESTONE_POINTS
    assert len(state.processed_milestone_events) == 1

    repeated = award_milestone_points(todo=todo, milestone=milestone)
    assert repeated.points == state.points
    assert len(repeated.processed_milestone_events) == 1
