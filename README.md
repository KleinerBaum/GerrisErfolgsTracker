# README.md
# Gerris ErfolgsTracker

Streamlit-App mit Eisenhower-ToDo-Board, Gamification und optionaler OpenAI-Integration für KI-gestützte Vorschläge (Auto-Kategorisierung, Tagesziel-Empfehlungen, Motivation). Ohne API-Key greifen Fallback-Texte und die App bleibt voll funktionsfähig.

Die UI folgt einem klaren, fokussierten Design mit einem dunkelgrünen Primärton (#127475) für einen ruhigen, professionellen Eindruck. Es werden nur wenige, leicht verständliche Status-Icons eingesetzt (z. B. ⏳ für offene und ✅ für erledigte Aufgaben), um die Oberfläche aufgeräumt zu halten.

Die einzige externe Integration ist derzeit die OpenAI API. Wenn die Option **AI aktiv / AI enabled** gesetzt ist, nutzt die App GPT-Modelle (Standard: `gpt-4o-mini`, per Einstellung überschreibbar), um z. B. automatisch den Eisenhower-Quadranten zu empfehlen, ein strukturiertes Tagesziel zu liefern oder kurze Motivationsnachrichten basierend auf den jüngsten KPIs zu erstellen. Ist kein API-Key hinterlegt oder die AI-Option deaktiviert, werden statische, vorgefertigte Texte verwendet, sodass die Anwendung weiterhin vollständig nutzbar bleibt.

## Voraussetzungen

- Python >= 3.11
- Ein OpenAI API Key, falls du Modellantworten erzeugen möchtest (`OPENAI_API_KEY`).
- Optional: Modell-Override via `OPENAI_MODEL` (Standard: `gpt-4o-mini`) und benutzerdefinierte Basis-URL z. B. EU-Endpunkt.

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

## Bereitstellung & Datenhaltung / Deployment & data handling

- **Lokal / Local:** `streamlit run app.py` öffnet die App im Browser unter `localhost:8501`. Alle ToDos, KPIs und Einstellungen
  liegen ausschließlich im Streamlit-Session-State und werden weder in Dateien noch in einer Datenbank gespeichert; ein Neustart
  beginnt daher mit einem frischen Zustand.
- **Streamlit Cloud:** Repository mit dem Streamlit Cloud Dashboard verbinden und die Secrets wie unten beschrieben hinterlegen;
  danach kann die App unter der bereitgestellten URL genutzt werden (z. B. https://gerriserfolgstracker.streamlit.app/). Auch
  hier bleiben die Daten pro Sitzung im Memory-Session-State, was den Betrieb ohne Persistenz und ohne lokale Infrastruktur
  ermöglicht.

## Secrets & Umgebungsvariablen

Die App sucht nach dem OpenAI Key in `st.secrets` oder der Umgebung:

- `OPENAI_API_KEY` (erforderlich für Modellaufrufe)
- `OPENAI_BASE_URL` (optional, z. B. EU-Endpunkt)
- `OPENAI_MODEL` (optional, z. B. `gpt-4o-mini` oder `o3-mini`)

### Lokale Secrets

Erstelle `.streamlit/secrets.toml` (siehe `.streamlit/secrets.example.toml`):

```toml
OPENAI_API_KEY = "sk-..."
# OPENAI_BASE_URL = "https://eu.api.openai.com/v1"
# OPENAI_MODEL = "gpt-4o-mini"
```

### Streamlit Cloud

1. Repository in Streamlit Cloud verbinden.
2. Unter **App settings → Secrets** folgende Einträge hinzufügen:
   - `OPENAI_API_KEY = sk-...`
   - Optional `OPENAI_BASE_URL = https://eu.api.openai.com/v1`
   - Optional `OPENAI_MODEL = gpt-4o-mini`
3. Deploy starten; die Abhängigkeiten werden über `requirements.txt` installiert.

## Entwicklung & Tests

- Lint/Format: `ruff format` und `ruff check .`
- Typprüfung: `mypy`
- Tests: `pytest -q`
- CI: GitHub Actions Workflow (`.github/workflows/ci.yml`) führt `ruff check .` und `pytest -q` bei Push/PR aus.

## Einstellungen & Sicherheit / Settings & Safety

- Seitenleiste mit **AI aktiv / AI enabled** sowie **Tagesziel / Daily goal** inklusive KI-Vorschlag.
- AI-Zielvorschläge übernehmen den empfohlenen Wert automatisch in das Zahlenfeld (kein manuelles Nachtragen nötig) / AI goal
  suggestions now auto-fill the number input for convenience.
- Kategorienziele pro Lebensbereich (z. B. Stellensuche, Admin) lassen sich in der Seitenleiste zwischen 0 und 20 Abschlüssen
  pro Tag einstellen und aktualisieren die Fortschrittskarten sofort / Per-category daily goals (0–20) live-update the dashboard
  cards.
- Button **Session zurücksetzen / Reset session** löscht ToDos, KPIs, Gamification und Einstellungen und stellt die Defaults wieder
  her.
- Hinweisboxen: Daten bleiben ausschließlich im Session-State (keine Persistenz im MVP); das Tool ist nicht als Krisen- oder Diagnoseinstrument gedacht.

## ToDo-Verwaltung

- Neuer Aufgaben-Tab **Liste / List** (Default) gruppiert nach Kategorie in fester Reihenfolge, sortiert nach Priorität → Fälligkeit → Erstellungsdatum und bietet Filter für erledigte Aufgaben, Kategorie-Multiselect sowie Sortier-Override (Priorität/Fälligkeit/Erstellt). Jede Zeile zeigt Done-Toggle, Titel, Prioritäts-Badge (P1–P5), Fälligkeitsdatum (falls vorhanden) und Quadranten-Kürzel, plus einen **Details**-Expander mit Beschreibung, Schnellbearbeitung (Kategorie, Priorität, Fälligkeit, Quadrant) sowie Aktionen **Löschen / Delete** und **Duplizieren / Duplicate**.
- Erfassung über das Formular **ToDo hinzufügen / Add task** (Titel, optionales Fälligkeitsdatum, Quadrant) inklusive Button **AI: Quadrant vorschlagen**. Neu sind Kategorie-Auswahl (z. B. Stellensuche, Tagesstruktur), Priorität (1–5) sowie eine optionale Markdown-Beschreibung mit Vorschau.
- Eisenhower-Matrix mit vier Quadranten (dringend/wichtig) als Board-Ansicht mit je einer Spalte pro Quadrant im entsprechenden Tab, zusätzlich bleibt die Monats-Kalender-Ansicht als eigener Tab verfügbar.
- Pro Aufgabe steht im Expander ein **Kanban**-Abschnitt bereit: Drei Spalten (Backlog/Doing/Done) mit Unteraufgaben-Karten, die per Buttons nach links/rechts verschoben werden können. Karten lassen sich mit Titel + Beschreibung anlegen (Standard-Spalte Backlog), und ein Fortschrittsbalken zeigt den Subtask-Abschluss in % an / Each task expander now offers a **Kanban** section with three columns (Backlog/Doing/Done). Add cards with title + description (default to Backlog), move them left/right via buttons, and track subtask completion via a progress bar.

## Kalenderansicht / Calendar view

- Monatlicher Überblick über ToDos mit Fälligkeitsdatum in einem 7-Spalten-Raster.
- Monatsauswahl über Date-Picker (nur Monat/Jahr relevant) und optionaler Filter **Nur offene Aufgaben / Only open tasks**.
- Aufgaben erscheinen an ihrem jeweiligen Kalendertag mit Status-Emoji (⏳ offen, ✅ erledigt).

## KPI-Dashboard

- Sofort sichtbare KPIs: **Erledigt gesamt / Done total**, **Heute erledigt / Done today**, **Kontinuität / Streak**, sowie **Zielerreichung / Goal progress** mit Tagesziel (Standard: 3 Abschlüsse pro Tag).
- Neues Top-Dashboard direkt unter dem Titel mit fünf Karten (eine pro Kategorie) inklusive Tagesfortschritt, Streak und offen vs. erledigt / New top-of-page dashboard with five category cards showing daily progress, streak, open vs. done.
- Tageslogik: `done_today` wird automatisch auf den aktuellen Kalendertag bezogen; bei Datumswechsel werden die Tageswerte zurückgesetzt.
- Kontinuität (Streak): zählt zusammenhängende Tage mit mindestens einem Abschluss.
- Wochenansicht: Interaktives Plotly-Balkendiagramm der letzten 7 Tage mit Hover-Details und Zoom für die Abschlüsse.
- Zusätzlich ein gestapeltes Plotly-Balkendiagramm für die letzten 7 Tage, aufgeteilt nach Kategorien, um Fortschritt je Lebensbereich sichtbar zu machen / Added a stacked 7-day Plotly bar by category for a quiet, dark-friendly overview.

## Gamification

- Punkte pro Abschluss abhängig vom Eisenhower-Quadranten (z. B. Quadrant I 20 Punkte, Quadrant IV 5 Punkte).
- Level-Berechnung: `level = 1 + points // 100` inklusive Fortschrittsbalken zum nächsten Level.
- Badges (werden nur einmal vergeben):
  - **First Step / Erster Schritt** – erster erledigter Task.
  - **Consistency 3 / 3-Tage-Streak** – 3-Tage-Streak erreicht.
  - **Double Digits / Zweistellig** – 10 erledigte Tasks insgesamt.
- Anti-Doppelzählung: Abschlüsse werden als Events protokolliert, sodass Punkte und Badges auch nach einem Reload nicht mehrfach vergeben werden.
- Abschluss-Events werden zusätzlich als Verlaufseinträge mit Token gespeichert, um Wiederholungen durch doppelte Toggles oder Neustarts zu verhindern / Completion events are stored with tokens in the history to avoid repeated rewards after reloads.
- Drop-down für Gamification-Modus (Punkte, Abzeichen oder neuer Avatar **Dipl.-Psych. Roß** mit motivierenden Sprüchen; brünette Therapeutin ca. 45 Jahre mit Brille), auswählbar in der Seitenleiste.

## KI-Features / AI features

- Toggle **AI aktiv / AI enabled** steuert, ob KI-Vorschläge verwendet werden; ohne Key greifen automatisch Fallback-Texte.
- **AI: Quadrant vorschlagen** schlägt einen Eisenhower-Quadranten vor (übersteuerbar).
- **AI: Ziel vorschlagen** erzeugt ein strukturiertes Tagesziel mit Fokus und Tipps, das in die Zahleneingabe übernommen werden kann.
- **AI: Motivation** liefert eine kurze, zweisprachige Motivationsnachricht basierend auf den KPIs.

## Session-State-Management

Die zentrale Session-State-Initialisierung liegt in `gerris_erfolgs_tracker/state.py`. Dort werden alle Schlüssel aus `gerris_erfolgs_tracker/constants.py` verwendet, um Konsistenz zu gewährleisten und Tippfehler zu vermeiden. Modelle für Todos, KPI-Statistiken und Gamification befinden sich in `gerris_erfolgs_tracker/models.py`.

## Architektur-Hinweis

Die App nutzt den aktuellen OpenAI Python-Flow mit strukturierten Outputs: `from openai import OpenAI`, gefolgt von `client.responses.parse(..., text_format=YourPydanticModel)`. Der Zugriff auf die API ist optional; ohne gültigen Schlüssel bleiben Fallbacks aktiv und die App lauffähig.
