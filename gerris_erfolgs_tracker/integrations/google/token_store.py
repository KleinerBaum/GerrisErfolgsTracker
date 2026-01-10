from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime
from typing import Protocol


@dataclass(frozen=True)
class TokenData:
    access_token: str
    refresh_token: str | None
    token_type: str | None
    scope: str | None
    expires_at: datetime | None
    id_token: str | None = None

    def is_expired(self, *, now: datetime) -> bool:
        if self.expires_at is None:
            return False
        return self.expires_at <= now

    def with_refresh_token(self, refresh_token: str | None) -> TokenData:
        return replace(self, refresh_token=refresh_token)

    def to_dict(self) -> dict[str, str | None]:
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "token_type": self.token_type,
            "scope": self.scope,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "id_token": self.id_token,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, str | None]) -> TokenData:
        expires_at_raw = payload.get("expires_at")
        expires_at = datetime.fromisoformat(expires_at_raw) if expires_at_raw else None
        return cls(
            access_token=payload.get("access_token") or "",
            refresh_token=payload.get("refresh_token"),
            token_type=payload.get("token_type"),
            scope=payload.get("scope"),
            expires_at=expires_at,
            id_token=payload.get("id_token"),
        )


class TokenStore(Protocol):
    def save_token(self, user_id: str, token: TokenData) -> None:
        """Persist tokens for a given user identifier (e.g., email)."""

    def load_token(self, user_id: str) -> TokenData | None:
        """Load tokens for a given user identifier."""

    def delete_token(self, user_id: str) -> None:
        """Remove tokens for a given user identifier."""
