from __future__ import annotations

from typing import Any

from gerris_erfolgs_tracker.integrations.google.client import build_google_api_client
from gerris_erfolgs_tracker.integrations.google.models import TaskItem, TaskList, parse_google_datetime
from gerris_erfolgs_tracker.integrations.google.scopes import BASE_SCOPES, GOOGLE_SCOPE_TASKS
from gerris_erfolgs_tracker.integrations.google.services import GoogleService

TASKS_API_BASE_URL = "https://tasks.googleapis.com/tasks/v1"

REQUIRED_SCOPES: tuple[str, ...] = (*BASE_SCOPES, GOOGLE_SCOPE_TASKS)


def list_task_lists(service: GoogleService, *, max_results: int = 20) -> list[TaskList]:
    payload = service.get("users/@me/lists", params={"maxResults": max_results})
    items = payload.get("items", [])
    if not isinstance(items, list):
        return []
    return [_to_task_list(item) for item in items if isinstance(item, dict)]


def list_tasks(
    service: GoogleService,
    *,
    tasklist_id: str,
    max_results: int = 20,
    show_completed: bool = False,
) -> list[TaskItem]:
    params = {
        "maxResults": max_results,
        "showCompleted": str(show_completed).lower(),
        "showHidden": "false",
    }
    payload = service.get(f"lists/{tasklist_id}/tasks", params=params)
    items = payload.get("items", [])
    if not isinstance(items, list):
        return []
    return [_to_task_item(item) for item in items if isinstance(item, dict)]


def create_task(
    service: GoogleService,
    *,
    tasklist_id: str,
    title: str,
    notes: str | None = None,
) -> TaskItem:
    payload: dict[str, Any] = {"title": title}
    if notes:
        payload["notes"] = notes
    response = service.post(f"lists/{tasklist_id}/tasks", json=payload)
    return _to_task_item(response)


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


def _to_task_list(item: dict[str, Any]) -> TaskList:
    return TaskList(
        list_id=str(item.get("id") or ""),
        title=str(item.get("title") or ""),
        updated=parse_google_datetime(item.get("updated") if isinstance(item.get("updated"), str) else None),
    )
