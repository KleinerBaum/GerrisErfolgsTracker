# AGENTS.md

> Dieses Dokument ist für **Coding Agents** (z. B. Codex) gedacht.
> Ziel: schnell lauffähig werden, Änderungen sauber einpassen, **Checks grün** halten, und den UI/UX‑Vertrag nicht brechen.

## Projektüberblick (Kontext in 30 Sekunden)

**Gerris ErfolgsTracker** ist eine Streamlit-App mit Eisenhower-ToDo-Board, Gamification und optionaler OpenAI‑Integration für KI‑Vorschläge.
Wichtig: **Ohne API‑Key** und/oder bei deaktivierter AI muss die App **voll funktionsfähig** bleiben (Fallback‑Texte/Determinismus).  
Die UI ist konsequent **Deutsch‑only** (keine englischen Begriffe in sichtbaren Texten) und nutzt ein ruhiges Dark‑Theme.  
Persistenz erfolgt primär über `gerris_state.json` (OneDrive‑Pfad bevorzugt, sonst `.data/` fallback).

## Repo-Karte: Wo ändere ich was?

Top-level:
- `app.py` → Streamlit Entry Point / App-Router.
- `gerris_erfolgs_tracker/` → Kernlogik (UI, Domain, State, Modelle).
- `tests/` → Pytest Tests.
- `docs/` → Dokumentation (u. a. Google Workspace Setup & Troubleshooting).
- `.streamlit/` → Streamlit Config + Secrets Template.
- `.ruff.toml`, `mypy.ini` → Lint/Format/Typecheck Konfiguration.
- `requirements.txt`, `requirements-dev.txt` → Dependencies (Runtime vs Dev).
- `.github/workflows/ci.yml` → CI (ruff + pytest).

Wichtige Module (greppbar):
- `gerris_erfolgs_tracker/ui/tasks.py` → Aufgaben-UI (Listen, Formulare, Quick-Edit etc.).
- `gerris_erfolgs_tracker/ui/common.py` → UI-Helfer (Badges, Dark Theme Styling).
- `gerris_erfolgs_tracker/coach/templates_de.py` → deutsche Coach-Templates.
- `gerris_erfolgs_tracker/state.py` → zentrale Session-State Initialisierung.
- `gerris_erfolgs_tracker/constants.py` → **alle** stabilen Keys (Navigation/State/…).
- `gerris_erfolgs_tracker/models.py` → Datenmodelle (Todos/KPIs/Gamification/Journal).

Domain-Logik & Completion:
- Die Abschluss-Logik muss zentral (Domain) bleiben: suche nach `toggle_complete` (z. B. `rg "toggle_complete"`), dort dürfen KPI/Gamification Updates **genau einmal** pro Abschluss passieren.

## Arbeitsmodus für Agents (Vertrag)

Wenn du (Agent) Änderungen machst:
1. **Erst lesen**: `README.md` und relevante `docs/*` (z. B. `docs/google_setup.md`, `docs/TROUBLESHOOTING.md`).
2. **Plan in kleinen Schritten** erstellen (max. 3–6 Schritte) und dann umsetzen.
3. **Verifizieren**: Lint/Format/Typecheck/Tests ausführen (siehe unten).
4. In der Antwort/PR **immer** dokumentieren:
   - Repro-Schritte (Expected vs Actual).
   - Welche Commands liefen (inkl. voller Logs bei Fehlern).
   - Welche Files/Module geändert wurden.

## Setup & Run (lokal)

Voraussetzungen:
- Python >= 3.11

Empfohlenes Dev-Setup:
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt -r requirements-dev.txt
streamlit run app.py
