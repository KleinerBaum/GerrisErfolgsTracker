from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx

LOGGER = logging.getLogger(__name__)


class NotificationError(RuntimeError):
    """Raised when an email notification cannot be delivered."""


@dataclass
class BrevoEmailConfig:
    api_key: str
    sender: str
    sender_name: Optional[str] = None


class BrevoEmailNotificationService:
    """Send email reminders via the Brevo transactional API."""

    def __init__(
        self,
        config: Optional[BrevoEmailConfig] = None,
        *,
        client: Optional[httpx.Client] = None,
        max_retries: int = 3,
        backoff_seconds: float = 1.0,
    ) -> None:
        self.config = config or self._config_from_env()
        self._client = client or httpx.Client(timeout=10.0)
        self.max_retries = max(1, max_retries)
        self.backoff_seconds = max(0.1, backoff_seconds)

    def _config_from_env(self) -> BrevoEmailConfig:
        api_key = os.getenv("BREVO_API_KEY")
        sender = os.getenv("BREVO_SENDER")
        sender_name = os.getenv("BREVO_SENDER_NAME")
        if not api_key or not sender:
            raise NotificationError(
                "Brevo-Konfiguration fehlt: Bitte BREVO_API_KEY und BREVO_SENDER als Environment-Variablen setzen."
            )
        return BrevoEmailConfig(api_key=api_key, sender=sender, sender_name=sender_name)

    def send_email(self, *, to: str, subject: str, html_content: str) -> None:
        sender_payload: dict[str, str] = {"email": self.config.sender}
        if self.config.sender_name:
            sender_payload["name"] = self.config.sender_name

        payload: dict[str, object] = {
            "sender": sender_payload,
            "to": [{"email": to}],
            "subject": subject,
            "htmlContent": html_content,
        }

        for attempt in range(1, self.max_retries + 1):
            try:
                response = self._client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": self.config.api_key, "accept": "application/json"},
                    json=payload,
                )
            except httpx.HTTPError as exc:  # pragma: no cover - exercised via retry logic
                self._handle_error(exc=exc, attempt=attempt)
                continue

            if response.status_code in (200, 201, 202):
                return

            error_message = response.text[:500]
            self._handle_error(
                exc=NotificationError(f"Brevo-Antwort fehlerhaft (Status {response.status_code}): {error_message}"),
                attempt=attempt,
            )

    def _handle_error(self, *, exc: Exception, attempt: int) -> None:
        if attempt >= self.max_retries:
            raise NotificationError(str(exc)) from exc

        delay = self.backoff_seconds * (2 ** (attempt - 1))
        LOGGER.warning("Brevo-Versuch %s fehlgeschlagen: %s – Retry in %.1fs", attempt, exc, delay)
        time.sleep(delay)
