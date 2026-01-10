from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx


class GoogleApiError(RuntimeError):
    pass


@dataclass(frozen=True)
class GoogleApiClient:
    access_token: str
    timeout: float = 10.0

    def get(self, url: str, *, params: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            response = httpx.get(
                url,
                headers={"Authorization": f"Bearer {self.access_token}"},
                params=params,
                timeout=self.timeout,
            )
        except httpx.RequestError as exc:
            raise GoogleApiError("Google API request failed.") from exc
        if response.status_code >= 400:
            message = _extract_error_message(response)
            raise GoogleApiError(message)
        data = response.json()
        if not isinstance(data, dict):
            raise GoogleApiError("Google API returned an unexpected response.")
        return data

    def post(self, url: str, *, json: dict[str, Any]) -> dict[str, Any]:
        try:
            response = httpx.post(
                url,
                headers={"Authorization": f"Bearer {self.access_token}"},
                json=json,
                timeout=self.timeout,
            )
        except httpx.RequestError as exc:
            raise GoogleApiError("Google API request failed.") from exc
        if response.status_code >= 400:
            message = _extract_error_message(response)
            raise GoogleApiError(message)
        data = response.json()
        if not isinstance(data, dict):
            raise GoogleApiError("Google API returned an unexpected response.")
        return data


def build_google_api_client(access_token: str, *, timeout: float = 10.0) -> GoogleApiClient:
    return GoogleApiClient(access_token=access_token, timeout=timeout)


def _extract_error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return "Google API request failed."
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message:
                return f"Google API request failed: {message}"
    return "Google API request failed."
