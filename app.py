from __future__ import annotations

import os
from typing import Optional

import streamlit as st
from openai import OpenAI
from pydantic import BaseModel, Field

from gerris_erfolgs_tracker.state import init_state

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
            api_key=st.secrets.get("OPENAI_API_KEY")
            or os.getenv("OPENAI_API_KEY"),
            base_url=st.secrets.get("OPENAI_BASE_URL")
            or os.getenv("OPENAI_BASE_URL"),
        )

    def create_client(self) -> Optional[OpenAI]:
        if not self.api_key:
            return None

        client_kwargs: dict[str, str] = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url

        return OpenAI(**client_kwargs)


def main() -> None:
    st.set_page_config(page_title="Gerris ErfolgsTracker", page_icon="✅")
        init_state()
    st.title("Gerris ErfolgsTracker")
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
