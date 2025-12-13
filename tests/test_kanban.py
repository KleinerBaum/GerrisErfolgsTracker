from datetime import datetime

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import DEFAULT_KANBAN_COLUMNS, TodoKanban
from gerris_erfolgs_tracker.state import get_todos, init_state
from gerris_erfolgs_tracker.todos import add_kanban_card, add_todo, move_kanban_card


def test_default_columns_present() -> None:
    kanban = TodoKanban()
    assert [column.id for column in kanban.columns] == [column.id for column in DEFAULT_KANBAN_COLUMNS]
    assert [column.title for column in kanban.columns] == [column.title for column in DEFAULT_KANBAN_COLUMNS]


def test_moving_cards_updates_column_and_done_at(session_state: dict[str, object]) -> None:
    init_state()
    todo = add_todo("Task", quadrant=EisenhowerQuadrant.URGENT_IMPORTANT)
    card = add_kanban_card(todo.id, title="Subtask", description_md="Step")

    assert card is not None

    moved_to_doing = move_kanban_card(todo.id, card_id=card.id, direction="right")
    assert moved_to_doing is not None

    updated_todo = next(item for item in get_todos() if item.id == todo.id)
    assert updated_todo.kanban.cards[0].column_id == DEFAULT_KANBAN_COLUMNS[1].id

    moved_to_done = move_kanban_card(todo.id, card_id=card.id, direction="right")
    assert moved_to_done is not None
    assert isinstance(moved_to_done.done_at, datetime)

    refreshed_todo = next(item for item in get_todos() if item.id == todo.id)
    assert refreshed_todo.kanban.cards[0].column_id == DEFAULT_KANBAN_COLUMNS[2].id
