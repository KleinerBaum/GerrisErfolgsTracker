# Lokales Release-Gate

Vor einem PR oder einer privaten Sites-Veröffentlichung im betroffenen Runtime-Pfad ausführen:

```bash
.venv/bin/python -m ruff format --check .
.venv/bin/python -m ruff check .
.venv/bin/python -m mypy .
.venv/bin/python -m pytest -q
npm --prefix web run check
git diff --check
```

Für den Web-State müssen zusätzlich die lokale D1-Migration und der Worker-Smoke-Lauf erfolgreich sein. D1-, R2-, OAuth-, Google- und Browser-Produktionspfade gelten ohne echten Integrationslauf als unbestätigt.

## Commit-Provenienz

Vor einer Veröffentlichung muss das Sites-Projekt, die Version und der veröffentlichte Commit zum geprüften Snapshot zurückgelesen werden. Ein lokaler grüner Build belegt keine Live-Provenienz. Deployment und Sites-Readback bleiben getrennte, ausdrücklich zu dokumentierende Schritte.

```bash
git status --short --branch --untracked-files=all
git rev-parse HEAD
git diff --check
```
