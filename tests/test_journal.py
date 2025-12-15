from __future__ import annotations

import json
from datetime import date

import streamlit as st

from app import _journal_json_export
from gerris_erfolgs_tracker.constants import SS_JOURNAL
from gerris_erfolgs_tracker.journal import get_journal_entries, get_journal_entry, upsert_journal_entry
from gerris_erfolgs_tracker.models import Category, JournalEntry
from gerris_erfolgs_tracker.state import init_state


def test_create_and_update_journal_entry(session_state) -> None:
    entry_date = date(2024, 8, 1)
    base_entry = JournalEntry(
        date=entry_date,
        moods=["ruhig"],
        mood_notes="entspannt",
        triggers_and_reactions="stressiges Gespräch",
        negative_thought="Ich komme nicht voran",
        rational_response="Ich plane kleine Schritte",
        self_care_today="Spaziergang",
        self_care_tomorrow="Früher schlafen",
        gratitude_1="Kaffee",
        gratitude_2="Sonne",
        gratitude_3="Freund:in",
        categories=[Category.ADMIN],
    )

    upsert_journal_entry(base_entry)
    stored = get_journal_entry(entry_date)
    assert stored is not None
    assert stored.gratitude_1 == "Kaffee"
    assert stored.categories == [Category.ADMIN]

    updated = base_entry.model_copy(update={"gratitude_1": "Tee", "categories": [Category.FRIENDS_FAMILY]})
    upsert_journal_entry(updated)
    refreshed = get_journal_entry(entry_date)
    assert refreshed is not None
    assert refreshed.gratitude_1 == "Tee"
    assert refreshed.categories == [Category.FRIENDS_FAMILY]


def test_journal_serialization_roundtrip(session_state) -> None:
    entry_date = date(2024, 7, 31)
    st.session_state[SS_JOURNAL] = {
        entry_date.isoformat(): {
            "date": entry_date.isoformat(),
            "moods": ["dankbar"],
            "mood_notes": "ruhig",
            "triggers_and_reactions": "Meditation",
            "negative_thought": "Zweifel",
            "rational_response": "Ich kenne meine nächsten Schritte",
            "self_care_today": "Yoga",
            "self_care_tomorrow": "früher schlafen",
            "gratitude_1": "Familie",
            "gratitude_2": "Gesundheit",
            "gratitude_3": "Lernen",
            "categories": [Category.DAILY_STRUCTURE.value],
        }
    }

    entries = get_journal_entries()
    assert entry_date in entries
    entry = entries[entry_date]
    assert entry.categories == [Category.DAILY_STRUCTURE]
    assert entry.gratitude_2 == "Gesundheit"


def test_journal_migration_missing_key(session_state) -> None:
    init_state()
    assert SS_JOURNAL in st.session_state
    assert isinstance(st.session_state[SS_JOURNAL], dict)


def test_journal_json_export_serializes_categories_and_date(session_state) -> None:
    entry_date = date(2024, 8, 5)
    entry = JournalEntry(
        date=entry_date,
        gratitude_1="Test",
        categories=[Category.ADMIN],
    )

    payload = _journal_json_export({entry_date: entry})
    parsed = json.loads(payload)

    assert parsed == {
        "2024-08-05": {
            "date": "2024-08-05",
            "moods": [],
            "mood_notes": "",
            "triggers_and_reactions": "",
            "negative_thought": "",
            "rational_response": "",
            "self_care_today": "",
            "self_care_tomorrow": "",
            "gratitude_1": "Test",
            "gratitude_2": "",
            "gratitude_3": "",
            "categories": ["admin"],
        }
    }
