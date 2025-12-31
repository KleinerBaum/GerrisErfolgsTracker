from datetime import date

import streamlit as st

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.gamification import award_journal_points, get_gamification_state
from gerris_erfolgs_tracker.journal_alignment import suggest_journal_alignment
from gerris_erfolgs_tracker.models import (
    Category,
    JournalEntry,
    Milestone,
    MilestoneComplexity,
    MilestoneStatus,
    TodoItem,
)
from gerris_erfolgs_tracker.state import init_state


def test_fallback_alignment_detects_title() -> None:
    entry = JournalEntry(
        date=date(2024, 9, 1),
        mood_notes="Termin mit Anstreicher gemacht",  # mentions the task title indirectly
        triggers_and_reactions="Haus streichen Termin fixiert",
    )
    todo = TodoItem(
        title="Haus streichen",
        quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        category=Category.ADMIN,
    )

    suggestion = suggest_journal_alignment(entry=entry, todos=[todo], client=None)

    assert not suggestion.from_ai
    assert suggestion.payload.actions
    assert suggestion.payload.actions[0].target_title == todo.title
    assert suggestion.payload.actions[0].suggested_points > 0


def test_fallback_alignment_marks_milestone_progress() -> None:
    entry = JournalEntry(
        date=date(2024, 9, 2),
        self_care_today="Auto in die Werkstatt gebracht",
    )
    milestone = Milestone(
        title="Werkstatttermin wahrnehmen",
        complexity=MilestoneComplexity.SMALL,
        points=5,
        status=MilestoneStatus.READY,
    )
    todo = TodoItem(
        title="Auto reparieren",
        quadrant=EisenhowerQuadrant.NOT_URGENT_IMPORTANT,
        category=Category.ADMIN,
        milestones=[milestone],
        progress_target=100,
    )

    suggestion = suggest_journal_alignment(entry=entry, todos=[todo], client=None)

    assert suggestion.payload.actions
    detected = suggestion.payload.actions[0]
    assert detected.progress_delta_percent and detected.progress_delta_percent > 0
    assert milestone.id in detected.milestones_to_mark_done


def test_award_journal_points_deduplicates() -> None:
    st.session_state.clear()
    init_state()

    initial_state = award_journal_points(
        entry_date=date(2024, 9, 1),
        target_title="Haus streichen",
        points=12,
        rationale="Journaltest",
    )
    repeated_state = award_journal_points(
        entry_date=date(2024, 9, 1),
        target_title="Haus streichen",
        points=12,
        rationale="Journaltest",
    )

    assert repeated_state.points == initial_state.points
    assert "Haus streichen" in get_gamification_state().history[-1]


def test_fallback_alignment_creates_completed_task_suggestion() -> None:
    entry = JournalEntry(
        date=date(2024, 9, 3),
        mood_notes="Heute spontan die Garage aufgeräumt und den Müll entsorgt.",
    )

    suggestion = suggest_journal_alignment(entry=entry, todos=[], client=None)

    assert suggestion.payload.actions
    created = suggestion.payload.actions[0]
    assert created.create_new_todo is True
    assert created.target_id is None
    assert "garage" in created.target_title.lower()
