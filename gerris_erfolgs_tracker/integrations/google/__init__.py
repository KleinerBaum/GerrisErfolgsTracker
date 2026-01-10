from __future__ import annotations

import os

from gerris_erfolgs_tracker.integrations.google.auth import (
    OAuthConfig,
    OAuthConfigError,
    OAuthFlowError,
    build_authorization_url,
    exchange_code_for_token,
    fetch_user_info,
    get_oauth_config,
    parse_token_payload,
    refresh_access_token,
)
from gerris_erfolgs_tracker.integrations.google.scopes import (
    BASE_SCOPES,
    DEFAULT_SCOPES,
    GOOGLE_SCOPE_CALENDAR,
    GOOGLE_SCOPE_DRIVE,
    GOOGLE_SCOPE_GMAIL,
    GOOGLE_SCOPE_OPENID,
    GOOGLE_SCOPE_SHEETS,
    GOOGLE_SCOPE_TASKS,
    GOOGLE_SCOPE_USERINFO_EMAIL,
    GOOGLE_SCOPE_USERINFO_PROFILE,
    SCOPES_MAX_7,
)
from gerris_erfolgs_tracker.integrations.google.services import (
    get_calendar_service,
    get_drive_service,
    get_gmail_service,
    get_sheets_service,
    get_tasks_service,
)
from gerris_erfolgs_tracker.integrations.google.token_backends import EnvTokenStore
from gerris_erfolgs_tracker.storage.sqlite_token_store import SQLiteTokenStore
from gerris_erfolgs_tracker.storage.token_store import TokenData, TokenStore

__all__ = [
    "DEFAULT_SCOPES",
    "BASE_SCOPES",
    "GOOGLE_SCOPE_CALENDAR",
    "GOOGLE_SCOPE_DRIVE",
    "GOOGLE_SCOPE_GMAIL",
    "GOOGLE_SCOPE_OPENID",
    "GOOGLE_SCOPE_SHEETS",
    "GOOGLE_SCOPE_TASKS",
    "GOOGLE_SCOPE_USERINFO_EMAIL",
    "GOOGLE_SCOPE_USERINFO_PROFILE",
    "SCOPES_MAX_7",
    "EnvTokenStore",
    "OAuthConfig",
    "OAuthConfigError",
    "OAuthFlowError",
    "SQLiteTokenStore",
    "TokenData",
    "TokenStore",
    "build_authorization_url",
    "exchange_code_for_token",
    "fetch_user_info",
    "get_default_token_store",
    "get_calendar_service",
    "get_drive_service",
    "get_gmail_service",
    "get_sheets_service",
    "get_tasks_service",
    "get_oauth_config",
    "parse_token_payload",
    "refresh_access_token",
]


def get_default_token_store() -> TokenStore:
    backend = os.getenv("GOOGLE_TOKEN_STORE_BACKEND", "sqlite").lower()
    if backend == "env":
        return EnvTokenStore()
    return SQLiteTokenStore()
