from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Dict, Iterable, List, Literal, Mapping

if TYPE_CHECKING:
    from gerris_erfolgs_tracker.models import TodoItem


class EisenhowerQuadrant(StrEnum):
    URGENT_IMPORTANT = "urgent_important"
    NOT_URGENT_IMPORTANT = "not_urgent_important"
    URGENT_NOT_IMPORTANT = "urgent_not_important"
    NOT_URGENT_NOT_IMPORTANT = "not_urgent_not_important"

    @property
    def label(self) -> str:
        labels: Mapping[EisenhowerQuadrant, str] = {
            EisenhowerQuadrant.URGENT_IMPORTANT: "I: Wichtig & dringend / Important & urgent",
            EisenhowerQuadrant.NOT_URGENT_IMPORTANT: "II: Wichtig & nicht dringend / Important & not urgent",
            EisenhowerQuadrant.URGENT_NOT_IMPORTANT: "III: Nicht wichtig & dringend / Not important & urgent",
            EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT: "IV: Nicht wichtig & nicht dringend / Not important & not urgent",
        }
        return labels[self]


SortKey = Literal["due_date", "created_at", "title"]


def ensure_quadrant(value: EisenhowerQuadrant | str) -> EisenhowerQuadrant:
    if isinstance(value, EisenhowerQuadrant):
        return value

    legacy_map: Mapping[str, EisenhowerQuadrant] = {
        "i: wichtig & dringend / important & urgent": EisenhowerQuadrant.URGENT_IMPORTANT,
        "ii: wichtig & nicht dringend / important & not urgent": EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        "iii: nicht wichtig & dringend / not important & urgent": EisenhowerQuadrant.URGENT_NOT_IMPORTANT,
        "iv: nicht wichtig & nicht dringend / not important & not urgent": EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT,
    }
    normalized = value.strip().lower()
    if normalized in legacy_map:
        return legacy_map[normalized]
    try:
        return EisenhowerQuadrant(value)
    except ValueError as exc:  # noqa: TRY003
        raise ValueError(f"Unknown quadrant value: {value!r}") from exc


def group_by_quadrant(
    todos: Iterable["TodoItem"],
) -> Dict[EisenhowerQuadrant, List["TodoItem"]]:
    grouped: Dict[EisenhowerQuadrant, List[TodoItem]] = defaultdict(list)
    for todo in todos:
        grouped[ensure_quadrant(todo.quadrant)].append(todo)

    for quadrant in EisenhowerQuadrant:
        grouped.setdefault(quadrant, [])
    return dict(grouped)


def _due_date_sort_key(todo: "TodoItem") -> tuple[int, datetime]:
    fallback = datetime.max
    return (0 if todo.due_date is not None else 1, todo.due_date or fallback)


def sort_todos(
    todos: Iterable["TodoItem"], *, by: SortKey = "due_date"
) -> List["TodoItem"]:
    match by:
        case "due_date":
            return sorted(todos, key=_due_date_sort_key)
        case "created_at":
            return sorted(
                todos,
                key=lambda todo: (todo.created_at is None, todo.created_at),  # noqa: E731
            )
        case "title":
            return sorted(todos, key=lambda todo: todo.title.casefold())  # noqa: E731
        case _:
            raise ValueError(f"Unsupported sort key: {by}")

    return list(todos)


__all__ = [
    "EisenhowerQuadrant",
    "SortKey",
    "ensure_quadrant",
    "group_by_quadrant",
    "sort_todos",
]
