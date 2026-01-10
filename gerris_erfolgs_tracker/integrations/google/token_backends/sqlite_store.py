from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from pathlib import Path

from gerris_erfolgs_tracker.integrations.google.token_store import TokenData, TokenStore

DEFAULT_DB_PATH = Path(".data/gerris_google_tokens.sqlite")


class SQLiteTokenStore(TokenStore):
    def __init__(self, db_path: str | Path | None = None) -> None:
        env_path = os.getenv("GOOGLE_TOKEN_DB_PATH")
        self._db_path = Path(db_path or env_path or DEFAULT_DB_PATH)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def save_token(self, user_id: str, token: TokenData) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO google_tokens (
                    user_id,
                    access_token,
                    refresh_token,
                    token_type,
                    scope,
                    expires_at,
                    id_token
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id)
                DO UPDATE SET
                    access_token=excluded.access_token,
                    refresh_token=excluded.refresh_token,
                    token_type=excluded.token_type,
                    scope=excluded.scope,
                    expires_at=excluded.expires_at,
                    id_token=excluded.id_token
                """,
                (
                    user_id,
                    token.access_token,
                    token.refresh_token,
                    token.token_type,
                    token.scope,
                    token.expires_at.isoformat() if token.expires_at else None,
                    token.id_token,
                ),
            )
            connection.commit()

    def load_token(self, user_id: str) -> TokenData | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT access_token, refresh_token, token_type, scope, expires_at, id_token
                FROM google_tokens
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()
        if not row:
            return None
        expires_at = datetime.fromisoformat(row[4]) if row[4] else None
        return TokenData(
            access_token=row[0],
            refresh_token=row[1],
            token_type=row[2],
            scope=row[3],
            expires_at=expires_at,
            id_token=row[5],
        )

    def delete_token(self, user_id: str) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM google_tokens WHERE user_id = ?", (user_id,))
            connection.commit()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self._db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS google_tokens (
                    user_id TEXT PRIMARY KEY,
                    access_token TEXT NOT NULL,
                    refresh_token TEXT,
                    token_type TEXT,
                    scope TEXT,
                    expires_at TEXT,
                    id_token TEXT
                )
                """
            )
            connection.commit()
