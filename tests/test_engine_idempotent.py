from datetime import datetime, timezone

from gerris_erfolgs_tracker.coach.engine import handle_event
from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.coach.models import CoachState


def _build_event(event_id: str, *, trigger: CoachTrigger = CoachTrigger.TASK_COMPLETED, hour: int = 9) -> CoachEvent:
    timestamp = datetime(2024, 1, 1, hour, tzinfo=timezone.utc)
    return CoachEvent(
        trigger=trigger,
        event_id=event_id,
        created_at_iso=timestamp.isoformat(),
        context={"task_id": "123", "task_title": "Demo", "category": "demo", "quadrant": "q1"},
    )


def test_same_event_id_only_once() -> None:
    state = CoachState()
    event = _build_event("coach:task_completed:token")
    handle_event(state, event)
    handle_event(state, event)

    assert len(state.messages) == 1
    assert state.seen_event_ids == ["coach:task_completed:token"]


def test_daily_cap_limits_messages() -> None:
    state = CoachState()
    for idx, hour in enumerate((8, 11, 14, 17)):
        handle_event(state, _build_event(f"coach:task:{idx}", hour=hour))

    assert len(state.messages) == 3
    assert len(state.seen_event_ids) == 4


def test_cooldown_skips_recent_events() -> None:
    state = CoachState()
    first_event = _build_event("coach:first", hour=10)
    second_event = _build_event("coach:second", hour=11)
    weekly_event = _build_event("coach:weekly:demo", trigger=CoachTrigger.WEEKLY, hour=11)

    handle_event(state, first_event)
    handle_event(state, second_event)
    handle_event(state, weekly_event)

    assert len(state.messages) == 2
    assert any(message.trigger is CoachTrigger.WEEKLY for message in state.messages)
