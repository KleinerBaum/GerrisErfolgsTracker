from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Dict, Iterable, List, Literal, Mapping

if TYPE_CHECKING:
    from gerris_erfolgs_tracker.models import TodoItem


@dataclass(frozen=True)
class QuadrantMetadata:
    label_de: str
    label_en: str
    short_label: str
    color_hex: str
    legacy_labels: tuple[str, ...] = ()


class EisenhowerQuadrant(StrEnum):
    URGENT_IMPORTANT = "urgent_important"
    NOT_URGENT_IMPORTANT = "not_urgent_important"
    URGENT_NOT_IMPORTANT = "urgent_not_important"
    NOT_URGENT_NOT_IMPORTANT = "not_urgent_not_important"

    @property
    def metadata(self) -> QuadrantMetadata:
        return QUADRANT_METADATA[self]

    @property
    def label(self) -> str:
        metadata = self.metadata
        return f"{metadata.label_de} / {metadata.label_en}"

    @property
    def short_label(self) -> str:
        return self.metadata.short_label

    @property
    def color_hex(self) -> str:
        return self.metadata.color_hex

    @property
    def legacy_labels(self) -> tuple[str, ...]:
        return self.metadata.legacy_labels


QUADRANT_METADATA: Mapping[EisenhowerQuadrant, QuadrantMetadata] = {
    EisenhowerQuadrant.URGENT_IMPORTANT: QuadrantMetadata(
        label_de="U+I (Dringend & wichtig)",
        label_en="U+I (Urgent & important)",
        short_label="U+I",
        color_hex="#7A001F",
        legacy_labels=(
            "q1",
            "i: wichtig & dringend / important & urgent",
            "i: wichtig & dringend",
            "important & urgent",
        ),
    ),
    EisenhowerQuadrant.NOT_URGENT_IMPORTANT: QuadrantMetadata(
        label_de="I+nU (Wichtig & nicht dringend)",
        label_en="I+nU (Important & not urgent)",
        short_label="I+nU",
        color_hex="#F2C94C",
        legacy_labels=(
            "q2",
            "ii: wichtig & nicht dringend / important & not urgent",
            "ii: wichtig & nicht dringend",
            "important & not urgent",
        ),
    ),
    EisenhowerQuadrant.URGENT_NOT_IMPORTANT: QuadrantMetadata(
        label_de="nI+U (Nicht wichtig & dringend)",
        label_en="nI+U (Not important & urgent)",
        short_label="nI+U",
        color_hex="#27AE60",
        legacy_labels=(
            "q3",
            "iii: nicht wichtig & dringend / not important & urgent",
            "iii: nicht wichtig & dringend",
            "not important & urgent",
        ),
    ),
    EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT: QuadrantMetadata(
        label_de="nI+nU (Nicht wichtig & nicht dringend)",
        label_en="nI+nU (Not important & not urgent)",
        short_label="nI+nU",
        color_hex="#2D9CDB",
        legacy_labels=(
            "q4",
            "iv: nicht wichtig & nicht dringend / not important & not urgent",
            "iv: nicht wichtig & nicht dringend",
            "not important & not urgent",
        ),
    ),
}


SortKey = Literal["due_date", "created_at", "title"]


def ensure_quadrant(value: EisenhowerQuadrant | str) -> EisenhowerQuadrant:
    if isinstance(value, EisenhowerQuadrant):
        return value

    normalized = value.strip().lower()
    for quadrant, metadata in QUADRANT_METADATA.items():
        candidate_labels = (
            metadata.label_de.lower(),
            metadata.label_en.lower(),
            metadata.short_label.lower(),
            *(label.lower() for label in metadata.legacy_labels),
        )
        if normalized in candidate_labels:
            return quadrant
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


def sort_todos(todos: Iterable["TodoItem"], *, by: SortKey = "due_date") -> List["TodoItem"]:
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
    "QuadrantMetadata",
    "QUADRANT_METADATA",
    "SortKey",
    "ensure_quadrant",
    "group_by_quadrant",
    "sort_todos",
]
