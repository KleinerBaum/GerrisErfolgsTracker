from __future__ import annotations

from typing import Sequence

from gerris_erfolgs_tracker.integrations.google.client import GoogleApiClient, build_google_api_client
from gerris_erfolgs_tracker.integrations.google.models import GmailSummary, get_header_value, parse_epoch_millis
from gerris_erfolgs_tracker.integrations.google.scopes import BASE_SCOPES, GOOGLE_SCOPE_GMAIL

GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1"

REQUIRED_SCOPES: tuple[str, ...] = (*BASE_SCOPES, GOOGLE_SCOPE_GMAIL)


def list_recent_messages(
    access_token: str,
    *,
    max_results: int = 10,
    label_ids: Sequence[str] | None = None,
) -> list[GmailSummary]:
    client = build_google_api_client(access_token)
    params: dict[str, object] = {
        "maxResults": max_results,
    }
    if label_ids:
        params["labelIds"] = list(label_ids)
    url = f"{GMAIL_API_BASE_URL}/users/me/messages"
    payload = client.get(url, params=params)
    messages = payload.get("messages", [])
    if not isinstance(messages, list):
        return []
    summaries: list[GmailSummary] = []
    for message in messages:
        if not isinstance(message, dict):
            continue
        message_id = message.get("id")
        if not isinstance(message_id, str) or not message_id:
            continue
        detail = _fetch_message_detail(client, message_id)
        if detail:
            summaries.append(detail)
    return summaries


def _fetch_message_detail(client: GoogleApiClient, message_id: str) -> GmailSummary | None:
    params = {
        "format": "metadata",
        "metadataHeaders": ["Subject", "From"],
    }
    url = f"{GMAIL_API_BASE_URL}/users/me/messages/{message_id}"
    payload = client.get(url, params=params)
    headers = payload.get("payload", {}).get("headers", [])
    if not isinstance(headers, list):
        headers = []
    return GmailSummary(
        message_id=message_id,
        thread_id=str(payload.get("threadId")) if payload.get("threadId") is not None else None,
        snippet=str(payload.get("snippet")) if payload.get("snippet") is not None else None,
        subject=get_header_value(headers, "Subject"),
        sender=get_header_value(headers, "From"),
        received_at=parse_epoch_millis(payload.get("internalDate")),
    )
