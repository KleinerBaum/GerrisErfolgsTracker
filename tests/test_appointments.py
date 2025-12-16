from datetime import datetime, timezone

from app import _format_appointment_description


def test_format_appointment_description_contains_all_fields() -> None:
    start_at = datetime(2024, 1, 1, 9, 0, tzinfo=timezone.utc)
    end_at = datetime(2024, 1, 1, 10, 0, tzinfo=timezone.utc)

    description = _format_appointment_description(
        start_at=start_at,
        end_at=end_at,
        all_day=False,
        location="Besprechungsraum 1",
        notes="Agenda: Status-Update",
    )

    assert "Start" in description
    assert "Ende" in description
    assert "Besprechungsraum 1" in description
    assert "Agenda" in description
