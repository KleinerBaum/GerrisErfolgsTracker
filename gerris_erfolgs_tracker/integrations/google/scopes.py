from __future__ import annotations

GOOGLE_SCOPE_OPENID = "openid"
GOOGLE_SCOPE_USERINFO_EMAIL = "https://www.googleapis.com/auth/userinfo.email"
GOOGLE_SCOPE_USERINFO_PROFILE = "https://www.googleapis.com/auth/userinfo.profile"

GOOGLE_SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar"
GOOGLE_SCOPE_TASKS = "https://www.googleapis.com/auth/tasks"
GOOGLE_SCOPE_GMAIL = "https://mail.google.com/"
GOOGLE_SCOPE_DRIVE = "https://www.googleapis.com/auth/drive"
GOOGLE_SCOPE_SHEETS = "https://www.googleapis.com/auth/spreadsheets"

BASE_SCOPES: tuple[str, ...] = (
    GOOGLE_SCOPE_OPENID,
    GOOGLE_SCOPE_USERINFO_EMAIL,
)

SCOPES_MAX_7: tuple[str, ...] = (
    *BASE_SCOPES,
    GOOGLE_SCOPE_CALENDAR,
    GOOGLE_SCOPE_TASKS,
    GOOGLE_SCOPE_GMAIL,
    GOOGLE_SCOPE_DRIVE,
    GOOGLE_SCOPE_SHEETS,
)

DEFAULT_SCOPES: tuple[str, ...] = SCOPES_MAX_7
