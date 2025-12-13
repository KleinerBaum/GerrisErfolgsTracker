from __future__ import annotations

from datetime import date, datetime, time, timezone
from typing import Final, Literal, Optional

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant, ensure_quadrant
from gerris_erfolgs_tracker.models import Category, KanbanCard, TodoItem, TodoKanban
from gerris_erfolgs_tracker.state import get_todos, save_todos


_UNSET: Final = object()


def _ensure_kanban(todo: TodoItem) -> TodoKanban:
    kanban = todo.kanban.ensure_default_columns()
    return kanban


def _update_todo_at_index(todos: list[TodoItem], index: int, updated: TodoItem) -> None:
    todos[index] = updated
    save_todos(todos)


def _normalize_due_date(due_date: Optional[date | datetime]) -> Optional[datetime]:
    if due_date is None:
        return None

    if isinstance(due_date, datetime):
        if due_date.tzinfo is None:
            return due_date.replace(tzinfo=timezone.utc)
        return due_date

    return datetime.combine(due_date, time.min, tzinfo=timezone.utc)


def add_todo(
    title: str,
    quadrant: EisenhowerQuadrant | str,
    due_date: Optional[date | datetime] = None,
    *,
    category: Category | str = Category.DAILY_STRUCTURE,
    priority: int = 3,
    description_md: str = "",
) -> TodoItem:
    todos: list[TodoItem] = get_todos()
    todo = TodoItem(
        title=title,
        quadrant=ensure_quadrant(quadrant),
        due_date=_normalize_due_date(due_date),
        category=Category(category),
        priority=int(priority),
        description_md=description_md,
    )
    todos.append(todo)
    save_todos(todos)
    return todo


def toggle_complete(todo_id: str) -> Optional[TodoItem]:
    todos: list[TodoItem] = get_todos()
    updated: Optional[TodoItem] = None
    for index, todo in enumerate(todos):
        if todo.id != todo_id:
            continue

        completed = not todo.completed
        todos[index] = todo.model_copy(
            update={
                "completed": completed,
                "completed_at": datetime.now(timezone.utc) if completed else None,
            }
        )
        updated = todos[index]
        break

    if updated:
        save_todos(todos)
    return updated


def delete_todo(todo_id: str) -> bool:
    todos: list[TodoItem] = get_todos()
    remaining: list[TodoItem] = [todo for todo in todos if todo.id != todo_id]
    if len(remaining) == len(todos):
        return False

    save_todos(remaining)
    return True


def update_todo(
    todo_id: str,
    *,
    title: Optional[str] = None,
    quadrant: Optional[EisenhowerQuadrant | str] = None,
    due_date: Optional[date | datetime] | object = _UNSET,
    category: Optional[Category | str] = None,
    priority: Optional[int] = None,
    description_md: Optional[str] = None,
) -> Optional[TodoItem]:
    todos: list[TodoItem] = get_todos()
    updated: Optional[TodoItem] = None
    for index, todo in enumerate(todos):
        if todo.id != todo_id:
            continue

        updates: dict[str, object] = {}
        if title is not None:
            updates["title"] = title
        if quadrant is not None:
            updates["quadrant"] = ensure_quadrant(quadrant)
        if due_date is not _UNSET:
            assert due_date is None or isinstance(due_date, (date, datetime))
            updates["due_date"] = _normalize_due_date(due_date)
        if category is not None:
            updates["category"] = Category(category)
        if priority is not None:
            updates["priority"] = int(priority)
        if description_md is not None:
            updates["description_md"] = description_md

        todos[index] = todo.model_copy(update=updates)
        updated = todos[index]
        break

    if updated:
        save_todos(todos)
    return updated


def duplicate_todo(todo_id: str) -> Optional[TodoItem]:
    todos: list[TodoItem] = get_todos()
    for todo in todos:
        if todo.id != todo_id:
            continue

        return add_todo(
            title=todo.title,
            quadrant=todo.quadrant,
            due_date=todo.due_date,
            category=todo.category,
            priority=todo.priority,
            description_md=todo.description_md,
        )

    return None


def add_kanban_card(todo_id: str, *, title: str, description_md: str = "") -> Optional[KanbanCard]:
    todos: list[TodoItem] = get_todos()
    for index, todo in enumerate(todos):
        if todo.id != todo_id:
            continue

        kanban = _ensure_kanban(todo)
        card = KanbanCard(title=title, description_md=description_md, column_id=kanban.backlog_column_id())
        updated_kanban = kanban.model_copy(update={"cards": [*kanban.cards, card]})
        updated_todo = todo.model_copy(update={"kanban": updated_kanban})
        _update_todo_at_index(todos, index, updated_todo)
        return card

    return None


def move_kanban_card(
    todo_id: str,
    *,
    card_id: str,
    direction: Literal["left", "right"],
) -> Optional[KanbanCard]:
    todos: list[TodoItem] = get_todos()
    for index, todo in enumerate(todos):
        if todo.id != todo_id:
            continue

        kanban = _ensure_kanban(todo)
        ordered_columns = sorted(kanban.columns, key=lambda column: column.order)
        column_ids = [column.id for column in ordered_columns]

        card_lookup = {card.id: card for card in kanban.cards}
        card = card_lookup.get(card_id)
        if card is None:
            return None

        current_column_index = column_ids.index(card.column_id) if card.column_id in column_ids else 0
        new_column_index = current_column_index + (-1 if direction == "left" else 1)
        if new_column_index < 0 or new_column_index >= len(column_ids):
            return None

        target_column_id = column_ids[new_column_index]
        done_column_id = kanban.done_column_id()
        updated_card = card.model_copy(
            update={
                "column_id": target_column_id,
                "done_at": datetime.now(timezone.utc) if target_column_id == done_column_id else None,
            }
        )
        updated_cards = [updated_card if existing.id == card_id else existing for existing in kanban.cards]
        updated_kanban = kanban.model_copy(update={"cards": updated_cards})
        updated_todo = todo.model_copy(update={"kanban": updated_kanban})
        _update_todo_at_index(todos, index, updated_todo)
        return updated_card

    return None


__all__ = [
    "add_todo",
    "toggle_complete",
    "delete_todo",
    "duplicate_todo",
    "update_todo",
    "add_kanban_card",
    "move_kanban_card",
]
