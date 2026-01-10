from __future__ import annotations

import json
import os
from pathlib import Path

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from gerris_erfolgs_tracker.integrations.google.auth import OAuthFlowError
from gerris_erfolgs_tracker.integrations.google.token_store import TokenData, TokenStore

DEFAULT_ENV_VAR = "GOOGLE_TOKENS_JSON"
DEFAULT_JSON_PATH_ENV = "GOOGLE_TOKENS_JSON_PATH"


class EnvTokenStore(TokenStore):
    def __init__(self, *, env_var: str = DEFAULT_ENV_VAR, json_path_env: str = DEFAULT_JSON_PATH_ENV) -> None:
        self._env_var = env_var
        self._json_path_env = json_path_env

    def save_token(self, user_id: str, token: TokenData) -> None:
        payload = self._load_payload()
        payload[user_id] = token.to_dict()
        self._save_payload(payload)

    def load_token(self, user_id: str) -> TokenData | None:
        payload = self._load_payload()
        token_payload = payload.get(user_id)
        if not isinstance(token_payload, dict):
            return None
        sanitized = {str(key): value for key, value in token_payload.items()}
        return TokenData.from_dict(sanitized)

    def delete_token(self, user_id: str) -> None:
        payload = self._load_payload()
        if user_id in payload:
            payload.pop(user_id)
            self._save_payload(payload)

    def _load_payload(self) -> dict[str, dict[str, str | None]]:
        raw = _get_secret(self._env_var)
        if not raw:
            return {}
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise OAuthFlowError("Invalid JSON in Google token store.") from exc
        if not isinstance(data, dict):
            raise OAuthFlowError("Google token store JSON must be an object.")
        payload: dict[str, dict[str, str | None]] = {}
        for key, value in data.items():
            if isinstance(key, str) and isinstance(value, dict):
                payload[key] = {
                    str(item_key): str(item_value) if item_value is not None else None
                    for item_key, item_value in value.items()
                }
        return payload

    def _save_payload(self, payload: dict[str, dict[str, str | None]]) -> None:
        json_path = os.getenv(self._json_path_env)
        if not json_path:
            raise OAuthFlowError(
                "EnvTokenStore is read-only. Set GOOGLE_TOKENS_JSON_PATH to a writable file path to enable writes."
            )
        path = Path(json_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _get_secret(name: str) -> str | None:
    try:
        value = st.secrets.get(name)
        if value:
            return str(value)
    except StreamlitSecretNotFoundError:
        value = None
    return os.getenv(name)
