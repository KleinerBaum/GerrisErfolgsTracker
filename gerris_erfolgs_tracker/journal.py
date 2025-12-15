from __future__ import annotations

from datetime import date
from typing import Any, Mapping

import streamlit as st

from gerris_erfolgs_tracker.constants import SS_JOURNAL
from gerris_erfolgs_tracker.models import Category, JournalEntry
from gerris_erfolgs_tracker.state import persist_state


def _default_journal_state() -> dict[str, Any]:
    return {}


def ensure_journal_state() -> None:
    if SS_JOURNAL not in st.session_state:
        st.session_state[SS_JOURNAL] = _default_journal_state()


def _coerce_categories(raw_categories: Any) -> list[Category]:
    categories: list[Category] = []
    if isinstance(raw_categories, (list, tuple, set)):
        for raw in raw_categories:
            try:
                categories.append(Category(raw))
            except Exception:
                continue
    return categories


def _coerce_entry(entry_date: date, raw: Any) -> JournalEntry:
    if isinstance(raw, JournalEntry):
        return raw

    base: Mapping[str, Any] = raw if isinstance(raw, Mapping) else {}

    migrated = dict(base)
    migrated.setdefault("moods", [])
    migrated.setdefault("mood_notes", "")
    migrated.setdefault("triggers_and_reactions", "")
    migrated.setdefault("negative_thought", "")
    migrated.setdefault("rational_response", "")
    migrated.setdefault("self_care_today", "")
    migrated.setdefault("self_care_tomorrow", "")
    migrated.setdefault("gratitudes", [])
    migrated.setdefault("gratitude_1", "")
    migrated.setdefault("gratitude_2", "")
    migrated.setdefault("gratitude_3", "")
    migrated["categories"] = _coerce_categories(migrated.get("categories", []))
    migrated["date"] = entry_date

    gratitudes = migrated.get("gratitudes", [])
    if not isinstance(gratitudes, list):
        gratitudes = []

    if not gratitudes:
        legacy_values = [
            migrated.get("gratitude_1", ""),
            migrated.get("gratitude_2", ""),
            migrated.get("gratitude_3", ""),
        ]
        gratitudes = [str(value).strip() for value in legacy_values if str(value).strip()]

    migrated["gratitudes"] = gratitudes

    return JournalEntry.model_validate(migrated)


def get_journal_entries() -> dict[date, JournalEntry]:
    ensure_journal_state()
    raw_entries: Mapping[str, Any] = st.session_state.get(SS_JOURNAL, {})
    entries: dict[date, JournalEntry] = {}

    for raw_date, raw_entry in raw_entries.items():
        try:
            entry_date = date.fromisoformat(str(raw_date))
        except Exception:
            continue
        entries[entry_date] = _coerce_entry(entry_date, raw_entry)

    return entries


def get_journal_entry(entry_date: date) -> JournalEntry | None:
    return get_journal_entries().get(entry_date)


def upsert_journal_entry(entry: JournalEntry) -> None:
    ensure_journal_state()
    persisted = dict(st.session_state.get(SS_JOURNAL, {}))
    persisted[entry.date.isoformat()] = entry.model_dump()
    st.session_state[SS_JOURNAL] = persisted
    persist_state()


def journal_gratitude_suggestions(*, exclude_date: date | None = None) -> list[str]:
    suggestions: list[str] = []
    for entry_date, entry in get_journal_entries().items():
        if exclude_date is not None and entry_date == exclude_date:
            continue
        gratitudes = entry.gratitudes or [entry.gratitude_1, entry.gratitude_2, entry.gratitude_3]
        for gratitude in gratitudes:
            value = gratitude.strip()
            if value and value not in suggestions:
                suggestions.append(value)
    return suggestions
