from __future__ import annotations

import os
from datetime import date
from typing import Optional

import streamlit as st
from openai import OpenAI
from pydantic import BaseModel, Field

from gerris_erfolgs_tracker.state import get_todos, init_state
from gerris_erfolgs_tracker.todos import (
    add_todo,
    delete_todo,
    toggle_complete,
    update_todo,
)

class OpenAIConfig(BaseModel):
    """Configuration for connecting to the OpenAI API."""

    api_key: Optional[str] = Field(
        default=None,
        description="API key for authenticating with OpenAI.",
    )
    base_url: Optional[str] = Field(
        default=None,
        description="Optional custom base URL (e.g., EU endpoint).",
    )

    @classmethod
    def from_environment(cls) -> "OpenAIConfig":
        return cls(
            api_key=st.secrets.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY"),
            base_url=st.secrets.get("OPENAI_BASE_URL") or os.getenv("OPENAI_BASE_URL"),
        )

    def create_client(self) -> Optional[OpenAI]:
        if not self.api_key:
            return None

        client_kwargs: dict[str, str] = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url

        return OpenAI(**client_kwargs)

def render_todo_section() -> None:
    todos = get_todos()
    quadrant_options = [
        "I: Wichtig & dringend / Important & urgent",
        "II: Wichtig & nicht dringend / Important & not urgent",
        "III: Nicht wichtig & dringend / Not important & urgent",
        "IV: Nicht wichtig & nicht dringend / Not important & not urgent",
    ]

    with st.form("add_todo_form", clear_on_submit=True):
        title = st.text_input(
            "Titel / Title",
            placeholder="Nächstes ToDo eingeben / Enter next task",
        )
        col_left, col_right = st.columns(2)
        with col_left:
            due_date: Optional[date] = st.date_input(
                "Fälligkeitsdatum / Due date",
                value=None,
                format="YYYY-MM-DD",
            )
        with col_right:
            quadrant = st.selectbox(
                "Eisenhower-Quadrant / Quadrant",
                quadrant_options,
            )

        submitted = st.form_submit_button("ToDo hinzufügen / Add task")
        if submitted:
            if not title.strip():
                st.warning("Bitte Titel angeben / Please provide a title.")
            else:
                add_todo(title=title.strip(), quadrant=quadrant, due_date=due_date)
                st.success("ToDo gespeichert / Task saved.")
                st.experimental_rerun()

    filter_selection = st.radio(
        "Filter", ["Alle / All", "Offen / Open", "Erledigt / Done"], horizontal=True
    )

    filtered_todos = todos
    if "Offen" in filter_selection or "Open" in filter_selection:
        filtered_todos = [todo for todo in todos if not todo.completed]
    elif "Erledigt" in filter_selection or "Done" in filter_selection:
        filtered_todos = [todo for todo in todos if todo.completed]

    if not filtered_todos:
        st.info("Keine ToDos vorhanden / No tasks yet.")
        return

    for todo in filtered_todos:
        with st.container():
            title_col, status_col, edit_col, delete_col = st.columns([4, 1, 1, 1])

            status = "✅ Erledigt" if todo.completed else "⏳ Offen"
            due_info = (
                f" | 📅 {todo.due_date.date()}" if todo.due_date is not None else ""
            )
            title_col.markdown(
                f"**{todo.title}** ({todo.quadrant}) — {status}{due_info}"
            )

            if status_col.button(
                "Erledigt / Done", key=f"complete_{todo.id}", help="Status umschalten"
            ):
                toggle_complete(todo.id)
                st.experimental_rerun()

            with edit_col.expander("Bearbeiten / Edit"):
                with st.form(f"edit_form_{todo.id}"):
                    new_title = st.text_input(
                        "Titel / Title",
                        value=todo.title,
                        key=f"edit_title_{todo.id}",
                    )
                    new_due = st.date_input(
                        "Fälligkeitsdatum / Due date",
                        value=todo.due_date.date() if todo.due_date else None,
                        format="YYYY-MM-DD",
                        key=f"edit_due_{todo.id}",
                    )
                    quadrant_index = (
                        quadrant_options.index(todo.quadrant)
                        if todo.quadrant in quadrant_options
                        else 0
                    )
                    new_quadrant = st.selectbox(
                        "Eisenhower-Quadrant / Quadrant",
                        quadrant_options,
                        index=quadrant_index,
                        key=f"edit_quadrant_{todo.id}",
                    )
                    submitted_edit = st.form_submit_button("Speichern / Save")
                    if submitted_edit:
                        update_todo(
                            todo.id,
                            title=new_title.strip(),
                            quadrant=new_quadrant,
                            due_date=new_due,
                        )
                        st.success("Aktualisiert / Updated.")
                        st.experimental_rerun()

            if delete_col.button(
                "Löschen / Delete", key=f"delete_{todo.id}", help="Aufgabe entfernen"
            ):
                delete_todo(todo.id)
                st.experimental_rerun()


def main() -> None:
    st.set_page_config(page_title="Gerris ErfolgsTracker", page_icon="✅")
    init_state()
    st.title("Gerris ErfolgsTracker")
    
    st.header("ToDos / Tasks")
    render_todo_section()

    st.divider()
    st.header("OpenAI Demo")
    st.write(
        """
        Willkommen! Dieses kleine Dashboard demonstriert eine minimale Streamlit-App
        mit optionaler OpenAI-Integration. Füge einen Prompt hinzu und nutze deinen
        eigenen API-Key, um eine Antwort vom Modell zu erhalten.
        """
    )

    config = OpenAIConfig.from_environment()
    client = config.create_client()

    prompt: str = st.text_area("Eingabe / Prompt (EN/DE)", height=160)
    model: str = st.selectbox(
        "Modell", ["gpt-4o-mini", "o3-mini"], index=0, help="Standard: gpt-4o-mini"
    )

    if not config.api_key:
        st.info(
            "Kein OPENAI_API_KEY gefunden. Hinterlege den Schlüssel lokal in der "
            "Umgebung oder in den Streamlit Secrets, um Antworten zu erhalten."
        )

    if st.button("Antwort generieren"):
        if not prompt.strip():
            st.warning("Bitte gib einen Prompt ein, bevor du fortfährst.")
            st.stop()

        if not client:
            st.error(
                "Es wurde kein OPENAI_API_KEY gefunden. Lege den Key als Environment-"
                "Variable oder in Streamlit Secrets an."
            )
            st.stop()
            return

        with st.spinner("Modell wird abgefragt..."):
            try:
                response = client.responses.create(
                    model=model,
                    input=[{"role": "user", "content": prompt}],
                )
                answer = response.output[0].content[0].text if response.output else ""
                st.success("Antwort erhalten")
                st.write(answer)
            except Exception as exc:  # noqa: BLE001
                st.error(
                    "Die Anfrage an die OpenAI API ist fehlgeschlagen. Bitte prüfe deinen "
                    "Schlüssel oder versuche es später erneut."
                )
                st.exception(exc)


if __name__ == "__main__":
    main()
