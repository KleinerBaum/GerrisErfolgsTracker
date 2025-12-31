from __future__ import annotations

import streamlit as st

from gerris_erfolgs_tracker.eisenhower import EisenhowerQuadrant
from gerris_erfolgs_tracker.i18n import translate_text


def quadrant_badge(quadrant: EisenhowerQuadrant, *, include_full_label: bool = False) -> str:
    label = translate_text((quadrant.short_label, quadrant.short_label))
    if include_full_label:
        full_label = translate_text(quadrant.label)
        label = f"{label} — {full_label}"
    return f"<span style='color:{quadrant.color_hex}; font-weight:600'>{label}</span>"


def _inject_dark_theme_styles() -> None:
    st.markdown(
        """
        <style>
            :root {
                --gerris-primary: #1c9c82;
                --gerris-surface: #10211f;
                --gerris-surface-alt: #0e1917;
                --gerris-border: #1f4a42;
                --gerris-text: #f3f7f5;
                --gerris-muted: #c5d5d1;
            }

            .stApp {
                background: radial-gradient(circle at 20% 20%, rgba(34, 70, 60, 0.25), transparent 30%),
                            radial-gradient(circle at 80% 0%, rgba(28, 156, 130, 0.18), transparent 30%),
                            linear-gradient(160deg, #0f1b19 0%, #0c1412 60%, #0b1311 100%);
                color: var(--gerris-text);
            }

            .block-container {
                padding-top: 1.2rem;
                padding-left: 1.5rem;
                padding-right: 1.5rem;
                max-width: 1600px;
                width: 100%;
            }

            h1, h2, h3, h4, h5, h6, label, p {
                color: var(--gerris-text);
            }

            div[data-testid="stMetric"] {
                background: linear-gradient(145deg, var(--gerris-surface), var(--gerris-surface-alt));
                border: 1px solid var(--gerris-border);
                border-radius: 14px;
                padding: 12px;
            }

            div[data-testid="stMetricValue"] {
                color: var(--gerris-text);
                font-weight: 700;
            }

            div[data-testid="stMetricDelta"] {
                color: #9ce6c3;
                font-weight: 600;
            }

            div[data-testid="stVerticalBlockBorderWrapper"] {
                border: 1px solid var(--gerris-border);
                background: linear-gradient(145deg, var(--gerris-surface), var(--gerris-surface-alt));
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 0.9rem;
            }

            [data-testid="stExpander"] {
                background: var(--gerris-surface);
                border: 1px solid var(--gerris-border);
                border-radius: 12px;
            }

            [data-testid="stExpander"] summary {
                color: var(--gerris-text);
                font-weight: 600;
            }

            .task-meta {
                color: var(--gerris-muted);
                font-size: 0.9rem;
                margin-top: -0.25rem;
            }

            .stAlert {
                margin-bottom: 0.8rem;
            }

            .stCaption {
                margin-bottom: 0.5rem;
            }

            .stButton > button,
            .stPopover button {
                background: var(--gerris-primary);
                color: #0b1311;
                border: 1px solid var(--gerris-border);
                font-weight: 600;
                line-height: 1.2;
                padding: 0.55rem 0.9rem;
                white-space: normal;
            }

            .stButton > button:hover,
            .stPopover button:hover {
                background: #23b497;
                border-color: #23b497;
                color: #0b1311;
            }

            /* Highlight today's date inside Streamlit date pickers without breaking dark mode */
            .stDateInput .flatpickr-day.today:not(.selected) {
                border: 1.5px solid var(--gerris-primary);
                background: rgba(28, 156, 130, 0.18);
                color: var(--gerris-text);
                font-weight: 700;
            }

            .stDateInput .flatpickr-day.today.selected,
            .stDateInput .flatpickr-day.today:focus {
                border: 1.5px solid var(--gerris-primary);
                background: rgba(28, 156, 130, 0.28);
                color: var(--gerris-text);
                font-weight: 700;
                box-shadow: 0 0 0 1px rgba(28, 156, 130, 0.35) inset;
            }
        </style>
    """,
        unsafe_allow_html=True,
    )
