from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List

import streamlit as st

from gerris_erfolgs_tracker.constants import SS_STATS
from gerris_erfolgs_tracker.models import KpiDailyEntry, KpiStats
from gerris_erfolgs_tracker.state import persist_state


def _coerce_stats(raw: object | None) -> KpiStats:
    if isinstance(raw, KpiStats):
        return raw
    if raw is None:
        return KpiStats()
    return KpiStats.model_validate(raw)


def _reset_for_new_day(stats: KpiStats, today: date) -> None:
    if stats.current_day is None:
        stats.current_day = today
        return

    if stats.current_day == today:
        return

    stats.goal_history.append(stats.goal_hit_today)
    stats.goal_history = stats.goal_history[-30:]
    stats.done_today = 0
    stats.goal_hit_today = False
    stats.current_day = today


def _ensure_daily_entry(stats: KpiStats, target_day: date) -> None:
    if stats.daily_history and stats.daily_history[-1].date == target_day:
        return

    stats.daily_history.append(KpiDailyEntry(date=target_day, completions=0))
    stats.daily_history = stats.daily_history[-30:]


def get_kpi_stats() -> KpiStats:
    stats = _coerce_stats(st.session_state.get(SS_STATS))
    today = datetime.now(timezone.utc).date()
    _reset_for_new_day(stats, today)
    _ensure_daily_entry(stats, stats.current_day or today)
    st.session_state[SS_STATS] = stats.model_dump()
    persist_state()
    return stats


def update_kpis_on_completion(completed_at: datetime | None = None) -> KpiStats:
    stats = _coerce_stats(st.session_state.get(SS_STATS))
    timestamp = (completed_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    current_day = timestamp.date()

    _reset_for_new_day(stats, current_day)
    _ensure_daily_entry(stats, current_day)

    if stats.last_completion_date is None:
        stats.streak = 1
    else:
        delta_days = (current_day - stats.last_completion_date).days
        if delta_days == 0:
            pass
        elif delta_days == 1:
            stats.streak += 1
        else:
            stats.streak = 1

    stats.done_today += 1
    stats.done_total += 1
    stats.daily_history[-1].completions += 1
    stats.goal_hit_today = stats.done_today >= stats.goal_daily
    stats.last_completion_date = current_day
    stats.current_day = current_day

    st.session_state[SS_STATS] = stats.model_dump()
    persist_state()
    return stats


def get_weekly_completion_counts(
    stats: KpiStats | None = None,
) -> List[dict[str, object]]:
    active_stats = stats or get_kpi_stats()
    today = datetime.now(timezone.utc).date()

    history_lookup: Dict[date, int] = defaultdict(int)
    for entry in active_stats.daily_history:
        history_lookup[entry.date] = entry.completions

    data: List[dict[str, object]] = []
    for offset in range(6, -1, -1):
        day = today - timedelta(days=offset)
        data.append(
            {
                "date": day.isoformat(),
                "completions": history_lookup.get(day, 0),
            }
        )

    return data


__all__ = (
    "get_kpi_stats",
    "get_weekly_completion_counts",
    "update_kpis_on_completion",
    "update_goal_daily",
)


def update_goal_daily(goal_daily: int) -> KpiStats:
    stats = _coerce_stats(st.session_state.get(SS_STATS))
    stats.goal_daily = max(1, goal_daily)
    stats.goal_hit_today = stats.done_today >= stats.goal_daily
    st.session_state[SS_STATS] = stats.model_dump()
    persist_state()
    return stats
