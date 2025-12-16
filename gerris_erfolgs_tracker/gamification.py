from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict

import streamlit as st

from gerris_erfolgs_tracker.constants import SS_GAMIFICATION
from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.models import (
    GamificationMode,
    GamificationState,
    KpiStats,
    TodoItem,
)
from gerris_erfolgs_tracker.state import persist_state

POINTS_PER_QUADRANT: Dict[EisenhowerQuadrant, int] = {
    EisenhowerQuadrant.URGENT_IMPORTANT: 20,
    EisenhowerQuadrant.NOT_URGENT_IMPORTANT: 15,
    EisenhowerQuadrant.URGENT_NOT_IMPORTANT: 10,
    EisenhowerQuadrant.NOT_URGENT_NOT_IMPORTANT: 5,
}

BADGE_FIRST_STEP = "First Step / Erster Schritt"
BADGE_CONSISTENCY_3 = "Consistency 3 / 3-Tage-Streak"
BADGE_DOUBLE_DIGITS = "Double Digits / Zweistellig"

AVATAR_ROSS_PROMPTS = [
    (
        "Ich sehe, wie viel Mühe du dir gibst – atme tief durch und mach den nächsten "
        "kleinen Schritt. / I can see how much effort you are putting in — take a deep "
        "breath and make the next small step."
    ),
    (
        "Du darfst stolz auf jeden Fortschritt sein – ich glaube an dich. / "
        "Be proud of every bit of progress — I believe in you."
    ),
    (
        "Stell dir vor, ich sitze neben dir und nicke anerkennend – du bist auf dem "
        "richtigen Weg. / Imagine me sitting next to you, nodding with appreciation — "
        "you are on the right path."
    ),
]


def _coerce_state(raw: object | None) -> GamificationState:
    if isinstance(raw, GamificationState):
        return raw
    if raw is None:
        return GamificationState()
    return GamificationState.model_validate(raw)


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
        (f"{timestamp.isoformat()} · {todo.quadrant.label}: +{points} Punkte / points · Token {completion_token}")
    )


def _award_badge(state: GamificationState, badge: str) -> None:
    if badge not in state.badges:
        state.badges.append(badge)


def _assign_badges(state: GamificationState, stats: KpiStats) -> None:
    if stats.done_total >= 1:
        _award_badge(state, BADGE_FIRST_STEP)
    if stats.streak >= 3:
        _award_badge(state, BADGE_CONSISTENCY_3)
    if stats.done_total >= 10:
        _award_badge(state, BADGE_DOUBLE_DIGITS)


def update_gamification_on_completion(todo: TodoItem, stats: KpiStats) -> GamificationState:
    if not todo.completed or todo.completed_at is None:
        return get_gamification_state()

    state = _coerce_state(st.session_state.get(SS_GAMIFICATION))
    completion_token = _completion_id(todo)
    if completion_token in state.processed_completions:
        return state

    state.processed_completions.append(completion_token)
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
        return "Wir freuen uns auf deinen nächsten Schritt. / Looking forward to your next step."
    return AVATAR_ROSS_PROMPTS[index % prompt_count]


__all__ = [
    "get_gamification_state",
    "update_gamification_on_completion",
    "calculate_progress_to_next_level",
    "next_avatar_prompt",
    "POINTS_PER_QUADRANT",
    "BADGE_FIRST_STEP",
    "BADGE_CONSISTENCY_3",
    "BADGE_DOUBLE_DIGITS",
    "AVATAR_ROSS_PROMPTS",
    "GamificationMode",
]
