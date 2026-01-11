# AGENTS.md

Agenten-Anleitung für **GerrisErfolgsTracker** (Python/Streamlit).

Dieses Dokument ist absichtlich **agenten-fokussiert** (Setup, Checks, Repo-Konventionen, “Do/Don’t”), damit Coding-Agents schnell produktiv werden, ohne das README zu überladen.

---

## Projektüberblick

- Streamlit-App mit Eisenhower-ToDo-Board, Gamification, Journal sowie optionaler OpenAI-Integration (Auto-Kategorisierung, Motivation, strukturierte Outputs).
- Die App bleibt **ohne** API-Key vollständig nutzbar (Fallback-Texte/Templates).
- Persistenz: ToDos/KPIs/Settings werden in einer JSON-Datei gespeichert (`gerris_state.json`), i. d. R. unter OneDrive (konfigurierbar), sonst Fallback in `.data/`.

---

## Setup commands

Lokales Dev-Setup:

    python -m venv .venv
    source .venv/bin/activate  # Windows: .venv\Scripts\activate
    pip install --upgrade pip
    pip install -r requirements.txt -r requirements-dev.txt
    streamlit run app.py

Runtime-only (z. B. Deployment):

    pip install -r requirements.txt
    streamlit run app.py

---

## Checks & Tests (lokal wie CI)

**Vor dem Abschluss** (und vor jedem PR) sollen diese Checks grün sein:

    ruff format
    ruff check .
    mypy
    pytest -q

CI-Hinweis:
- GitHub Actions führt mindestens `ruff check .` und `pytest -q` aus (siehe `.github/workflows/ci.yml`).

Wenn etwas fehlschlägt:
- Bitte **vollständige Logs/Stacktraces** in den PR/Issue-Kommentar übernehmen (nicht nur zusammenfassen).
- Falls du eine Fix-Iteration startest: zuerst minimaler Fix + Tests, dann Refactoring separat.

---

## Repo-Navigation

Wichtige Einstiegspunkte / “Greppable” Anker:

- `app.py`  
  Streamlit Entry Point (Routing/Pages initial, Startpunkt fürs UI).
- `gerris_erfolgs_tracker/ui/common.py`  
  Gemeinsame UI-Helfer (Badges, Dark-Theme-Styling, Layout/Look&Feel).
- `gerris_erfolgs_tracker/state.py`  
  Zentrale Session-State-Initialisierung (Single Source of Truth für State-Bootstrap).
- `gerris_erfolgs_tracker/constants.py`  
  **Alle Session-State Keys** (verhindert Tippfehler; Änderungen hier zentral propagieren).
- `gerris_erfolgs_tracker/models.py`  
  Modelle (Todos/KPIs/Gamification/Journal etc.); bevorzugt typisiert/Pydantic.
- `gerris_erfolgs_tracker/coach/templates_de.py`  
  Coach-Templates (DE) – keine UI-Texte in EN einführen.
- `gerris_erfolgs_tracker/notifications/`  
  E-Mail-Erinnerungen (Brevo) + Scheduler/Worker.
- `.streamlit/secrets.toml.example`  
  Secrets-Template (lokal via `.streamlit/secrets.toml`).
- `.env.example`  
  ENV-Template (lokal/Deployment).

Wenn du Dateien nicht findest:
- Grep nach: `GERRIS_`, `OPENAI_`, `GOOGLE_`, `BrevoEmailNotificationService`, `ReminderScheduler`, `responses.parse`, `gerris_state.json`.

---

## Datenhaltung & Persistenz

### Speicherort
- Standard: `~/OneDrive/GerrisErfolgsTracker/gerris_state.json` (oder Pfad aus `GERRIS_ONEDRIVE_DIR`)
- Fallback: `.data/gerris_state.json`

### Recovery / Reset
- Bei defekter Datei: `gerris_state.json` → `gerris_state.bak` umbenennen, App neu starten (legt neue Datei an), dann valide Teile zurückkopieren.
- Reset: Datei löschen/umbenennen.

### Schema-Änderungen (WICHTIG)
Wenn du das persistente JSON-Schema änderst:
- **Abwärtskompatibel** bleiben (alte Keys akzeptieren) oder Migration implementieren.
- Session-State Keys **immer** aus `gerris_erfolgs_tracker/constants.py` beziehen.
- Änderungen an Keys/Defaults in `gerris_erfolgs_tracker/state.py` sauber nachziehen.
- Tests ergänzen: mindestens 1 Test, der “altes JSON” lädt und korrekt normalisiert.

---

## Secrets & Datenschutz (Do/Don’t)

**Do**
- Secrets nur über `st.secrets` oder Environment Variablen beziehen.
- Fallbacks/No-Key-Modus stets funktionsfähig halten.

**Don’t**
- Niemals API-Keys ins Repository committen.
- Keine Secrets in `gerris_state.json` persistieren.
- Keine personenbezogenen Daten in Prompts/Logs “aus Versehen” serialisieren.

### OpenAI (optional)
Konfiguration (ENV oder `st.secrets`):

- `OPENAI_API_KEY` (erforderlich für Modellaufrufe)
- `OPENAI_BASE_URL` (optional; z. B. `https://eu.api.openai.com/v1`)
- `OPENAI_MODEL` (optional; z. B. `gpt-5-nano`)

---

## UI/UX-Konventionen (Streamlit)

**Zielbild: ruhig, fokussiert, professionell**
- Dark Theme mit dunkelgrünem Primärton (`#1C9C82`) auf dezentem Gradient-Hintergrund.
- Statusinfos bevorzugt über Text/Typografie/Abstände; Icon-Lärm vermeiden.
- Sidebar: Fokus auf Navigation; “Toggles/Build-Infos/Optionen” bevorzugt in kompakten Header-Dropdowns.

**Sprache**
- UI-Texte: **ausschließlich Deutsch** (keine englischen Labels/Buttons/Helper-Texte einführen).
- README/Docs dürfen gemischt sein; App-UI nicht.

---

## AI-Integration (OpenAI): Arbeitsregeln

- AI ist **optional**: Wenn AI deaktiviert ist oder kein Key vorhanden ist, müssen deterministische Fallbacks greifen.
- Bevorzugter Flow: OpenAI Python Client mit **strukturierten Outputs**, z. B.:
  - `from openai import OpenAI`
  - `client.responses.parse(..., text_format=YourPydanticModel)`
- Strukturierte Outputs:
  - Pydantic-Modelle in `gerris_erfolgs_tracker/models.py` (oder nahe am Feature) halten.
  - Validierung/Defaults robust gestalten (kein “KeyError” bei Teilantworten).
- Prompting:
  - Keine sensiblen Inhalte in Prompts.
  - Bei Fehlern: auf Templates/Fallbacks zurückfallen und UI weiterhin benutzbar lassen.

---

## Google Workspace Integration (optional)

Konfiguration (ENV oder `st.secrets`):

- `GOOGLE_CALENDARS_JSON` (optional: JSON-Liste mit Kalender-Konfigs)
- Kalender-Shortcuts: `CAL_GERRI_ID`, `CAL_GERRI_ICAL_URL`, `CAL_GERRI_NAME`, `CAL_2025_ID`, `CAL_2025_ICAL_URL`, `CAL_2025_NAME`
- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Token-Backend:
  - `GOOGLE_TOKEN_STORE_BACKEND` (z. B. `sqlite` oder `env`)
  - `GOOGLE_TOKEN_DB_PATH` (Standard: `.local/gerris_google_tokens.sqlite`)
  - `GOOGLE_TOKENS_JSON`, `GOOGLE_TOKENS_JSON_PATH`

Regeln:
- Ohne OAuth-Verbindung müssen Features sauber degradieren (z. B. iCal-Fallback / Beispielwerte).
- Keine Scope-Explosion: Änderungen an Scopes nur, wenn fachlich zwingend – und dann dokumentieren.

---

## E-Mail-Erinnerungen (Brevo, optional)

ENV:
- `BREVO_API_KEY`
- `BREVO_SENDER` (optional `BREVO_SENDER_NAME`)
- Worker/Scheduler:
  - `REMINDER_RECIPIENT_EMAIL` (Default: Sender)
  - `REMINDER_LOOKAHEAD_MINUTES` (Default: 60)
  - `REMINDER_POLL_INTERVAL_SECONDS` (Default: 300)

Wenn du den Reminder-Flow änderst:
- README/Docs aktualisieren.
- Mindestens 1 Test für Scheduling-Entscheidung (z. B. Lookahead/Filter) ergänzen.

---

## Änderungsstandard für Agenten (Output-Qualität)

Wenn du eine Aufgabe implementierst oder einen Bug fixst, liefere in der PR-Beschreibung (oder im Abschlusskommentar):

1) **Was wurde geändert?** (Dateipfade + kurze Bulletpoints, greppbar)  
2) **Wie reproduzieren/validieren?**  
   - Schritte (UI-Klickpfad oder CLI)  
   - Erwartetes Verhalten vs. Ist-Verhalten  
3) **Welche Checks liefen?**  
   - Exakt ausgeführte Commands (`ruff check .`, `pytest -q`, …)  
   - Output/Fehlerlog vollständig (bei Fail)  
4) **Tests ergänzt/angepasst?**  
   - Wenn nein: begründen (z. B. rein visuelles Layout) und minimale Regression-Absicherung vorschlagen.

---

## PR-/Review-Hinweise

- Kleine, reviewbare Schritte bevorzugen (wenn komplex: 2 PRs statt 1 Monster-PR).
- Refactorings getrennt von Feature/Bugfix halten.
- Keine “Drive-by”-Änderungen an Style/Formatierung außerhalb betroffener Module.
- Wenn du öffentliche Verhaltensänderungen einführst: README/Docs/Changelog aktualisieren.

---

## Weiterführende Links (Format/Best Practices)

- https://agents.md/
- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/prompting
