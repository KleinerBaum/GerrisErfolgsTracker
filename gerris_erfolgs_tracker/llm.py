from __future__ import annotations

import os
import time
from dataclasses import dataclass, replace
from typing import Any, Iterable, Literal, Optional, Sequence, TypeVar

import streamlit as st
from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    BadRequestError,
    OpenAI,
    RateLimitError,
)
from pydantic import BaseModel
from streamlit.errors import StreamlitSecretNotFoundError

LUNA_MODEL = "gpt-5.6-luna"
TERRA_MODEL = "gpt-5.6-terra"
SOL_MODEL = "gpt-5.6-sol"
DEFAULT_MODEL = LUNA_MODEL
DEFAULT_REASONING_MODEL = LUNA_MODEL
DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_MAX_ATTEMPTS = 3
_BACKOFF_FACTOR = 1.6

ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh"]
LLMPurpose = Literal[
    "todo_quadrant",
    "motivation",
    "goal_suggestion",
    "daily_plan",
    "email_draft",
    "milestones",
    "weekly_coach",
    "journal_alignment",
    "task_analysis",
]


@dataclass(frozen=True)
class LLMPurposeConfig:
    model: str
    reasoning_effort: ReasoningEffort
    max_output_tokens: int
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


LLM_PURPOSE_CONFIGS: dict[LLMPurpose, LLMPurposeConfig] = {
    "todo_quadrant": LLMPurposeConfig(LUNA_MODEL, "none", 240),
    "motivation": LLMPurposeConfig(LUNA_MODEL, "none", 180),
    "goal_suggestion": LLMPurposeConfig(LUNA_MODEL, "low", 420),
    "daily_plan": LLMPurposeConfig(LUNA_MODEL, "low", 1_000, 30.0),
    "email_draft": LLMPurposeConfig(LUNA_MODEL, "low", 1_400, 30.0),
    "milestones": LLMPurposeConfig(LUNA_MODEL, "low", 900),
    "weekly_coach": LLMPurposeConfig(LUNA_MODEL, "low", 600),
    "journal_alignment": LLMPurposeConfig(LUNA_MODEL, "medium", 1_800, 30.0),
    "task_analysis": LLMPurposeConfig(LUNA_MODEL, "medium", 1_400, 30.0),
}

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


def get_llm_config(purpose: LLMPurpose) -> LLMPurposeConfig:
    """Return a validated purpose budget with an optional operator model override."""

    config = LLM_PURPOSE_CONFIGS[purpose]
    configured_model = _get_secret("OPENAI_MODEL")
    return replace(config, model=configured_model) if configured_model else config


def get_openai_client() -> Optional[OpenAI]:
    """Create an OpenAI client from secrets or environment variables."""

    api_key = _get_secret("OPENAI_API_KEY")
    if not api_key:
        return None

    base_url = _get_secret("OPENAI_BASE_URL")
    client_kwargs: dict[str, str] = {"api_key": api_key}
    if base_url:
        client_kwargs["base_url"] = base_url

    return OpenAI(**client_kwargs)


def _responses_resource(client: OpenAI, timeout: float) -> Any:
    return client.responses.with_options(timeout=timeout)


def request_structured_response(
    *,
    client: OpenAI,
    model: str,
    messages: Sequence[dict[str, object] | str],
    response_model: type[ParsedModelT],
    reasoning_effort: ReasoningEffort = "low",
    max_output_tokens: int = 300,
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
                reasoning={"effort": reasoning_effort},
                max_output_tokens=max_output_tokens,
                store=False,
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
    "LLMPurpose",
    "LLMPurposeConfig",
    "LLM_PURPOSE_CONFIGS",
    "LUNA_MODEL",
    "LLMError",
    "ReasoningEffort",
    "SOL_MODEL",
    "TERRA_MODEL",
    "get_default_model",
    "get_llm_config",
    "get_openai_client",
    "request_structured_response",
]
