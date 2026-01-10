from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Sequence
from urllib.parse import parse_qs, urlparse

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from gerris_erfolgs_tracker.i18n import translate_text
from gerris_erfolgs_tracker.integrations.google import (
    OAuthConfigError,
    OAuthFlowError,
    build_authorization_url,
    exchange_code_for_token,
    fetch_user_info,
    get_default_token_store,
)

GOOGLE_OAUTH_STATE_KEY = "google_oauth_state"


def _get_secret(name: str) -> str | None:
    try:
        value = st.secrets.get(name)
        if value:
            return str(value)
    except StreamlitSecretNotFoundError:
        value = None
    return os.getenv(name)


def _extract_calendar_src(value: str) -> str:
    cleaned = value.strip()
    if "://" not in cleaned:
        return cleaned
    parsed = urlparse(cleaned)
    query = parse_qs(parsed.query)
    for key in ("src", "cid"):
        if key in query and query[key]:
            return query[key][0]
    return cleaned


def _calendar_src_from_env(*, keys: Sequence[str], fallback: str | None = None) -> str | None:
    for key in keys:
        value = _get_secret(key)
        if value:
            return _extract_calendar_src(value)
    return fallback


def _load_calendar_configs() -> list[tuple[str, str]]:
    raw = _get_secret("GOOGLE_CALENDARS_JSON")
    if not raw:
        return []

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        st.warning(
            translate_text(
                (
                    "GOOGLE_CALENDARS_JSON ist kein gültiges JSON. Es werden die einzelnen Kalender-ENV-Variablen genutzt.",
                    "GOOGLE_CALENDARS_JSON is not valid JSON. Falling back to the individual calendar env vars.",
                )
            )
        )
        return []

    if not isinstance(payload, list):
        st.warning(
            translate_text(
                (
                    "GOOGLE_CALENDARS_JSON muss eine Liste von Kalender-Objekten sein.",
                    "GOOGLE_CALENDARS_JSON must be a list of calendar objects.",
                )
            )
        )
        return []

    configs: list[tuple[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        name_value = item.get("name") or item.get("key")
        if not isinstance(name_value, str):
            continue
        calendar_value = None
        for field in ("calendar_id", "ical_url"):
            candidate = item.get(field)
            if isinstance(candidate, str) and candidate.strip():
                calendar_value = candidate
                break
        if not calendar_value:
            continue
        configs.append((name_value.strip(), _extract_calendar_src(calendar_value)))

    if not configs:
        st.warning(
            translate_text(
                (
                    "GOOGLE_CALENDARS_JSON enthält keine gültigen Kalender.",
                    "GOOGLE_CALENDARS_JSON does not contain any valid calendars.",
                )
            )
        )

    return configs


def _render_calendar_iframe(*, calendar_src: str, color: str) -> None:
    iframe = f"""
    <iframe src="https://calendar.google.com/calendar/embed?height=600&wkst=1&ctz=Europe%2FAmsterdam&showPrint=0&src={calendar_src}&color={color}" style="border:solid 1px #777" width="100%" height="600" frameborder="0" scrolling="no"></iframe>
    """
    st.markdown(iframe, unsafe_allow_html=True)


def render_shared_calendar_header() -> None:
    st.markdown(
        translate_text(
            (
                "### Google Kalender",
                "### Google Calendars",
            )
        )
    )


def render_shared_calendar() -> None:
    calendar_configs = _load_calendar_configs()
    if calendar_configs:
        colors = [
            "%23616161",
            "%237986cb",
            "%23b874d9",
            "%2376a73e",
            "%23c95f2a",
        ]
        for row_start in range(0, len(calendar_configs), 2):
            row = calendar_configs[row_start : row_start + 2]
            columns = st.columns(len(row))
            for offset, (name, src) in enumerate(row):
                with columns[offset]:
                    st.markdown(translate_text((f"**{name}**", f"**{name}**")))
                    color = colors[(row_start + offset) % len(colors)]
                    _render_calendar_iframe(calendar_src=src, color=color)
        return

    shared_calendar_src = _calendar_src_from_env(
        keys=(
            "2025 von Carla, Miri & Gerrit",
            "CALENDAR_SHARED_2025",
            "KALENDER_SHARED_2025",
        ),
        fallback="e2a52f862c8088c82d9f74825b8c39f6069965fdc652472fbf5ec28e891c077e@group.calendar.google.com",
    )
    gerri_calendar_src = _calendar_src_from_env(
        keys=(
            "KalenderGerri",
            "CALENDAR_GERRI",
            "KALENDER_GERRI",
        )
    )

    if gerri_calendar_src:
        shared_column, gerri_column = st.columns(2)
        with shared_column:
            st.markdown(
                translate_text(
                    (
                        "**Gemeinsamer Kalender / 2025**",
                        "**Shared calendar / 2025**",
                    )
                )
            )
            _render_calendar_iframe(calendar_src=shared_calendar_src, color="%23616161")
        with gerri_column:
            st.markdown(translate_text(("**Kalender Gerri**", "**Gerri calendar**")))
            _render_calendar_iframe(calendar_src=gerri_calendar_src, color="%237986cb")
        return

    st.markdown(
        translate_text(
            (
                "Kalender Gerri ist noch nicht hinterlegt. Setze `KalenderGerri` (oder `CALENDAR_GERRI`) in deinen Secrets oder der Umgebung, um ihn neben dem geteilten Kalender anzuzeigen.",
                "Gerri calendar is not configured yet. Set `KalenderGerri` (or `CALENDAR_GERRI`) in your secrets or environment to show it next to the shared calendar.",
            )
        )
    )
    _render_calendar_iframe(calendar_src=shared_calendar_src, color="%23616161")


def _refresh_timestamp(service_key: str) -> str:
    now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y-%m-%d %H:%M UTC")
    st.session_state[f"workspace_refresh_{service_key}"] = timestamp
    return timestamp


def _get_last_refresh(service_key: str) -> str | None:
    value = st.session_state.get(f"workspace_refresh_{service_key}")
    if isinstance(value, str):
        return value
    return None


def _render_service_section(
    *,
    service_key: str,
    title: tuple[str, str],
    description: tuple[str, str],
    items: Sequence[str],
) -> None:
    panel = st.container(border=True)
    header_cols = panel.columns([0.75, 0.25])
    with header_cols[0]:
        panel.subheader(translate_text(title))
        panel.write(translate_text(description))
    with header_cols[1]:
        if panel.button(
            translate_text(("Aktualisieren", "Refresh")),
            key=f"workspace_refresh_{service_key}",
            type="secondary",
        ):
            _refresh_timestamp(service_key)

    last_refresh = _get_last_refresh(service_key)
    if last_refresh:
        panel.caption(
            translate_text(
                (
                    f"Zuletzt aktualisiert: {last_refresh}",
                    f"Last refreshed: {last_refresh}",
                )
            )
        )
    else:
        panel.caption(translate_text(("Noch nicht aktualisiert", "Not refreshed yet")))

    if items:
        panel.markdown("\n".join(f"- {item}" for item in items))
    else:
        panel.info(translate_text(("Keine Einträge gefunden.", "No entries found.")))


def _render_workspace_connection_panel() -> None:
    panel = st.container(border=True)
    panel.subheader(translate_text(("Google Workspace verbinden", "Connect Google Workspace")))
    panel.write(
        translate_text(
            (
                "Verbinde dein Google-Workspace-Konto, um zukünftige Integrationen wie Kalender- und Directory-Zugriffe zu aktivieren.",
                "Connect your Google Workspace account to enable future integrations like calendar and directory access.",
            )
        )
    )

    oauth_state = st.session_state.get(GOOGLE_OAUTH_STATE_KEY)
    if not oauth_state:
        oauth_state = os.urandom(16).hex()
        st.session_state[GOOGLE_OAUTH_STATE_KEY] = oauth_state

    try:
        auth_url = build_authorization_url(state=oauth_state)
    except OAuthConfigError:
        panel.error(
            translate_text(
                (
                    "Google OAuth ist noch nicht konfiguriert. Bitte hinterlege Client-ID, Secret und Redirect-URI.",
                    "Google OAuth is not configured yet. Please set the client ID, secret, and redirect URI.",
                )
            )
        )
        panel.caption(
            translate_text(
                (
                    "Erwartete Keys: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.",
                    "Expected keys: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI.",
                )
            )
        )
        return

    panel.link_button(
        translate_text(("Google Workspace verbinden", "Connect Google Workspace")),
        auth_url,
        type="primary",
    )

    code = _get_first_query_param(st.query_params.get("code"))
    state = _get_first_query_param(st.query_params.get("state"))
    if code:
        if not state or state != oauth_state:
            panel.error(
                translate_text(
                    (
                        "Die OAuth-Anfrage ist ungültig oder abgelaufen. Bitte starte den Vorgang erneut.",
                        "The OAuth request is invalid or expired. Please restart the flow.",
                    )
                )
            )
            return
        with panel.spinner(translate_text(("Google-Authentifizierung läuft...", "Completing Google authentication..."))):
            try:
                token = exchange_code_for_token(code)
                user_info = fetch_user_info(token.access_token)
                email = user_info.get("email")
                if not email:
                    raise OAuthFlowError("Missing user email in profile response.")
                token_store = get_default_token_store()
                existing_token = token_store.load_token(email)
                if not token.refresh_token and existing_token and existing_token.refresh_token:
                    token = token.with_refresh_token(existing_token.refresh_token)
                token_store.save_token(email, token)
            except OAuthFlowError:
                panel.error(
                    translate_text(
                        (
                            "Beim Abschluss der Verbindung ist ein Fehler aufgetreten. Bitte versuche es erneut.",
                            "Something went wrong while completing the connection. Please try again.",
                        )
                    )
                )
                return
        panel.success(
            translate_text(
                (
                    "Google Workspace ist verbunden. Tokens wurden gespeichert.",
                    "Google Workspace connected. Tokens have been stored.",
                )
            )
        )
        st.query_params.clear()
        st.session_state.pop(GOOGLE_OAUTH_STATE_KEY, None)


def _get_first_query_param(value: str | list[str] | None) -> str | None:
    if isinstance(value, list):
        return value[0] if value else None
    return value


def render_google_workspace_page() -> None:
    st.markdown(translate_text(("### Google Workspace", "### Google Workspace")))
    st.caption(
        translate_text(
            (
                "Übersicht über Kalender, Mail, Aufgaben und Dateien – aktuell mit Beispieldaten.",
                "Overview of calendar, mail, tasks, and files — currently with sample data.",
            )
        )
    )

    _render_workspace_connection_panel()

    st.divider()

    _render_service_section(
        service_key="calendar",
        title=("Kalender", "Calendar"),
        description=(
            "Bevorstehende Termine aus deinen geteilten Kalendern.",
            "Upcoming events from your shared calendars.",
        ),
        items=[
            translate_text(
                (
                    "Team-Standup · Heute 09:30",
                    "Team stand-up · Today 09:30",
                )
            ),
            translate_text(
                (
                    "Review-Session · Morgen 14:00",
                    "Review session · Tomorrow 14:00",
                )
            ),
            translate_text(
                (
                    "Fokusblock · Freitag 10:00",
                    "Focus block · Friday 10:00",
                )
            ),
        ],
    )
    render_shared_calendar()

    _render_service_section(
        service_key="gmail",
        title=("Gmail", "Gmail"),
        description=(
            "Neueste Threads aus deinem Posteingang.",
            "Latest threads from your inbox.",
        ),
        items=[
            translate_text(
                (
                    "Projekt-Update von Lea · Antwort bis heute",
                    "Project update from Lea · reply due today",
                )
            ),
            translate_text(
                (
                    "Kundentermin bestätigt · 2 Anhänge",
                    "Client meeting confirmed · 2 attachments",
                )
            ),
            translate_text(
                (
                    "Newsletter: Produktivitätstipps",
                    "Newsletter: productivity tips",
                )
            ),
        ],
    )

    _render_service_section(
        service_key="tasks",
        title=("Tasks", "Tasks"),
        description=(
            "Offene Aufgaben aus Google Tasks.",
            "Open items from Google Tasks.",
        ),
        items=[
            translate_text(("Follow-up bei HR", "Follow up with HR")),
            translate_text(("Rechnung prüfen", "Review invoice")),
            translate_text(("Reiseplanung finalisieren", "Finalize travel plan")),
        ],
    )

    _render_service_section(
        service_key="drive",
        title=("Drive", "Drive"),
        description=(
            "Zuletzt geöffnete Dateien in Google Drive.",
            "Recently opened files in Google Drive.",
        ),
        items=[
            translate_text(("Projekt-Roadmap.pdf", "Project roadmap.pdf")),
            translate_text(("Team-Ziele Q3", "Team goals Q3")),
            translate_text(("Budget-Entwurf.xlsx", "Budget draft.xlsx")),
        ],
    )

    _render_service_section(
        service_key="sheets",
        title=("Sheets", "Sheets"),
        description=(
            "Aktive Tabellen mit zuletzt bearbeiteten Blättern.",
            "Active spreadsheets with recently edited sheets.",
        ),
        items=[
            translate_text(("Sprint-Planung", "Sprint planning")),
            translate_text(("Personal-Tracker", "Staff tracker")),
            translate_text(("Ziel-Metriken", "Goal metrics")),
        ],
    )
