from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Callable, Sequence, TypeVar
from urllib.parse import parse_qs, urlparse

import streamlit as st
from streamlit.errors import StreamlitSecretNotFoundError

from gerris_erfolgs_tracker.i18n import translate_text
from gerris_erfolgs_tracker.integrations.google import OAuthFlowError, get_default_token_store, get_tasks_service
from gerris_erfolgs_tracker.integrations.google.client import GoogleApiError
from gerris_erfolgs_tracker.integrations.google.models import TaskItem, TaskList
from gerris_erfolgs_tracker.integrations.google.tasks_service import create_task, list_task_lists, list_tasks

GOOGLE_CONNECTED_EMAIL_KEY = "google_connected_email"
TASKLISTS_STATE_KEY = "workspace_tasks_tasklists"
TASKS_STATE_KEY = "workspace_tasks_items"
TASKS_ERROR_STATE_KEY = "workspace_tasks_error"
TASKS_SELECTED_LIST_KEY = "workspace_tasks_selected_list"


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

    if not shared_calendar_src:
        st.warning(
            translate_text(
                (
                    "Kein geteilter Kalender konfiguriert.",
                    "No shared calendar configured.",
                )
            )
        )
        return

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


T = TypeVar("T")


def _with_backoff(action: Callable[[], T], *, retries: int = 3, base_delay: float = 0.5) -> T:
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            return action()
        except Exception as exc:
            last_error = exc
            if attempt < retries - 1:
                time.sleep(base_delay * (2**attempt))
    if last_error:
        raise last_error
    raise RuntimeError("Failed without error context.")


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


def _get_connected_email() -> str | None:
    value = st.session_state.get(GOOGLE_CONNECTED_EMAIL_KEY)
    if isinstance(value, str) and value:
        return value
    return None


def _format_task_item(task: TaskItem) -> str:
    title = task.title or translate_text(("Ohne Titel", "Untitled"))
    if task.due:
        due_value = task.due.astimezone().strftime("%Y-%m-%d")
        return translate_text((f"{title} · Fällig {due_value}", f"{title} · Due {due_value}"))
    return title


def _render_tasks_section() -> None:
    panel = st.container(border=True)
    header_cols = panel.columns([0.75, 0.25])
    with header_cols[0]:
        panel.subheader(translate_text(("Tasks", "Tasks")))
        panel.write(
            translate_text(
                (
                    "Tasklisten und offene Aufgaben aus Google Tasks.",
                    "Task lists and open items from Google Tasks.",
                )
            )
        )
    with header_cols[1]:
        refresh_clicked = panel.button(
            translate_text(("Aktualisieren", "Refresh")),
            key="workspace_refresh_tasks",
            type="secondary",
        )

    connected_email = _get_connected_email()
    if not connected_email:
        panel.info(
            translate_text(
                (
                    "Google ist nicht verbunden. Verbinde dein Konto, um Tasks zu laden.",
                    "Google is not connected. Connect your account to load Tasks.",
                )
            )
        )
        return

    token_store = get_default_token_store()
    if not token_store.load_token(connected_email):
        panel.info(
            translate_text(
                (
                    "Google ist nicht verbunden. Verbinde dein Konto, um Tasks zu laden.",
                    "Google is not connected. Connect your account to load Tasks.",
                )
            )
        )
        return

    service = get_tasks_service(connected_email, token_store)
    if refresh_clicked:
        try:
            tasklists = _with_backoff(lambda: list_task_lists(service, max_results=50))
            st.session_state[TASKLISTS_STATE_KEY] = tasklists
            if tasklists:
                current_selection = st.session_state.get(TASKS_SELECTED_LIST_KEY)
                available_ids = {task_list.list_id for task_list in tasklists}
                if current_selection not in available_ids:
                    st.session_state[TASKS_SELECTED_LIST_KEY] = tasklists[0].list_id
            selected_id = st.session_state.get(TASKS_SELECTED_LIST_KEY)
            if isinstance(selected_id, str) and selected_id:
                tasks = _with_backoff(lambda: list_tasks(service, tasklist_id=selected_id, max_results=20))
                st.session_state[TASKS_STATE_KEY] = tasks
            _refresh_timestamp("tasks")
            st.session_state.pop(TASKS_ERROR_STATE_KEY, None)
        except (GoogleApiError, OAuthFlowError) as exc:
            st.session_state[TASKS_ERROR_STATE_KEY] = str(exc)

    last_refresh = _get_last_refresh("tasks")
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

    if TASKS_ERROR_STATE_KEY in st.session_state:
        panel.error(
            translate_text(
                (
                    f"Tasks konnten nicht geladen werden: {st.session_state[TASKS_ERROR_STATE_KEY]}",
                    f"Failed to load tasks: {st.session_state[TASKS_ERROR_STATE_KEY]}",
                )
            )
        )

    tasklists_state = st.session_state.get(TASKLISTS_STATE_KEY)
    tasklists = (
        [item for item in tasklists_state if isinstance(item, TaskList)] if isinstance(tasklists_state, list) else []
    )
    if not tasklists:
        panel.info(
            translate_text(
                (
                    "Keine Tasklisten geladen. Klicke auf „Aktualisieren“, um Daten abzurufen.",
                    "No task lists loaded yet. Click “Refresh” to fetch data.",
                )
            )
        )
        return

    list_lookup = {task_list.list_id: task_list for task_list in tasklists}
    if not list_lookup:
        panel.info(translate_text(("Keine Tasklisten verfügbar.", "No task lists available.")))
        return

    selected_list_id = panel.selectbox(
        translate_text(("Taskliste auswählen", "Select task list")),
        options=list(list_lookup.keys()),
        key=TASKS_SELECTED_LIST_KEY,
        format_func=lambda option: list_lookup[option].title,
    )
    load_tasks_clicked = panel.button(
        translate_text(("Aufgaben laden", "Load tasks")),
        key="workspace_tasks_load",
    )

    if load_tasks_clicked:
        try:
            tasks = _with_backoff(lambda: list_tasks(service, tasklist_id=selected_list_id, max_results=20))
            st.session_state[TASKS_STATE_KEY] = tasks
            _refresh_timestamp("tasks")
            st.session_state.pop(TASKS_ERROR_STATE_KEY, None)
        except (GoogleApiError, OAuthFlowError) as exc:
            st.session_state[TASKS_ERROR_STATE_KEY] = str(exc)

    tasks_state = st.session_state.get(TASKS_STATE_KEY)
    tasks = [item for item in tasks_state if isinstance(item, TaskItem)] if isinstance(tasks_state, list) else []
    if tasks:
        panel.markdown("\n".join(f"- {_format_task_item(task)}" for task in tasks))
    else:
        panel.info(translate_text(("Keine Aufgaben gefunden.", "No tasks found.")))

    with panel.expander(translate_text(("Aufgabe erstellen", "Create task")), expanded=False):
        with st.form("workspace_tasks_create"):
            title = st.text_input(
                translate_text(("Titel", "Title")),
                placeholder=translate_text(("z. B. Follow-up anstoßen", "e.g. Send follow-up")),
            )
            notes = st.text_area(
                translate_text(("Notizen (optional)", "Notes (optional)")),
                placeholder=translate_text(
                    (
                        "Kurze Notiz ohne sensible Inhalte.",
                        "Short note without sensitive content.",
                    )
                ),
            )
            submit = st.form_submit_button(translate_text(("Task anlegen", "Create task")))

        if submit:
            if not title.strip():
                panel.error(
                    translate_text(
                        (
                            "Bitte gib einen Titel für die Aufgabe an.",
                            "Please provide a task title.",
                        )
                    )
                )
            else:
                with panel.spinner(translate_text(("Task wird erstellt...", "Creating task..."))):
                    try:
                        _with_backoff(
                            lambda: create_task(
                                service,
                                tasklist_id=selected_list_id,
                                title=title.strip(),
                                notes=notes.strip() if notes.strip() else None,
                            )
                        )
                        panel.success(
                            translate_text(
                                (
                                    "Task wurde erstellt.",
                                    "Task created.",
                                )
                            )
                        )
                        tasks = _with_backoff(lambda: list_tasks(service, tasklist_id=selected_list_id, max_results=20))
                        st.session_state[TASKS_STATE_KEY] = tasks
                        _refresh_timestamp("tasks")
                        st.session_state.pop(TASKS_ERROR_STATE_KEY, None)
                    except (GoogleApiError, OAuthFlowError) as exc:
                        panel.error(
                            translate_text(
                                (
                                    f"Task konnte nicht erstellt werden: {exc}",
                                    f"Failed to create task: {exc}",
                                )
                            )
                        )


def render_google_workspace_page() -> None:
    st.markdown(translate_text(("### Google Workspace", "### Google Workspace")))
    st.caption(
        translate_text(
            (
                "Übersicht über Kalender, Mail, Aufgaben und Dateien – Google Tasks sind live, der Rest zeigt noch Beispieldaten.",
                "Overview of calendar, mail, tasks, and files — Google Tasks are live, the rest still shows sample data.",
            )
        )
    )

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

    _render_tasks_section()

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
