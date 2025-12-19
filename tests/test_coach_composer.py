from datetime import datetime, timezone

import streamlit as st
from pytest import MonkeyPatch

from gerris_erfolgs_tracker.coach.composer_openai import CoachMessagePayload, compose_message
from gerris_erfolgs_tracker.coach.events import CoachEvent, CoachTrigger
from gerris_erfolgs_tracker.constants import AI_ENABLED_KEY


def _weekly_event() -> CoachEvent:
    timestamp = datetime(2024, 1, 1, tzinfo=timezone.utc)
    return CoachEvent(trigger=CoachTrigger.WEEKLY, event_id="weekly:test", created_at_iso=timestamp.isoformat())


def test_compose_message_fallback(monkeypatch: MonkeyPatch) -> None:
    st.session_state.clear()
    st.session_state[AI_ENABLED_KEY] = True
    monkeypatch.setattr("gerris_erfolgs_tracker.coach.composer_openai.get_openai_client", lambda: None)

    message = compose_message(_weekly_event())

    assert message.trigger is CoachTrigger.WEEKLY
    assert message.title
    assert message.severity == "weekly"


def test_compose_message_with_mocked_openai(monkeypatch: MonkeyPatch) -> None:
    st.session_state.clear()
    st.session_state[AI_ENABLED_KEY] = True

    monkeypatch.setattr("gerris_erfolgs_tracker.coach.composer_openai.get_openai_client", lambda: object())
    monkeypatch.setattr(
        "gerris_erfolgs_tracker.coach.composer_openai.request_structured_response",
        lambda **_: CoachMessagePayload(title="AI Weekly", body="Body", severity="weekly", context={"source": "ai"}),
    )

    message = compose_message(_weekly_event())

    assert message.title == "AI Weekly"
    assert message.context.get("source") == "ai"
