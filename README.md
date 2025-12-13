# README.md
# Gerris ErfolgsTracker

Streamlit-App mit Eisenhower-ToDo-Board, Gamification und optionaler OpenAI-Integration für KI-gestützte Vorschläge (Auto-Kategorisierung, Tagesziel-Empfehlungen, Motivation). Ohne API-Key greifen Fallback-Texte und die App bleibt voll funktionsfähig.

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
- Button **Session zurücksetzen / Reset session** löscht ToDos, KPIs, Gamification und Einstellungen und stellt die Defaults wieder
  her.
- Hinweisboxen: Daten bleiben ausschließlich im Session-State (keine Persistenz im MVP); das Tool ist nicht als Krisen- oder Diagnoseinstrument gedacht.

## ToDo-Verwaltung

- Erfassung über das Formular **ToDo hinzufügen / Add task** (Titel, optionales Fälligkeitsdatum, Quadrant) inklusive Button **AI: Quadrant vorschlagen**.
- Eisenhower-Matrix mit vier Quadranten (dringend/wichtig) als Board-Ansicht mit je einer Spalte pro Quadrant.
- Aufgaben lassen sich nach Fälligkeitsdatum, Erstellungsdatum oder Titel sortieren.
- Filter für offene/erledigte Aufgaben.
- Aktionen je Aufgabe: **Erledigt / Done** (toggle), **Quadrant wechseln / Change quadrant** (Dropdown), **Bearbeiten / Edit** (Formular), **Löschen / Delete**.

## Kalenderansicht / Calendar view

- Monatlicher Überblick über ToDos mit Fälligkeitsdatum in einem 7-Spalten-Raster.
- Monatsauswahl über Date-Picker (nur Monat/Jahr relevant) und optionaler Filter **Nur offene Aufgaben / Only open tasks**.
- Aufgaben erscheinen an ihrem jeweiligen Kalendertag mit Status-Emoji (⏳ offen, ✅ erledigt).

## KPI-Dashboard

- Sofort sichtbare KPIs: **Erledigt gesamt / Done total**, **Heute erledigt / Done today**, **Kontinuität / Streak**, sowie **Zielerreichung / Goal progress** mit Tagesziel (Standard: 3 Abschlüsse pro Tag).
- Tageslogik: `done_today` wird automatisch auf den aktuellen Kalendertag bezogen; bei Datumswechsel werden die Tageswerte zurückgesetzt.
- Kontinuität (Streak): zählt zusammenhängende Tage mit mindestens einem Abschluss.
- Wochenansicht: Balkendiagramm der letzten 7 Tage mit Anzahl der Abschlüsse.

## Gamification

- Punkte pro Abschluss abhängig vom Eisenhower-Quadranten (z. B. Quadrant I 20 Punkte, Quadrant IV 5 Punkte).
- Level-Berechnung: `level = 1 + points // 100` inklusive Fortschrittsbalken zum nächsten Level.
- Badges (werden nur einmal vergeben):
  - **First Step / Erster Schritt** – erster erledigter Task.
  - **Consistency 3 / 3-Tage-Streak** – 3-Tage-Streak erreicht.
  - **Double Digits / Zweistellig** – 10 erledigte Tasks insgesamt.
- Anti-Doppelzählung: Abschlüsse werden als Events protokolliert, sodass Punkte und Badges auch nach einem Reload nicht mehrfach vergeben werden.
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
