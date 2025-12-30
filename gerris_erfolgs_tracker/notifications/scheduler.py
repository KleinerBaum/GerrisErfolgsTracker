from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable, Optional, Sequence

from gerris_erfolgs_tracker.models import TodoItem
from gerris_erfolgs_tracker.notifications.email_brevo import (
    BrevoEmailNotificationService,
    NotificationError,
)
from gerris_erfolgs_tracker.notifications.reminders import calculate_reminder_at, is_reminder_due
from gerris_erfolgs_tracker.state import get_todos
from gerris_erfolgs_tracker.state import save_todos as persist_todos

LOGGER = logging.getLogger(__name__)


@dataclass
class ReminderSchedulerConfig:
    recipient_email: str
    lookahead_minutes: int = 60
    poll_interval_seconds: int = 300

    @classmethod
    def from_env(cls, env: Optional[dict[str, str]] = None) -> ReminderSchedulerConfig:
        env_map = env or os.environ
        recipient = env_map.get("REMINDER_RECIPIENT_EMAIL") or env_map.get("BREVO_SENDER")
        lookahead_minutes = int(env_map.get("REMINDER_LOOKAHEAD_MINUTES", "60"))
        poll_interval = int(env_map.get("REMINDER_POLL_INTERVAL_SECONDS", "300"))

        if recipient is None:
            raise NotificationError(
                "Kein Empfänger für Erinnerungs-E-Mails konfiguriert (REMINDER_RECIPIENT_EMAIL fehlt)."
            )

        return cls(
            recipient_email=recipient,
            lookahead_minutes=lookahead_minutes,
            poll_interval_seconds=poll_interval,
        )


class ReminderScheduler:
    """Poll todos and trigger email reminders for due tasks."""

    def __init__(
        self,
        email_service: BrevoEmailNotificationService,
        *,
        load_todos: Optional[Callable[[], Iterable[TodoItem]]] = None,
        save_todos: Optional[Callable[[Sequence[TodoItem]], None]] = None,
        config: Optional[ReminderSchedulerConfig] = None,
    ) -> None:
        self.email_service = email_service
        self.config = config or ReminderSchedulerConfig.from_env()
        self.load_todos: Callable[[], Iterable[TodoItem]]
        self.save_todos: Callable[[Sequence[TodoItem]], None]

        if load_todos is None or save_todos is None:
            self.load_todos = get_todos
            self.save_todos = persist_todos
        else:
            self.load_todos = load_todos
            self.save_todos = save_todos

    def poll_once(self, *, now: Optional[datetime] = None) -> list[TodoItem]:
        """Send reminders for all todos whose reminder falls within the lookahead window."""

        now_ts = now or datetime.now(timezone.utc)
        lookahead = timedelta(minutes=self.config.lookahead_minutes)
        todos = list(self.load_todos())
        due_items = [todo for todo in todos if is_reminder_due(todo, now=now_ts, lookahead=lookahead)]

        if not due_items:
            return []

        updated: list[TodoItem] = []
        for todo in due_items:
            LOGGER.info("Sende Reminder für Aufgabe '%s' (Fällig: %s)", todo.title, todo.due_date)
            reminder_at = todo.reminder_at or calculate_reminder_at(todo.due_date, todo.email_reminder)
            subject, body = self._build_message(todo, now_ts, reminder_at)
            self.email_service.send_email(to=self.config.recipient_email, subject=subject, html_content=body)
            normalized_now = now_ts if now_ts.tzinfo else now_ts.replace(tzinfo=timezone.utc)
            updated.append(todo.model_copy(update={"reminder_sent_at": normalized_now, "reminder_at": reminder_at}))

        updated_by_id = {item.id: item for item in updated}
        persisted = [updated_by_id.get(todo.id, todo) for todo in todos]
        self.save_todos(persisted)
        return updated

    def run(self) -> None:
        """Continuously poll based on the configured interval."""

        while True:
            try:
                self.poll_once()
            except NotificationError as exc:  # pragma: no cover - defensive
                LOGGER.error("E-Mail-Erinnerung fehlgeschlagen: %s", exc)
            time.sleep(self.config.poll_interval_seconds)

    def _build_message(self, todo: TodoItem, now: datetime, reminder_at: datetime | None) -> tuple[str, str]:
        due_display = (
            todo.due_date.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            if todo.due_date
            else "ohne Fälligkeitsdatum / no due date"
        )
        reminder_display = (
            reminder_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            if reminder_at
            else "keine Erinnerung geplant / no reminder configured"
        )
        subject = f"Reminder: {todo.title} / Erinnerung: {todo.title}"
        body = """
            <p>Hi!</p>
            <p>
                Deine Aufgabe <strong>{title}</strong> ist fällig am <strong>{due}</strong>.<br/>
                Reminder-Zeitpunkt: {reminder}
            </p>
            <p>
                This is a friendly reminder for your task <strong>{title}</strong> due on <strong>{due}</strong>.<br/>
                Reminder time: {reminder}
            </p>
            <p>Gesendet: {sent}</p>
        """.format(
            title=todo.title,
            due=due_display,
            reminder=reminder_display,
            sent=(now if now.tzinfo else now.replace(tzinfo=timezone.utc)).strftime("%Y-%m-%d %H:%M UTC"),
        )

        return subject, body
