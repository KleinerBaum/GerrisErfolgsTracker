"""Reject generated local environments that accidentally enter the Git index."""

from __future__ import annotations

import subprocess
import sys
from collections.abc import Iterable
from pathlib import Path, PurePosixPath

FORBIDDEN_DIRECTORY_NAMES = frozenset({".venv", "venv", "kpi_venv", "node_modules"})


def find_forbidden_tracked_paths(paths: Iterable[str]) -> list[str]:
    """Return Git paths that contain a generated local dependency directory."""

    return [path for path in paths if any(part in FORBIDDEN_DIRECTORY_NAMES for part in PurePosixPath(path).parts)]


def tracked_paths(repo_root: Path) -> list[str]:
    """Read the Git index as NUL-delimited paths so filenames remain unambiguous."""

    completed = subprocess.run(
        ["git", "ls-files", "-z"],
        cwd=repo_root,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if completed.returncode:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(detail or "Git-Index konnte nicht gelesen werden.")

    return [path.decode("utf-8", errors="surrogateescape") for path in completed.stdout.split(b"\0") if path]


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    try:
        forbidden_paths = find_forbidden_tracked_paths(tracked_paths(repo_root))
    except RuntimeError as exc:
        print(f"Repository-Hygieneprüfung fehlgeschlagen: {exc}", file=sys.stderr)
        return 2

    if not forbidden_paths:
        return 0

    print("Lokale Abhängigkeitsumgebungen dürfen nicht versioniert werden:", file=sys.stderr)
    for path in forbidden_paths:
        print(f"- {path}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
