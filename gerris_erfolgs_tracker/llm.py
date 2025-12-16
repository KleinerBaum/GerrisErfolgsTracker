from __future__ import annotations

import os
import time
from typing import Any, Iterable, Optional, Sequence, TypeVar

import streamlit as st
from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    BadRequestError,
    OpenAI,
    RateLimitError,
)
from streamlit.errors import StreamlitSecretNotFoundError
from pydantic import BaseModel

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_REASONING_MODEL = "o3-mini"
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_MAX_ATTEMPTS = 3
_BACKOFF_FACTOR = 1.6

ParsedModelT = TypeVar("ParsedModelT", bound=BaseModel)


class LLMError(RuntimeError):
    """Raised when an OpenAI call fails or returns an invalid payload."""


def _get_secret(name: str) -> Optional[str]:
    try:
        value = st.secrets.get(name)
        if value:
            return str(value)
    except StreamlitSecretNotFoundError:
        value = None
    return os.getenv(name)


def get_default_model(reasoning: bool = False) -> str:
    """Return the default model name, allowing overrides via secrets/env."""

    configured_model = _get_secret("OPENAI_MODEL")
    if configured_model:
        return configured_model
    return DEFAULT_REASONING_MODEL if reasoning else DEFAULT_MODEL


def get_openai_client() -> Optional[OpenAI]:
    """Create an OpenAI client from secrets or environment variables."""

    api_key = _get_secret("OPENAI_API_KEY")
    if not api_key:
        return None

    base_url = _get_secret("OPENAI_BASE_URL")
    client_kwargs: dict[str, str] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url

    return OpenAI(**client_kwargs)  # type: ignore[arg-type]


def _responses_resource(client: OpenAI, timeout: float) -> Any:
    return client.responses.with_options(timeout=timeout)  # type: ignore[attr-defined]


def request_structured_response(
    *,
    client: OpenAI,
    model: str,
    messages: Sequence[dict[str, object] | str],
    response_model: type[ParsedModelT],
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    tools: Optional[Iterable[object]] = None,
) -> ParsedModelT:
    """Call the Responses API with structured outputs and retries."""

    attempts = 0
    delay = 1.0
    last_error: Exception | None = None
    parse_kwargs: dict[str, object] = {}
    if tools is not None:
        parse_kwargs["tools"] = tools

    while attempts < max_attempts:
        try:
            response = _responses_resource(client, timeout).parse(
                model=model,
                input=list(messages),
                text_format=response_model,
                max_output_tokens=300,
                **parse_kwargs,
            )
            parsed = response.output_parsed
            if parsed is None:
                raise LLMError("No structured content returned by the model.")
            return parsed
        except (APITimeoutError, APIConnectionError, RateLimitError) as exc:
            last_error = exc
            attempts += 1
            if attempts >= max_attempts:
                break
            time.sleep(delay)
            delay *= _BACKOFF_FACTOR
        except (BadRequestError, APIError) as exc:
            raise LLMError("OpenAI API rejected the request.") from exc
        except Exception as exc:  # noqa: BLE001
            raise LLMError("Unexpected error during OpenAI call.") from exc

    raise LLMError("OpenAI request failed after retries.") from last_error


__all__ = [
    "DEFAULT_MODEL",
    "DEFAULT_REASONING_MODEL",
    "DEFAULT_TIMEOUT_SECONDS",
    "LLMError",
    "get_default_model",
    "get_openai_client",
    "request_structured_response",
]
