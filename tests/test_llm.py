from __future__ import annotations

from types import SimpleNamespace

from pydantic import BaseModel

from gerris_erfolgs_tracker import llm


class _ParsedFixture(BaseModel):
    value: str


class _FakeResponses:
    def __init__(self) -> None:
        self.timeout: float | None = None
        self.kwargs: dict[str, object] = {}

    def with_options(self, *, timeout: float) -> _FakeResponses:
        self.timeout = timeout
        return self

    def parse(self, **kwargs: object) -> SimpleNamespace:
        self.kwargs = kwargs
        return SimpleNamespace(output_parsed=_ParsedFixture(value="ok"))


def test_all_streamlit_purposes_use_luna_with_the_expected_effort() -> None:
    expected = {
        "todo_quadrant": "none",
        "motivation": "none",
        "goal_suggestion": "low",
        "daily_plan": "low",
        "email_draft": "low",
        "milestones": "low",
        "weekly_coach": "low",
        "journal_alignment": "medium",
        "task_analysis": "medium",
    }

    assert set(llm.LLM_PURPOSE_CONFIGS) == set(expected)
    for purpose, effort in expected.items():
        config = llm.LLM_PURPOSE_CONFIGS[purpose]  # type: ignore[index]
        assert config.model == "gpt-5.6-luna"
        assert config.reasoning_effort == effort
        assert config.max_output_tokens > 0


def test_operator_model_override_is_preserved(monkeypatch) -> None:
    monkeypatch.setattr(
        llm,
        "_get_secret",
        lambda name: "operator-model" if name == "OPENAI_MODEL" else None,
    )

    config = llm.get_llm_config("journal_alignment")

    assert config.model == "operator-model"
    assert config.reasoning_effort == "medium"
    assert config.max_output_tokens == 1_800


def test_structured_response_passes_effort_limit_and_store_false() -> None:
    responses = _FakeResponses()
    client = SimpleNamespace(responses=responses)

    parsed = llm.request_structured_response(
        client=client,  # type: ignore[arg-type]
        model="gpt-5.6-luna",
        messages=[{"role": "user", "content": "Test"}],
        response_model=_ParsedFixture,
        reasoning_effort="xhigh",
        max_output_tokens=777,
        timeout=12.5,
    )

    assert parsed.value == "ok"
    assert responses.timeout == 12.5
    assert responses.kwargs["model"] == "gpt-5.6-luna"
    assert responses.kwargs["reasoning"] == {"effort": "xhigh"}
    assert responses.kwargs["max_output_tokens"] == 777
    assert responses.kwargs["store"] is False
