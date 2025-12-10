# README.md
# Gerris ErfolgsTracker

Minimale Streamlit-App, die einen Prompt entgegennimmt und optional die OpenAI Responses API nutzt. Die App ist so konzipiert, dass sie lokal sowie auf Streamlit Cloud schnell startklar ist.

Zusätzlich gibt es eine einfache ToDo-Verwaltung mit CRUD-Funktionen (Anlegen, Bearbeiten, Erledigen, Löschen), die den Streamlit-Session-State nutzt.

## Voraussetzungen

- Python >= 3.11
- Ein OpenAI API Key, falls du Modellantworten erzeugen möchtest (`OPENAI_API_KEY`).

## Lokale Einrichtung

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install --upgrade pip
pip install -r requirements.txt
streamlit run app.py
```

Hinweise:
- Der Start funktioniert auch ohne API Key; die App zeigt dann einen Hinweis an.
- Falls du den EU-Endpunkt nutzen möchtest, setze `OPENAI_BASE_URL=https://eu.api.openai.com/v1`.

## Secrets & Umgebungsvariablen

Die App sucht nach dem OpenAI Key in `st.secrets` oder der Umgebung:

- `OPENAI_API_KEY` (erforderlich für Modellaufrufe)
- `OPENAI_BASE_URL` (optional, z. B. EU-Endpunkt)

### Lokale Secrets

Erstelle `.streamlit/secrets.toml` (siehe `.streamlit/secrets.example.toml`):

```toml
OPENAI_API_KEY = "sk-..."
# OPENAI_BASE_URL = "https://eu.api.openai.com/v1"
```

### Streamlit Cloud

1. Repository in Streamlit Cloud verbinden.
2. Unter **App settings → Secrets** folgende Einträge hinzufügen:
   - `OPENAI_API_KEY = sk-...`
   - Optional `OPENAI_BASE_URL = https://eu.api.openai.com/v1`
3. Deploy starten; die Abhängigkeiten werden über `requirements.txt` installiert.

## Entwicklung & Tests

- Lint/Format: `ruff format` und `ruff check`
- Tests: `pytest`

## ToDo-Verwaltung

- Erfassung über das Formular **ToDo hinzufügen / Add task** (Titel, optionales Fälligkeitsdatum, Quadrant).
- Eisenhower-Matrix mit vier Quadranten (dringend/wichtig) als Board-Ansicht mit je einer Spalte pro Quadrant.
- Aufgaben lassen sich nach Fälligkeitsdatum, Erstellungsdatum oder Titel sortieren.
- Filter für offene/erledigte Aufgaben.
- Aktionen je Aufgabe: **Erledigt / Done** (toggle), **Quadrant wechseln / Change quadrant** (Dropdown), **Bearbeiten / Edit** (Formular), **Löschen / Delete**.

## Session-State-Management

Die zentrale Session-State-Initialisierung liegt in `gerris_erfolgs_tracker/state.py`. Dort werden alle Schlüssel aus `gerris_erfolgs_tracker/constants.py` verwendet, um Konsistenz zu gewährleisten und Tippfehler zu vermeiden. Modelle für Todos, KPI-Statistiken und Gamification befinden sich in `gerris_erfolgs_tracker/models.py`.

## Architektur-Hinweis

Die App nutzt den aktuellen OpenAI Python-Flow: `from openai import OpenAI`, gefolgt von `client.responses.create(...)`. Der Zugriff auf die API ist optional; ohne gültigen Schlüssel bleibt die App lauffähig.
