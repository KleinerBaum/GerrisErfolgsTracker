from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Sequence
from urllib.parse import urlencode

import httpx
import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from gerris_erfolgs_tracker.integrations.google.scopes import DEFAULT_SCOPES
from gerris_erfolgs_tracker.storage.token_store import TokenData

GOOGLE_AUTH_BASE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


@dataclass(frozen=True)
class OAuthConfig:
    client_id: str
    client_secret: str
    redirect_uri: str


class OAuthConfigError(ValueError):
    pass


class OAuthFlowError(RuntimeError):
    pass


def _get_secret(name: str) -> str | None:
    try:
        value = st.secrets.get(name)
        if value:
            return str(value)
    except StreamlitSecretNotFoundError:
        value = None
    return os.getenv(name)


def get_oauth_config() -> OAuthConfig:
    client_id = _get_secret("GOOGLE_CLIENT_ID")
    client_secret = _get_secret("GOOGLE_CLIENT_SECRET")
    redirect_uri = _get_secret("GOOGLE_REDIRECT_URI")
    if not client_id or not client_secret or not redirect_uri:
        raise OAuthConfigError(
            "Missing Google OAuth configuration. Expected GOOGLE_CLIENT_ID, "
            "GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
        )
    return OAuthConfig(client_id=client_id, client_secret=client_secret, redirect_uri=redirect_uri)


def build_authorization_url(
    *,
    state: str,
    scopes: Sequence[str] | None = None,
    access_type: str = "offline",
    prompt: str = "consent",
) -> str:
    config = get_oauth_config()
    scope_value = " ".join(scopes or DEFAULT_SCOPES)
    params = {
        "client_id": config.client_id,
        "redirect_uri": config.redirect_uri,
        "response_type": "code",
        "scope": scope_value,
        "state": state,
        "access_type": access_type,
        "prompt": prompt,
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_BASE_URL}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> TokenData:
    config = get_oauth_config()
    payload = {
        "code": code,
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "redirect_uri": config.redirect_uri,
        "grant_type": "authorization_code",
    }
    return _post_token_request(payload)


def refresh_access_token(refresh_token: str) -> TokenData:
    config = get_oauth_config()
    payload = {
        "client_id": config.client_id,
        "client_secret": config.client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    return _post_token_request(payload, refresh_token_override=refresh_token)


def fetch_user_info(access_token: str) -> dict[str, str]:
    response = httpx.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10.0,
    )
    if response.status_code >= 400:
        raise OAuthFlowError("Failed to fetch Google user profile.")
    data = response.json()
    return {key: str(value) for key, value in data.items() if isinstance(value, (str, int, float))}


def _post_token_request(payload: dict[str, str], *, refresh_token_override: str | None = None) -> TokenData:
    response = httpx.post(GOOGLE_TOKEN_URL, data=payload, timeout=10.0)
    if response.status_code >= 400:
        raise OAuthFlowError("Google OAuth token exchange failed.")
    data = response.json()
    if not isinstance(data, dict):
        raise OAuthFlowError("Unexpected token response format.")
    return _token_from_payload(data, refresh_token_override=refresh_token_override)


def _token_from_payload(payload: dict[str, object], *, refresh_token_override: str | None = None) -> TokenData:
    expires_in = payload.get("expires_in")
    expires_at = None
    if isinstance(expires_in, (int, float)):
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
    refresh_token_value: str | None
    refresh_token = payload.get("refresh_token")
    if isinstance(refresh_token, str):
        refresh_token_value = refresh_token
    else:
        refresh_token_value = refresh_token_override
    scope = payload.get("scope")
    return TokenData(
        access_token=str(payload.get("access_token") or ""),
        refresh_token=refresh_token_value,
        token_type=str(payload.get("token_type") or "") or None,
        scope=str(scope) if scope is not None else None,
        expires_at=expires_at,
        id_token=str(payload.get("id_token") or "") or None,
    )


def parse_token_payload(payload: str) -> TokenData:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise OAuthFlowError("Invalid token JSON payload.") from exc
    if not isinstance(data, dict):
        raise OAuthFlowError("Token payload must be a JSON object.")
    cleaned = {str(key): value for key, value in data.items() if isinstance(key, str)}
    return _token_from_payload(cleaned)
