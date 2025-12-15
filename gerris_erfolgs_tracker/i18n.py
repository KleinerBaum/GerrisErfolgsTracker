"""Utilities for lightweight localization based on the active language toggle."""

from __future__ import annotations

from functools import wraps
from typing import Iterable, Literal, Mapping

import streamlit as st
from streamlit.delta_generator import DeltaGenerator

LanguageCode = Literal["de", "en"]
DEFAULT_LANGUAGE: LanguageCode = "de"
LANGUAGE_KEY = "language"
LANGUAGE_OPTIONS: dict[str, LanguageCode] = {"Deutsch": "de", "English": "en"}


def get_language() -> LanguageCode:
    """Return the active language stored in session state.

    Defaults to German ("de") and persists the selection.
    """

    language = st.session_state.get(LANGUAGE_KEY)
    if language in ("de", "en"):
        return language

    st.session_state[LANGUAGE_KEY] = DEFAULT_LANGUAGE
    return DEFAULT_LANGUAGE


def set_language(language: LanguageCode) -> None:
    """Persist the chosen language in session state."""

    st.session_state[LANGUAGE_KEY] = language


def translate_text(text: str | tuple[str, str]) -> str:
    """Return the text for the active language.

    Strings that contain " / " delimiters are split into alternating German and
    English fragments. A tuple of two strings may also be provided explicitly.
    """

    language = get_language()

    if isinstance(text, tuple) and len(text) == 2:
        german, english = text
        return german if language == "de" else english

    if isinstance(text, str) and " / " in text:
        fragments = text.split(" / ")
        german_text = " ".join(fragments[::2]).strip()
        english_text = " ".join(fragments[1::2]).strip()
        return german_text if language == "de" else english_text

    return text if isinstance(text, str) else text


def translate_value(value: object) -> object:
    """Recursively translate strings for Streamlit UI arguments."""

    if isinstance(value, tuple) and len(value) == 2 and all(isinstance(part, str) for part in value):
        return translate_text(value)

    if isinstance(value, str):
        return translate_text(value)

    if isinstance(value, list):
        return [translate_value(item) for item in value]

    if isinstance(value, tuple):
        return tuple(translate_value(item) for item in value)

    if isinstance(value, Mapping):
        return {key: translate_value(val) for key, val in value.items()}

    return value


def _wrap_method(method_name: str, *, delta_generator: type[DeltaGenerator]) -> None:
    original = getattr(delta_generator, method_name, None)
    if original is None or getattr(original, "_is_localized", False):
        return

    @wraps(original)
    def wrapper(self: DeltaGenerator, *args: object, **kwargs: object):
        localized_args = [translate_value(arg) for arg in args]
        localized_kwargs = {key: value if key == "key" else translate_value(value) for key, value in kwargs.items()}
        return original(self, *localized_args, **localized_kwargs)

    setattr(wrapper, "_is_localized", True)
    setattr(delta_generator, method_name, wrapper)


def localize_streamlit(methods: Iterable[str] | None = None) -> None:
    """Patch common Streamlit methods to auto-translate bilingual strings."""

    default_methods = (
        "title",
        "header",
        "subheader",
        "markdown",
        "text",
        "caption",
        "info",
        "warning",
        "error",
        "success",
        "write",
        "radio",
        "selectbox",
        "multiselect",
        "checkbox",
        "toggle",
        "button",
        "text_input",
        "text_area",
        "number_input",
        "date_input",
        "slider",
        "metric",
        "tabs",
        "expander",
        "popover",
    )
    for method_name in methods or default_methods:
        _wrap_method(method_name, delta_generator=DeltaGenerator)


__all__ = [
    "DEFAULT_LANGUAGE",
    "LANGUAGE_KEY",
    "LANGUAGE_OPTIONS",
    "LanguageCode",
    "get_language",
    "localize_streamlit",
    "set_language",
    "translate_text",
    "translate_value",
]
