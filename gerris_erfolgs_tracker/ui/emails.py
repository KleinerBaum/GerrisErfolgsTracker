"""Streamlit UI for drafting emails."""

from __future__ import annotations

from typing import Optional

import streamlit as st
from openai import OpenAI

from gerris_erfolgs_tracker.constants import (
    NEW_EMAIL_CONTEXT_KEY,
    NEW_EMAIL_LANGUAGE_KEY,
    NEW_EMAIL_LENGTH_KEY,
    NEW_EMAIL_OUTPUT_KEY,
    NEW_EMAIL_RECIPIENT_KEY,
    NEW_EMAIL_RESET_TRIGGER_KEY,
    NEW_EMAIL_TITLE_KEY,
    NEW_EMAIL_TONE_KEY,
)
from gerris_erfolgs_tracker.i18n import translate_text


EMAIL_TONE_OPTIONS: tuple[tuple[str, tuple[str, str]], ...] = (
    ("friendly", ("Freundlich", "Friendly")),
    ("formal", ("Formell", "Formal")),
    ("direct", ("Direkt", "Direct")),
    ("supportive", ("Unterstützend", "Supportive")),
)

EMAIL_LENGTH_OPTIONS: tuple[tuple[str, tuple[str, str]], ...] = (
    ("short", ("Kurz", "Short")),
    ("medium", ("Mittel", "Medium")),
    ("long", ("Ausführlich", "Detailed")),
)

EMAIL_LANGUAGE_OPTIONS: tuple[tuple[str, tuple[str, str]], ...] = (
    ("de", ("Deutsch", "German")),
    ("en", ("Englisch", "English")),
)


def _reset_email_state() -> None:
    for cleanup_key in (
        NEW_EMAIL_TITLE_KEY,
        NEW_EMAIL_CONTEXT_KEY,
        NEW_EMAIL_RECIPIENT_KEY,
        NEW_EMAIL_TONE_KEY,
        NEW_EMAIL_LENGTH_KEY,
        NEW_EMAIL_LANGUAGE_KEY,
        NEW_EMAIL_OUTPUT_KEY,
    ):
        st.session_state.pop(cleanup_key, None)


def _option_label(value: str, options: tuple[tuple[str, tuple[str, str]], ...]) -> str:
    for option_value, label in options:
        if option_value == value:
            return translate_text(label)
    return str(value)


def _compose_email_preview(
    *,
    title: str,
    context: str,
    recipient: str,
    tone: str,
    length: str,
    language: str,
) -> str:
    subject_prefix = translate_text(("Betreff", "Subject"))
    recipient_prefix = translate_text(("Empfänger", "Recipient"))
    intro = translate_text(("Hallo", "Hello"))
    closing = translate_text(("Viele Grüße", "Best regards"))
    language_hint = _option_label(language, EMAIL_LANGUAGE_OPTIONS)
    tone_hint = _option_label(tone, EMAIL_TONE_OPTIONS)
    length_hint = _option_label(length, EMAIL_LENGTH_OPTIONS)
    recipient_line = (
        f"{recipient_prefix}: {recipient}"
        if recipient.strip()
        else f"{recipient_prefix}: {translate_text(('Nicht angegeben', 'Not specified'))}"
    )

    detail_intro = translate_text(("Kontext", "Context"))
    details = context.strip() or translate_text(("Keine zusätzlichen Notizen.", "No additional notes."))

    return "\n".join(
        (
            f"{subject_prefix}: {title.strip() or translate_text(('Ohne Betreff', 'No subject'))}",
            recipient_line,
            "",
            f"{intro},",
            "",
            f"{detail_intro}: {details}",
            "",
            translate_text(("Ton & Länge", "Tone & length"))
            + f": {tone_hint} · {length_hint} · {language_hint}",
            "",
            closing + ",",
            translate_text(("Dein Name", "Your name")),
        )
    )


def render_emails_page(*, ai_enabled: bool, client: Optional[OpenAI]) -> None:  # noqa: ARG001
    if st.session_state.pop(NEW_EMAIL_RESET_TRIGGER_KEY, False):
        _reset_email_state()

    st.session_state.setdefault(NEW_EMAIL_TITLE_KEY, "")
    st.session_state.setdefault(NEW_EMAIL_CONTEXT_KEY, "")
    st.session_state.setdefault(NEW_EMAIL_RECIPIENT_KEY, "")
    st.session_state.setdefault(NEW_EMAIL_TONE_KEY, EMAIL_TONE_OPTIONS[0][0])
    st.session_state.setdefault(NEW_EMAIL_LENGTH_KEY, EMAIL_LENGTH_OPTIONS[1][0])
    st.session_state.setdefault(NEW_EMAIL_LANGUAGE_KEY, EMAIL_LANGUAGE_OPTIONS[0][0])
    st.session_state.setdefault(NEW_EMAIL_OUTPUT_KEY, "")

    st.markdown(f"## {translate_text(('E-Mails', 'Emails'))}")
    st.caption(
        translate_text(
            (
                "Erstelle eine E-Mail-Vorlage mit Betreff, Kontext und Tonalität. "
                "Die Vorschau lässt sich leicht kopieren oder anpassen.",
                "Create an email template with subject, context, and tone. "
                "The preview is easy to copy or tweak.",
            )
        )
    )

    tabs = st.tabs(
        [
            translate_text(("Schreiben", "Write")),
            translate_text(("Vorschau", "Preview")),
        ]
    )

    with tabs[0]:
        with st.form("email_form", clear_on_submit=False):
            main_col, meta_col = st.columns([0.6, 0.4])
            with main_col:
                st.text_input(
                    translate_text(("Titel / Betreff", "Title / Subject")),
                    key=NEW_EMAIL_TITLE_KEY,
                    placeholder=translate_text(("Worum geht es?", "What is this about?")),
                )
                st.text_input(
                    translate_text(("Empfänger (optional)", "Recipient (optional)")),
                    key=NEW_EMAIL_RECIPIENT_KEY,
                    placeholder=translate_text(("z. B. name@firma.de", "e.g., name@company.com")),
                )
                st.text_area(
                    translate_text(("Kontext / Notizen", "Context / Notes")),
                    key=NEW_EMAIL_CONTEXT_KEY,
                    placeholder=translate_text(("Wichtige Details, Stichpunkte, Ziele", "Key details, bullet points, goals")),
                    height=180,
                )

            with meta_col:
                st.selectbox(
                    translate_text(("Ton", "Tone")),
                    options=[option for option, _ in EMAIL_TONE_OPTIONS],
                    key=NEW_EMAIL_TONE_KEY,
                    format_func=lambda option: _option_label(option, EMAIL_TONE_OPTIONS),
                    help=translate_text(
                        ("Lege die Tonalität der E-Mail fest.", "Set the tone for the email draft.")
                    ),
                )
                st.selectbox(
                    translate_text(("Länge", "Length")),
                    options=[option for option, _ in EMAIL_LENGTH_OPTIONS],
                    key=NEW_EMAIL_LENGTH_KEY,
                    format_func=lambda option: _option_label(option, EMAIL_LENGTH_OPTIONS),
                    help=translate_text(("Wähle eine gewünschte Länge.", "Pick the desired length.")),
                )
                st.selectbox(
                    translate_text(("Sprache", "Language")),
                    options=[option for option, _ in EMAIL_LANGUAGE_OPTIONS],
                    key=NEW_EMAIL_LANGUAGE_KEY,
                    format_func=lambda option: _option_label(option, EMAIL_LANGUAGE_OPTIONS),
                    help=translate_text(("Wähle die Ausgabesprache.", "Choose the output language.")),
                )

            submit = st.form_submit_button(
                translate_text(("E-Mail erstellen", "Create email")),
                type="primary",
            )
            if submit:
                output = _compose_email_preview(
                    title=str(st.session_state.get(NEW_EMAIL_TITLE_KEY, "")),
                    context=str(st.session_state.get(NEW_EMAIL_CONTEXT_KEY, "")),
                    recipient=str(st.session_state.get(NEW_EMAIL_RECIPIENT_KEY, "")),
                    tone=str(st.session_state.get(NEW_EMAIL_TONE_KEY, EMAIL_TONE_OPTIONS[0][0])),
                    length=str(st.session_state.get(NEW_EMAIL_LENGTH_KEY, EMAIL_LENGTH_OPTIONS[1][0])),
                    language=str(st.session_state.get(NEW_EMAIL_LANGUAGE_KEY, EMAIL_LANGUAGE_OPTIONS[0][0])),
                )
                st.session_state[NEW_EMAIL_OUTPUT_KEY] = output
                st.success(translate_text(("Vorschau aktualisiert.", "Preview updated.")))

    with tabs[1]:
        output = str(st.session_state.get(NEW_EMAIL_OUTPUT_KEY, "")).strip()
        if output:
            st.text_area(
                translate_text(("E-Mail-Vorschau", "Email preview")),
                value=output,
                height=240,
            )
        else:
            st.info(
                translate_text(
                    ("Erstelle zuerst eine E-Mail, um die Vorschau zu sehen.", "Create an email first to see a preview.")
                )
            )

        action_cols = st.columns([0.2, 0.2, 0.6])
        with action_cols[0]:
            if st.button(
                translate_text(("Kopieren", "Copy")),
                disabled=not output,
            ):
                st.toast(translate_text(("In Zwischenablage kopiert.", "Copied to clipboard.")))
        with action_cols[1]:
            if st.button(
                translate_text(("Zurücksetzen", "Reset")),
                type="secondary",
            ):
                st.session_state[NEW_EMAIL_RESET_TRIGGER_KEY] = True
                st.rerun()

        st.caption(
            translate_text(
                (
                    "Hinweis: Nutze das Kopier-Icon im Feld, falls dein Browser das Kopieren blockiert.",
                    "Tip: Use the field's copy icon if your browser blocks direct copying.",
                )
            )
        )
