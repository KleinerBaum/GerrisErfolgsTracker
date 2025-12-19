from __future__ import annotations

from datetime import datetime, timedelta, timezone

import streamlit as st

from gerris_erfolgs_tracker.coach.events import CoachEvent
from gerris_erfolgs_tracker.coach.models import CoachMessage, CoachState
from gerris_erfolgs_tracker.coach.templates import select_template
from gerris_erfolgs_tracker.constants import (
    COACH_HISTORY_LIMIT,
    COACH_SEEN_EVENT_IDS_MAX,
    SS_COACH,
    cap_list_tail,
)
from gerris_erfolgs_tracker.state import persist_state

_COOLDOWN = timedelta(hours=2)


def _coerce_state(raw_state: object | None) -> CoachState:
    if isinstance(raw_state, CoachState):
        return raw_state
    if isinstance(raw_state, dict):
        return CoachState.model_validate(raw_state)
    return CoachState()


def get_coach_state() -> CoachState:
    state = _coerce_state(st.session_state.get(SS_COACH))
    st.session_state[SS_COACH] = state.model_dump()
    persist_state()
    return state


def _within_daily_cap(state: CoachState, timestamp: datetime) -> bool:
    day_messages = [
        message
        for message in state.messages
        if message.created_at.astimezone(timezone.utc).date() == timestamp.date()
    ]
    return len(day_messages) < 3


def _respects_cooldown(state: CoachState, timestamp: datetime, *, severity: str) -> bool:
    if severity == "weekly":
        return True

    if state.last_message_at is None:
        return True

    return timestamp - state.last_message_at >= _COOLDOWN


def maybe_set_current_message(state: CoachState, message: CoachMessage) -> None:
    timestamp = message.created_at.astimezone(timezone.utc)
    if not _within_daily_cap(state, timestamp):
        return

    if not _respects_cooldown(state, timestamp, severity=message.severity):
        return

    state.messages.append(message.model_copy(update={"created_at": timestamp}))
    state.messages = cap_list_tail(state.messages, COACH_HISTORY_LIMIT)
    state.last_message_at = timestamp


def handle_event(state: CoachState, event: CoachEvent) -> None:
    if event.event_id in state.seen_event_ids:
        return

    state.seen_event_ids.append(event.event_id)
    state.seen_event_ids = cap_list_tail(state.seen_event_ids, COACH_SEEN_EVENT_IDS_MAX)

    message = select_template(event)
    maybe_set_current_message(state, message)


def process_event(event: CoachEvent) -> CoachState:
    state = get_coach_state()
    handle_event(state, event)
    st.session_state[SS_COACH] = state.model_dump()
    persist_state()
    return state


__all__ = ["handle_event", "maybe_set_current_message", "process_event", "get_coach_state"]
