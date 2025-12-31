from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Dict

import streamlit as st

from gerris_erfolgs_tracker.constants import (
    GAMIFICATION_HISTORY_LIMIT,
    PROCESSED_COMPLETIONS_LIMIT,
    PROCESSED_JOURNAL_EVENTS_LIMIT,
    PROCESSED_MILESTONE_EVENTS_LIMIT,
    PROCESSED_PROGRESS_REWARDS_LIMIT,
    SS_GAMIFICATION,
    cap_list_tail,
)
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.i18n import translate_text
from gerris_erfolgs_tracker.models import (
    GamificationMode,
    GamificationState,
    KpiStats,
    Milestone,
    MilestoneStatus,
    TodoItem,
)
from gerris_erfolgs_tracker.state import persist_state

POINTS_PER_QUADRANT: Dict[EisenhowerQuadrant, int] = {
    EisenhowerQuadrant.URGENT_IMPORTANT: 20,
    EisenhowerQuadrant.NOT_URGENT_IMPORTANT: 15,
    EisenhowerQuadrant.URGENT_NOT_IMPORTANT: 10,
    EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT: 5,
}

BADGE_FIRST_STEP = "Erster Schritt"
BADGE_CONSISTENCY_3 = "3-Tage-Streak"
BADGE_CONSISTENCY_7 = "7-Tage-Streak"
BADGE_CONSISTENCY_30 = "30-Tage-Streak"
BADGE_DOUBLE_DIGITS = "Zweistellig"
BADGE_TASK_MASTER = "Task Master (100 erledigte Aufgaben)"

PROGRESS_REWARD_THRESHOLDS: tuple[float, ...] = (0.25, 0.5, 0.75)
PROGRESS_REWARD_POINTS = 5
MIN_MILESTONE_POINTS = 5

AVATAR_ROSS_PROMPTS = [
    ("Ich sehe, wie viel Mühe du dir gibst – atme tief durch und mach den nächsten kleinen Schritt."),
    ("Du darfst stolz auf jeden Fortschritt sein – ich glaube an dich."),
    ("Stell dir vor, ich sitze neben dir und nicke anerkennend – du bist auf dem richtigen Weg."),
]


def _coerce_state(raw: object | None) -> GamificationState:
    if isinstance(raw, GamificationState):
        return raw.model_copy(
            update={
                "history": cap_list_tail(list(raw.history), GAMIFICATION_HISTORY_LIMIT),
                "processed_completions": cap_list_tail(list(raw.processed_completions), PROCESSED_COMPLETIONS_LIMIT),
                "processed_journal_events": cap_list_tail(
                    list(raw.processed_journal_events), PROCESSED_JOURNAL_EVENTS_LIMIT
                ),
                "processed_milestone_events": cap_list_tail(
                    list(raw.processed_milestone_events), PROCESSED_MILESTONE_EVENTS_LIMIT
                ),
                "processed_progress_rewards": cap_list_tail(
                    list(raw.processed_progress_rewards), PROCESSED_PROGRESS_REWARDS_LIMIT
                ),
            }
        )
    if raw is None:
        return GamificationState()
    state = GamificationState.model_validate(raw)
    state.history = cap_list_tail(list(state.history), GAMIFICATION_HISTORY_LIMIT)
    state.processed_completions = cap_list_tail(list(state.processed_completions), PROCESSED_COMPLETIONS_LIMIT)
    state.processed_journal_events = cap_list_tail(list(state.processed_journal_events), PROCESSED_JOURNAL_EVENTS_LIMIT)
    state.processed_milestone_events = cap_list_tail(
        list(state.processed_milestone_events), PROCESSED_MILESTONE_EVENTS_LIMIT
    )
    state.processed_progress_rewards = cap_list_tail(
        list(state.processed_progress_rewards), PROCESSED_PROGRESS_REWARDS_LIMIT
    )
    return state


def get_gamification_state() -> GamificationState:
    state = _coerce_state(st.session_state.get(SS_GAMIFICATION))
    st.session_state[SS_GAMIFICATION] = state.model_dump()
    persist_state()
    return state


def _completion_id(todo: TodoItem) -> str:
    timestamp = (todo.completed_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return f"{todo.id}:{timestamp.isoformat()}"


def _log_completion_event(state: GamificationState, todo: TodoItem, *, points: int, completion_token: str) -> None:
    timestamp = (todo.completed_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    state.history.append(
        (f"{timestamp.isoformat()} · {todo.quadrant.label}: +{points} Punkte · Token {completion_token}")
    )
    state.history = cap_list_tail(state.history, GAMIFICATION_HISTORY_LIMIT)


def _award_badge(state: GamificationState, badge: str) -> None:
    if badge not in state.badges:
        state.badges.append(badge)


def _assign_badges(state: GamificationState, stats: KpiStats) -> None:
    if stats.done_total >= 1:
        _award_badge(state, BADGE_FIRST_STEP)
    if stats.streak >= 3:
        _award_badge(state, BADGE_CONSISTENCY_3)
    if stats.streak >= 7:
        _award_badge(state, BADGE_CONSISTENCY_7)
    if stats.streak >= 30:
        _award_badge(state, BADGE_CONSISTENCY_30)
    if stats.done_total >= 10:
        _award_badge(state, BADGE_DOUBLE_DIGITS)
    if stats.done_total >= 100:
        _award_badge(state, BADGE_TASK_MASTER)


def _journal_event_token(entry_date: date, target_title: str) -> str:
    normalized_title = target_title.strip().lower().replace(" ", "-")
    return f"journal:{entry_date.isoformat()}:{normalized_title}"


def _milestone_event_token(todo: TodoItem, milestone: Milestone) -> str:
    return f"milestone:{todo.id}:{milestone.id}"


def _progress_reward_token(todo: TodoItem, threshold: float) -> str:
    percent = int(threshold * 100)
    return f"progress:{todo.id}:{percent}"


def _log_history(state: GamificationState, message: str) -> None:
    state.history.append(message)
    state.history = cap_list_tail(state.history, GAMIFICATION_HISTORY_LIMIT)


def award_journal_points(
    *,
    entry_date: date,
    target_title: str,
    points: int,
    rationale: str,
) -> GamificationState:
    """Add gamification points for journal-aligned actions with deduplication."""

    sanitized_points = max(0, points)
    state = _coerce_state(st.session_state.get(SS_GAMIFICATION))
    token = _journal_event_token(entry_date, target_title)
    if token in state.processed_journal_events or sanitized_points == 0:
        return state

    state.processed_journal_events.append(token)
    state.processed_journal_events = cap_list_tail(state.processed_journal_events, PROCESSED_JOURNAL_EVENTS_LIMIT)
    state.points += sanitized_points
    state.level = max(1, 1 + state.points // 100)
    _log_history(
        state,
        f"{entry_date.isoformat()} · Journal: +{sanitized_points} Punkte für {target_title} · {rationale}",
    )
    st.session_state[SS_GAMIFICATION] = state.model_dump()
    persist_state()
    return state


def award_milestone_points(*, todo: TodoItem, milestone: Milestone) -> GamificationState:
    state = _coerce_state(st.session_state.get(SS_GAMIFICATION))
    token = _milestone_event_token(todo, milestone)
    if milestone.status is not MilestoneStatus.DONE or token in state.processed_milestone_events:
        return state

    points = max(milestone.points, MIN_MILESTONE_POINTS)
    state.processed_milestone_events.append(token)
    state.processed_milestone_events = cap_list_tail(state.processed_milestone_events, PROCESSED_MILESTONE_EVENTS_LIMIT)
    state.points += points
    state.level = max(1, 1 + state.points // 100)
    _log_history(
        state,
        f"{datetime.now(timezone.utc).isoformat()} · Meilenstein '{milestone.title}' erledigt: +{points} Punkte",
    )
    st.toast(
        translate_text(
            (
                f"✅ Meilenstein abgeschlossen: +{points} Punkte",
                f"✅ Milestone completed: +{points} points",
            )
        )
    )
    st.session_state[SS_GAMIFICATION] = state.model_dump()
    persist_state()
    return state


def award_progress_points(*, todo: TodoItem, previous_progress: float, updated_progress: float) -> GamificationState:
    state = _coerce_state(st.session_state.get(SS_GAMIFICATION))
    if todo.progress_target is None or todo.progress_target <= 0:
        return state

    newly_crossed: list[float] = []
    for threshold in PROGRESS_REWARD_THRESHOLDS:
        token = _progress_reward_token(todo, threshold)
        if token in state.processed_progress_rewards:
            continue

        target_value = todo.progress_target * threshold
        if previous_progress < target_value <= updated_progress:
            newly_crossed.append(threshold)
            state.processed_progress_rewards.append(token)

    if not newly_crossed:
        return state

    state.processed_progress_rewards = cap_list_tail(state.processed_progress_rewards, PROCESSED_PROGRESS_REWARDS_LIMIT)
    gained_points = PROGRESS_REWARD_POINTS * len(newly_crossed)
    state.points += gained_points
    state.level = max(1, 1 + state.points // 100)

    thresholds_pct = ", ".join(f"{int(threshold * 100)}%" for threshold in newly_crossed)
    _log_history(
        state,
        f"{datetime.now(timezone.utc).isoformat()} · Fortschritt bei '{todo.title}' ({thresholds_pct})"
        f" · +{gained_points} Punkte",
    )
    st.toast(
        translate_text(
            (
                f"💪 Fortschritt erreicht ({thresholds_pct}): +{gained_points} Punkte",
                f"💪 Progress reached ({thresholds_pct}): +{gained_points} points",
            )
        )
    )
    st.session_state[SS_GAMIFICATION] = state.model_dump()
    persist_state()
    return state


def update_gamification_on_completion(todo: TodoItem, stats: KpiStats) -> GamificationState:
    if not todo.completed or todo.completed_at is None:
        return get_gamification_state()

    state = _coerce_state(st.session_state.get(SS_GAMIFICATION))
    completion_token = _completion_id(todo)
    if completion_token in state.processed_completions:
        return state

    state.processed_completions.append(completion_token)
    state.processed_completions = cap_list_tail(state.processed_completions, PROCESSED_COMPLETIONS_LIMIT)
    points_gained = POINTS_PER_QUADRANT.get(todo.quadrant, 10)

    _log_completion_event(state, todo, points=points_gained, completion_token=completion_token)

    state.points += points_gained
    state.level = max(1, 1 + state.points // 100)

    _assign_badges(state, stats)
    st.session_state[SS_GAMIFICATION] = state.model_dump()
    persist_state()
    return state


def calculate_progress_to_next_level(
    state: GamificationState,
) -> tuple[int, int, float]:
    current_level_floor = (state.level - 1) * 100
    next_level_target = state.level * 100
    progress_points = max(0, state.points - current_level_floor)
    required_points = max(1, next_level_target - current_level_floor)
    progress_ratio = min(1.0, progress_points / required_points)
    return progress_points, required_points, progress_ratio


def next_avatar_prompt(index: int) -> str:
    prompt_count = len(AVATAR_ROSS_PROMPTS)
    if prompt_count == 0:
        return "Wir freuen uns auf deinen nächsten Schritt."
    return AVATAR_ROSS_PROMPTS[index % prompt_count]


__all__ = [
    "get_gamification_state",
    "update_gamification_on_completion",
    "calculate_progress_to_next_level",
    "next_avatar_prompt",
    "POINTS_PER_QUADRANT",
    "BADGE_FIRST_STEP",
    "BADGE_CONSISTENCY_3",
    "BADGE_CONSISTENCY_7",
    "BADGE_CONSISTENCY_30",
    "BADGE_DOUBLE_DIGITS",
    "BADGE_TASK_MASTER",
    "AVATAR_ROSS_PROMPTS",
    "GamificationMode",
    "award_milestone_points",
    "award_progress_points",
]
