from __future__ import annotations

from typing import Any

from gerris_erfolgs_tracker.integrations.google.client import build_google_api_client
from gerris_erfolgs_tracker.integrations.google.models import TaskItem, parse_google_datetime
from gerris_erfolgs_tracker.integrations.google.scopes import BASE_SCOPES, GOOGLE_SCOPE_TASKS

TASKS_API_BASE_URL = "https://tasks.googleapis.com/tasks/v1"

REQUIRED_SCOPES: tuple[str, ...] = (*BASE_SCOPES, GOOGLE_SCOPE_TASKS)


def list_open_tasks(
    access_token: str,
    *,
    tasklist_id: str = "@default",
    max_results: int = 10,
) -> list[TaskItem]:
    client = build_google_api_client(access_token)
    params = {
        "maxResults": max_results,
        "showCompleted": "false",
        "showHidden": "false",
    }
    url = f"{TASKS_API_BASE_URL}/lists/{tasklist_id}/tasks"
    payload = client.get(url, params=params)
    items = payload.get("items", [])
    if not isinstance(items, list):
        return []
    return [_to_task_item(item) for item in items if isinstance(item, dict)]


def _to_task_item(item: dict[str, Any]) -> TaskItem:
    return TaskItem(
        task_id=str(item.get("id") or ""),
        title=str(item.get("title") or ""),
        status=str(item.get("status")) if item.get("status") is not None else None,
        due=parse_google_datetime(item.get("due") if isinstance(item.get("due"), str) else None),
        updated=parse_google_datetime(item.get("updated") if isinstance(item.get("updated"), str) else None),
    )
