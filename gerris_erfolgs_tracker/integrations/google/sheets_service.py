from __future__ import annotations

from typing import Any

from gerris_erfolgs_tracker.integrations.google.client import build_google_api_client
from gerris_erfolgs_tracker.integrations.google.models import SheetMetadata, parse_google_datetime
from gerris_erfolgs_tracker.integrations.google.scopes import (
    BASE_SCOPES,
    GOOGLE_SCOPE_DRIVE,
    GOOGLE_SCOPE_SHEETS,
)

SHEETS_API_BASE_URL = "https://sheets.googleapis.com/v4"
DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3"

REQUIRED_SCOPES: tuple[str, ...] = (
    *BASE_SCOPES,
    GOOGLE_SCOPE_SHEETS,
    GOOGLE_SCOPE_DRIVE,
)


def list_spreadsheets(
    access_token: str,
    *,
    max_results: int = 10,
) -> list[SheetMetadata]:
    client = build_google_api_client(access_token)
    params = {
        "pageSize": max_results,
        "orderBy": "modifiedTime desc",
        "q": "mimeType='application/vnd.google-apps.spreadsheet'",
        "fields": "files(id,name,modifiedTime,webViewLink)",
    }
    url = f"{DRIVE_API_BASE_URL}/files"
    payload = client.get(url, params=params)
    items = payload.get("files", [])
    if not isinstance(items, list):
        return []
    return [_to_sheet_metadata(item) for item in items if isinstance(item, dict)]


def get_spreadsheet_metadata(access_token: str, spreadsheet_id: str) -> SheetMetadata | None:
    client = build_google_api_client(access_token)
    url = f"{SHEETS_API_BASE_URL}/spreadsheets/{spreadsheet_id}"
    params = {"fields": "spreadsheetId,properties.title"}
    payload = client.get(url, params=params)
    sheet_id = payload.get("spreadsheetId")
    title = payload.get("properties", {}).get("title")
    if not isinstance(sheet_id, str) or not isinstance(title, str):
        return None
    return SheetMetadata(spreadsheet_id=sheet_id, name=title)


def _to_sheet_metadata(item: dict[str, Any]) -> SheetMetadata:
    return SheetMetadata(
        spreadsheet_id=str(item.get("id") or ""),
        name=str(item.get("name") or ""),
        web_view_link=str(item.get("webViewLink")) if item.get("webViewLink") is not None else None,
        modified_time=parse_google_datetime(
            item.get("modifiedTime") if isinstance(item.get("modifiedTime"), str) else None
        ),
    )
