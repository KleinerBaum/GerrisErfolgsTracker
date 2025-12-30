from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, Sequence

import httpx
import pytest

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import EmailReminderOffset, TodoItem
from gerris_erfolgs_tracker.notifications.email_brevo import (
    BrevoEmailConfig,
    BrevoEmailNotificationService,
    NotificationError,
)
from gerris_erfolgs_tracker.notifications.scheduler import ReminderScheduler, ReminderSchedulerConfig


class _DummyEmailService(BrevoEmailNotificationService):
    def __init__(self) -> None:
        super().__init__(config=BrevoEmailConfig(api_key="test", sender="sender@example.com"))
        self.sent_payloads: list[tuple[str, str, str]] = []

    def send_email(self, *, to: str, subject: str, html_content: str) -> None:  # type: ignore[override]
        self.sent_payloads.append((to, subject, html_content))


def test_brevo_service_success() -> None:
    attempts: list[str] = []

    def _responder(request: httpx.Request) -> httpx.Response:
        attempts.append(request.url.path)
        return httpx.Response(202, json={"messageId": "abc"})

    transport = httpx.MockTransport(_responder)
    client = httpx.Client(transport=transport)
    service = BrevoEmailNotificationService(
        config=BrevoEmailConfig(api_key="token", sender="from@example.com"), client=client
    )

    service.send_email(to="user@example.com", subject="Hello", html_content="<p>Test</p>")
    assert attempts == ["/v3/smtp/email"]


def test_brevo_service_retries_then_succeeds(monkeypatch: pytest.MonkeyPatch) -> None:
    attempt_counter = {"count": 0}

    def _responder(_: httpx.Request) -> httpx.Response:
        attempt_counter["count"] += 1
        if attempt_counter["count"] < 3:
            return httpx.Response(500, text="temporary error")
        return httpx.Response(202)

    transport = httpx.MockTransport(_responder)
    client = httpx.Client(transport=transport)
    service = BrevoEmailNotificationService(
        config=BrevoEmailConfig(api_key="token", sender="from@example.com"), client=client, backoff_seconds=0.01
    )
    monkeypatch.setattr("gerris_erfolgs_tracker.notifications.email_brevo.time.sleep", lambda _: None)

    service.send_email(to="user@example.com", subject="Hello", html_content="<p>Retry</p>")
    assert attempt_counter["count"] == 3


def test_brevo_missing_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BREVO_API_KEY", raising=False)
    monkeypatch.delenv("BREVO_SENDER", raising=False)

    with pytest.raises(NotificationError):
        BrevoEmailNotificationService()


def test_scheduler_marks_sent_and_persists() -> None:
    now = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    due_date = now + timedelta(hours=1)
    todo = TodoItem(title="Reminder", quadrant=EisenhowerQuadrant.URGENT_IMPORTANT, due_date=due_date)
    todo = todo.model_copy(update={"email_reminder": EmailReminderOffset.ONE_HOUR})

    captured: dict[str, Sequence[TodoItem]] = {}

    def _load() -> Iterable[TodoItem]:
        return [todo]

    def _save(values: Sequence[TodoItem]) -> None:
        captured["todos"] = list(values)

    scheduler = ReminderScheduler(
        _DummyEmailService(),
        load_todos=_load,
        save_todos=_save,
        config=ReminderSchedulerConfig(
            recipient_email="recipient@example.com", lookahead_minutes=90, poll_interval_seconds=0
        ),
    )

    processed = scheduler.poll_once(now=now)

    assert len(processed) == 1
    assert scheduler.email_service.sent_payloads  # type: ignore[attr-defined]
    persisted = captured["todos"][0]
    assert persisted.reminder_sent_at is not None
    assert persisted.reminder_at is not None


def test_scheduler_skips_if_already_sent() -> None:
    now = datetime(2024, 1, 1, 9, 0, tzinfo=timezone.utc)
    due_date = now + timedelta(hours=2)
    todo = TodoItem(
        title="Done",
        quadrant=EisenhowerQuadrant.URGENT_IMPORTANT,
        due_date=due_date,
        email_reminder=EmailReminderOffset.ONE_HOUR,
        reminder_at=due_date - timedelta(hours=1),
        reminder_sent_at=now,
    )

    def _load() -> Iterable[TodoItem]:
        return [todo]

    saved: list[Sequence[TodoItem]] = []

    scheduler = ReminderScheduler(
        _DummyEmailService(),
        load_todos=_load,
        save_todos=lambda values: saved.append(values),
        config=ReminderSchedulerConfig(
            recipient_email="recipient@example.com", lookahead_minutes=120, poll_interval_seconds=0
        ),
    )

    processed = scheduler.poll_once(now=now)

    assert processed == []
    assert not saved  # nothing persisted when nothing was sent
