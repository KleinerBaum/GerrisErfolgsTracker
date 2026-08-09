from __future__ import annotations

from scripts.check_repository_hygiene import find_forbidden_tracked_paths


def test_find_forbidden_tracked_paths_detects_generated_dependency_directories() -> None:
    paths = [
        "gerris_erfolgs_tracker/models.py",
        ".venv/bin/python",
        "nested/venv/bin/python",
        "kpi_venv/Scripts/python.exe",
        "web/node_modules/react/index.js",
        "docs/architecture.md",
    ]

    assert find_forbidden_tracked_paths(paths) == [
        ".venv/bin/python",
        "nested/venv/bin/python",
        "kpi_venv/Scripts/python.exe",
        "web/node_modules/react/index.js",
    ]
