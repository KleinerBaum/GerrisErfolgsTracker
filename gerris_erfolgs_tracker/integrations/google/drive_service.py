from __future__ import annotations

from typing import Any

from gerris_erfolgs_tracker.integrations.google.client import build_google_api_client
from gerris_erfolgs_tracker.integrations.google.models import DriveFile, parse_google_datetime
from gerris_erfolgs_tracker.integrations.google.scopes import BASE_SCOPES, GOOGLE_SCOPE_DRIVE

DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3"

REQUIRED_SCOPES: tuple[str, ...] = (*BASE_SCOPES, GOOGLE_SCOPE_DRIVE)


def list_recent_files(
    access_token: str,
    *,
    max_results: int = 10,
) -> list[DriveFile]:
    client = build_google_api_client(access_token)
    params = {
        "pageSize": max_results,
        "orderBy": "modifiedTime desc",
        "fields": "files(id,name,mimeType,modifiedTime,webViewLink,iconLink)",
    }
    url = f"{DRIVE_API_BASE_URL}/files"
    payload = client.get(url, params=params)
    items = payload.get("files", [])
    if not isinstance(items, list):
        return []
    return [_to_drive_file(item) for item in items if isinstance(item, dict)]


def _to_drive_file(item: dict[str, Any]) -> DriveFile:
    return DriveFile(
        file_id=str(item.get("id") or ""),
        name=str(item.get("name") or ""),
        mime_type=str(item.get("mimeType")) if item.get("mimeType") is not None else None,
        modified_time=parse_google_datetime(
            item.get("modifiedTime") if isinstance(item.get("modifiedTime"), str) else None
        ),
        web_view_link=str(item.get("webViewLink")) if item.get("webViewLink") is not None else None,
        icon_link=str(item.get("iconLink")) if item.get("iconLink") is not None else None,
    )
