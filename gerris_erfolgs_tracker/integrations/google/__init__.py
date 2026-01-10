from __future__ import annotations

import os

from gerris_erfolgs_tracker.integrations.google.auth import (
    BASE_SCOPES,
    DEFAULT_SCOPES,
    GOOGLE_SCOPE_CALENDAR_READONLY,
    GOOGLE_SCOPE_DRIVE_READONLY,
    GOOGLE_SCOPE_GMAIL_READONLY,
    GOOGLE_SCOPE_OPENID,
    GOOGLE_SCOPE_SHEETS_READONLY,
    GOOGLE_SCOPE_TASKS_READONLY,
    GOOGLE_SCOPE_USERINFO_EMAIL,
    GOOGLE_SCOPE_USERINFO_PROFILE,
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
from gerris_erfolgs_tracker.integrations.google.token_backends import EnvTokenStore, SQLiteTokenStore
from gerris_erfolgs_tracker.integrations.google.token_store import TokenData, TokenStore

__all__ = [
    "DEFAULT_SCOPES",
    "BASE_SCOPES",
    "GOOGLE_SCOPE_CALENDAR_READONLY",
    "GOOGLE_SCOPE_DRIVE_READONLY",
    "GOOGLE_SCOPE_GMAIL_READONLY",
    "GOOGLE_SCOPE_OPENID",
    "GOOGLE_SCOPE_SHEETS_READONLY",
    "GOOGLE_SCOPE_TASKS_READONLY",
    "GOOGLE_SCOPE_USERINFO_EMAIL",
    "GOOGLE_SCOPE_USERINFO_PROFILE",
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
    "get_oauth_config",
    "parse_token_payload",
    "refresh_access_token",
]


def get_default_token_store() -> TokenStore:
    backend = os.getenv("GOOGLE_TOKEN_STORE_BACKEND", "sqlite").lower()
    if backend == "env":
        return EnvTokenStore()
    return SQLiteTokenStore()
