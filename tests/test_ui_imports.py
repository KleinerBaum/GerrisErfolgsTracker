from __future__ import annotations

import importlib


def test_tasks_importable_from_ui_package() -> None:
    import gerris_erfolgs_tracker.ui as ui

    assert importlib.import_module("gerris_erfolgs_tracker.ui.tasks") is ui.tasks


def test_tasks_direct_import_from_ui() -> None:
    from gerris_erfolgs_tracker.ui import tasks

    assert tasks is not None
