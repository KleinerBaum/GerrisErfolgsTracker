from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from gerris_erfolgs_tracker.integrations.google.auth import OAuthFlowError, refresh_access_token
from gerris_erfolgs_tracker.integrations.google.client import GoogleApiClient, build_google_api_client
from gerris_erfolgs_tracker.storage.token_store import TokenData, TokenStore

CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3"
GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1"
TASKS_API_BASE_URL = "https://tasks.googleapis.com/tasks/v1"
DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3"
SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4"


@dataclass(frozen=True)
class GoogleService:
    client: GoogleApiClient
    base_url: str

    def get(self, path: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}/{path.lstrip('/')}"
        return self.client.get(url, params=params)


def get_calendar_service(user_id: str, token_store: TokenStore) -> GoogleService:
    return _build_service(CALENDAR_API_BASE_URL, user_id=user_id, token_store=token_store)


def get_gmail_service(user_id: str, token_store: TokenStore) -> GoogleService:
    return _build_service(GMAIL_API_BASE_URL, user_id=user_id, token_store=token_store)


def get_tasks_service(user_id: str, token_store: TokenStore) -> GoogleService:
    return _build_service(TASKS_API_BASE_URL, user_id=user_id, token_store=token_store)


def get_drive_service(user_id: str, token_store: TokenStore) -> GoogleService:
    return _build_service(DRIVE_API_BASE_URL, user_id=user_id, token_store=token_store)


def get_sheets_service(user_id: str, token_store: TokenStore) -> GoogleService:
    return _build_service(SHEETS_API_BASE_URL, user_id=user_id, token_store=token_store)


def _build_service(base_url: str, *, user_id: str, token_store: TokenStore) -> GoogleService:
    token = _load_valid_token(user_id, token_store)
    client = build_google_api_client(token.access_token)
    return GoogleService(client=client, base_url=base_url)


def _load_valid_token(user_id: str, token_store: TokenStore) -> TokenData:
    token = token_store.load_token(user_id)
    if token is None:
        raise OAuthFlowError("No Google OAuth token found. Please connect Google first.")
    return _ensure_fresh_token(token, user_id=user_id, token_store=token_store)


def _ensure_fresh_token(token: TokenData, *, user_id: str, token_store: TokenStore) -> TokenData:
    now = datetime.now(timezone.utc)
    if not token.is_expired(now=now):
        return token
    if not token.refresh_token:
        raise OAuthFlowError("Google refresh token is missing. Please reconnect Google.")
    refreshed = refresh_access_token(token.refresh_token)
    if not refreshed.refresh_token:
        refreshed = refreshed.with_refresh_token(token.refresh_token)
    token_store.save_token(user_id, refreshed)
    return refreshed
