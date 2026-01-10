from __future__ import annotations

import os
from typing import Sequence, TypedDict

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError


class CalendarConfig(TypedDict):
    key: str
    name: str
    calendar_id: str | None
    ical_url: str | None


def _get_secret(name: str) -> str | None:
    try:
        value = st.secrets.get(name)
        if value:
            return str(value)
    except StreamlitSecretNotFoundError:
        value = None
    if value:
        return str(value)
    env_value = os.getenv(name)
    if env_value:
        return str(env_value)
    return None


def _first_secret(keys: Sequence[str]) -> str | None:
    for key in keys:
        value = _get_secret(key)
        if value:
            return value.strip()
    return None


def _build_calendar(
    *,
    key: str,
    default_name: str,
    name_keys: Sequence[str],
    calendar_id_keys: Sequence[str],
    ical_url_keys: Sequence[str],
) -> CalendarConfig | None:
    name = _first_secret(name_keys) or default_name
    calendar_id = _first_secret(calendar_id_keys)
    ical_url = _first_secret(ical_url_keys)
    if not calendar_id and not ical_url:
        return None
    return {
        "key": key,
        "name": name,
        "calendar_id": calendar_id,
        "ical_url": ical_url,
    }


def load_calendars() -> list[CalendarConfig]:
    calendars: list[CalendarConfig] = []
    gerri = _build_calendar(
        key="gerri",
        default_name="Gerri",
        name_keys=("CAL_GERRI_NAME",),
        calendar_id_keys=(
            "CAL_GERRI_ID",
            "id_gerri",
            "id gerri",
            "KalenderGerri",
            "Kalender Gerri",
        ),
        ical_url_keys=(
            "CAL_GERRI_ICAL_URL",
            "ical_Gerri",
            "ical Gerri",
            "KalenderGerri",
            "Kalender Gerri",
        ),
    )
    if gerri:
        calendars.append(gerri)

    cal_2025 = _build_calendar(
        key="cal_2025",
        default_name="2025 von Carla, Miri & Gerrit",
        name_keys=("CAL_2025_NAME",),
        calendar_id_keys=(
            "CAL_2025_ID",
            "2025 von Carla, Miri & Gerrit",
            "CALENDAR_SHARED_2025",
            "KALENDER_SHARED_2025",
        ),
        ical_url_keys=(
            "CAL_2025_ICAL_URL",
            "ical_2025",
            "ical 2025",
            "CALENDAR_SHARED_2025",
            "KALENDER_SHARED_2025",
        ),
    )
    if cal_2025:
        calendars.append(cal_2025)

    return calendars


__all__ = ["CalendarConfig", "load_calendars"]
