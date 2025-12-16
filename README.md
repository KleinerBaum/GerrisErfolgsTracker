# README.md
# Gerris ErfolgsTracker

Streamlit-App mit Eisenhower-ToDo-Board, Gamification und optionaler OpenAI-Integration für KI-gestützte Vorschläge (Auto-Kategorisierung, Tagesziel-Empfehlungen, Motivation). Ohne API-Key greifen Fallback-Texte und die App bleibt voll funktionsfähig.

Die UI folgt einem klaren, fokussierten Dark-Theme mit dunkelgrünem Primärton (#1C9C82) auf einem dezenten, bildfreien Gradient-Hintergrund, um einen ruhigen, professionellen Eindruck zu vermitteln. Statusinformationen werden textlich und über Typografie/Abstände vermittelt, um Icon-Lärm zu vermeiden.

Die einzige externe Integration ist derzeit die OpenAI API. Wenn die Option **AI aktiv / AI enabled** gesetzt ist, nutzt die App GPT-Modelle (Standard: `gpt-4o-mini`, per Einstellung überschreibbar), um z. B. automatisch den Eisenhower-Quadranten zu empfehlen, ein strukturiertes Tagesziel zu liefern oder kurze Motivationsnachrichten basierend auf den jüngsten KPIs zu erstellen. Ist kein API-Key hinterlegt oder die AI-Option deaktiviert, werden statische, vorgefertigte Texte verwendet, sodass die Anwendung weiterhin vollständig nutzbar bleibt.

## Voraussetzungen

- Python >= 3.11
- Ein OpenAI API Key, falls du Modellantworten erzeugen möchtest (`OPENAI_API_KEY`).
- Optional: Modell-Override via `OPENAI_MODEL` (Standard: `gpt-4o-mini`) und benutzerdefinierte Basis-URL z. B. EU-Endpunkt.
- Optionale Persistenz & Sync: Die App schreibt standardmäßig in einen OneDrive-Sync-Ordner (z. B. `~/OneDrive/GerrisErfolgsTracker/gerris_state.json` oder `C:\\Users\\gerri\\OneDrive\\GerrisErfolgsTracker`). Über `GERRIS_ONEDRIVE_DIR` kannst du den Pfad explizit setzen; das Verzeichnis wird bei Bedarf angelegt.

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

- **Lokal / Local:** `streamlit run app.py` öffnet die App im Browser unter `localhost:8501`. ToDos, KPIs und Einstellungen
  landen automatisch als `gerris_state.json` im OneDrive-Sync-Ordner `~/OneDrive/GerrisErfolgsTracker/` (oder dem Pfad aus
  `GERRIS_ONEDRIVE_DIR`). So bleiben mobile Eingaben (z. B. aus der OneDrive-App) und die Streamlit-App synchron. Das
  Verzeichnis wird beim Speichern erzeugt; ein Löschen der Datei setzt den Zustand zurück.
- **Streamlit Cloud:** Repository mit dem Streamlit Cloud Dashboard verbinden und die Secrets wie unten beschrieben hinterlegen;
  danach kann die App unter der bereitgestellten URL genutzt werden (z. B. https://gerriserfolgstracker.streamlit.app/). Die
  App schreibt ebenfalls in den OneDrive-Pfad (über `GERRIS_ONEDRIVE_DIR` konfigurierbar); auf der Community Cloud kann die
  Datei dennoch flüchtig sein und nach einem Neustart verschwinden. Funktioniert somit ohne zusätzliche Infrastruktur, aber
  ohne Garantien für Persistenz.

## Secrets & Umgebungsvariablen

Die App sucht nach dem OpenAI Key in `st.secrets` oder der Umgebung:

- `OPENAI_API_KEY` (erforderlich für Modellaufrufe)
- `OPENAI_BASE_URL` (optional, z. B. EU-Endpunkt)
- `OPENAI_MODEL` (optional, z. B. `gpt-4o-mini` oder `o3-mini`)
- `GERRIS_ONEDRIVE_DIR` (optional: expliziter OneDrive-Sync-Ordner für die JSON-Datei)

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

> **Wichtig / Important:** API-Keys niemals in das Repository einchecken. Nutze lokal `.streamlit/secrets.toml` und auf der
> Streamlit Community Cloud die Secrets UI.

## Entwicklung & Tests

- Lint/Format: `ruff format` und `ruff check .`
- Typprüfung: `mypy`
- Tests: `pytest -q`
- CI: GitHub Actions Workflow (`.github/workflows/ci.yml`) führt `ruff check .` und `pytest -q` bei Push/PR aus.
- Streamlit-Forms: Alle Submit-Buttons müssen innerhalb ihres `st.form` stehen; die Quick-Edit-Speicheraktion im Aufgabenlisten-Formular ist entsprechend eingebettet, sodass keine `st.form_submit_button`-API-Fehler auftreten.
- ToDo-Meilenstein-Aktionen nutzen `st.form_submit_button`, damit Entwürfe und Vorschläge ohne `StreamlitAPIException` funktionieren / ToDo milestone actions rely on `st.form_submit_button` so drafts and suggestions work without `StreamlitAPIException`.
- Widget-Keys: Der "AI: Motivation"-Button nutzt kontextspezifische Keys pro Panel (z. B. Sidebar), um `StreamlitDuplicateElementKey`-Fehler zu vermeiden / The "AI: Motivation" button uses context-specific keys per panel (e.g., sidebar) to avoid `StreamlitDuplicateElementKey` crashes.
- Strukturierte LLM-Schemas decken nun auch Milestone-Vorschläge (small/medium/large) ab, sodass Imports für die AI-Vorschläge ohne Fehler funktionieren / Structured LLM schemas now include milestone suggestions (small/medium/large) to keep AI suggestion imports error-free.

> **Formulare / Forms:** Platzieren Sie `st.form_submit_button` immer innerhalb eines `st.form`-Blocks und bei Bedarf innerhalb von Spalten mittels `with col:`. So vermeiden Sie `StreamlitAPIException`-Meldungen zur Formularplatzierung.

## Einstellungen & Sicherheit / Settings & Safety

- Die Seitenleiste bündelt die Navigation zwischen **Ziele / Goals**, **Aufgaben / Tasks** und **Tagebuch / Journal** und zeigt direkt darunter das Gamification-Panel mit der Überschrift **Gamification-Variante / Gamification variant** inkl. Modus-Wahl (Punkte, Abzeichen oder Avatar-Option); die App startet mit geöffneter Sidebar und lädt standardmäßig die Seite **Aufgaben / Tasks** / The sidebar hosts navigation plus the gamification section with the **Gamification-Variante / Gamification variant** heading and mode selection (points, badges, or the avatar option) and starts expanded, defaulting to the **Aufgaben / Tasks** page on load.
- Über einen Sprachumschalter **Deutsch / English** in der Sidebar lässt sich die gesamte UI einsprachig darstellen / A sidebar language toggle (**Deutsch / English**) renders the whole UI in the selected language without bilingual labels.
- Der Schalter **AI aktiv / AI enabled** sitzt oberhalb des Sprachumschalters in der Sidebar und steuert alle KI-Funktionen zentral.
- Auf der Seite **Ziele / Goals** startet jetzt ein fünffach gespaltener Tachometer-Überblick zu Stellensuche, Administratives, Familie & Freunde, Drogen sowie Tagesstruktur; rechts daneben wählst du per Checkbox, ob das KPI-Dashboard bzw. die Kategoriendiagramme eingeblendet werden.
- Die Zielbearbeitung wird erst nach Klick auf **Ziel erstellen / Create goal** sichtbar; dort findest du **Tagesziel / Daily goal** (inkl. KI-Vorschlag) und Kategorienziele (0–20 pro Tag) kompakt angeordnet.
- AI-Zielvorschläge übernehmen den empfohlenen Wert automatisch in das Zahlenfeld (kein manuelles Nachtragen nötig) / AI goal suggestions now auto-fill the number input for convenience.
- Der Button **Session zurücksetzen / Reset session** sitzt jetzt im Sidebar-Panel **Sicherheit & Daten / Safety & data** und löscht ToDos, KPIs, Gamification und Einstellungen und stellt die Defaults wieder her / The **Session zurücksetzen / Reset session** button now lives in the sidebar **Sicherheit & Daten / Safety & data** panel and resets todos, KPIs, gamification, and settings.
- Hinweisboxen informieren zentral im Sidebar-Panel **Sicherheit & Daten / Safety & data** über den aktuell genutzten Speicherort (OneDrive, lokale Datei oder flüchtiger Cloud-Speicher); das Tool ist nicht als Krisen- oder Diagnoseinstrument gedacht. Über den Toggle **Speicherhinweis anzeigen / Show storage notice** steuerst du, ob der Hinweis unter dem Titel erscheint (Standard: aus) / The **Sicherheit & Daten / Safety & data** sidebar panel bundles the storage notice and crisis disclaimer; use the **Speicherhinweis anzeigen / Show storage notice** toggle to show the notice below the title (default: off).

## ToDo-Verwaltung

- Neuer Aufgaben-Tab **Liste / List** (Default) gruppiert nach Kategorie in fester Reihenfolge, sortiert nach Priorität → Fälligkeit → Erstellungsdatum und bietet Filter für erledigte Aufgaben, Kategorie-Multiselect sowie Sortier-Override (Priorität/Fälligkeit/Erstellt). Jede Aufgabe nutzt ein kompaktes Row-Layout mit Done-Toggle, Titel, Prioritäts-Badge (P1–P5), Fälligkeitsdatum (falls vorhanden) und Quadranten-Tag samt Farbcode; Details, Quick-Edit (Kategorie, Priorität, Fälligkeit, Quadrant) und Aktionen **Löschen / Delete** bzw. **Duplizieren / Duplicate** sind über einen platzsparenden Expander erreichbar.
- Aktionen zum Löschen erfordern nun eine explizite Bestätigung, um versehentliches Entfernen gespeicherter Aufgaben zu verhindern / Delete actions now ask for explicit confirmation to prevent accidentally removing stored tasks.
- Erfassung über das Formular **ToDo hinzufügen / Add task** (Titel, optionales Fälligkeitsdatum, Quadrant) inklusive Button **AI: Quadrant vorschlagen**. Neu sind Kategorie-Auswahl (z. B. Stellensuche, Tagesstruktur), Priorität (1–5) sowie eine optionale Markdown-Beschreibung mit Vorschau. Zusätzlich lassen sich Wiederholungen (einmalig, täglich, werktags, wöchentlich, monatlich, jährlich) und eine E-Mail-Erinnerung (keine, 1 Stunde oder 1 Tag vor Fälligkeit; als Präferenz gespeichert) hinterlegen. Der abschließende Button **ToDo hinzufügen / Add task** ist als primärer Aktionsbutton hervorgehoben, damit das Absenden sofort ins Auge fällt / The final **ToDo hinzufügen / Add task** button is now styled as a primary action so submission stands out.
 - Titel- und Beschreibungsfelder sind auf Desktop auf ~50 % Containerbreite begrenzt, damit das Formular kompakter und lesbarer bleibt, während die mobile Ansicht weiterhin stapelt / Title and description inputs are limited to roughly 50 % container width on desktop for a more compact form while still stacking on mobile.
- Optionale **Fortschrittsregel / Progress rule** pro Aufgabe: Zahl + Einheit als Ziel, aktueller Stand, automatischer Abschluss bei Zielerreichung (abschaltbar) sowie Markdown-Kriterien. Im Formular und im Detail-Expander editierbar; Fortschritts-Events sind gegen doppelte Zählung abgesichert.
- Eisenhower-Matrix mit vier Quadranten (dringend/wichtig) als Board-Ansicht mit je einer Spalte pro Quadrant im entsprechenden Tab, zusätzlich bleibt die Monats-Kalender-Ansicht als eigener Tab verfügbar / Eisenhower matrix board with four quadrants (urgent/important) plus a dedicated calendar tab.
- Quadranten-Labels sind nun U+I, I+nU, nI+U und nI+nU und erscheinen farbcodiert (Weinrot, Gelb, Grün, Blau) in Board-Spalten, Listen-Badges und Detailansichten / Quadrant labels now read U+I, I+nU, nI+U, and nI+nU with dedicated colors (wine red, yellow, green, blue) across board columns, list badges, and detail views.
- Pro Aufgabe steht im Expander ein **Kanban**-Abschnitt bereit: Drei Spalten (Backlog/Doing/Done) mit Unteraufgaben-Karten, die per Buttons nach links/rechts verschoben werden können. Karten lassen sich mit Titel + Beschreibung anlegen (Standard-Spalte Backlog), und ein Fortschrittsbalken zeigt den Subtask-Abschluss in % an / Each task expander now offers a **Kanban** section with three columns (Backlog/Doing/Done). Add cards with title + description (default to Backlog), move them left/right via buttons, and track subtask completion via a progress bar.

## Tagebuch / Daily journal

- Neuer Bereich **Tagebuch / Journal** über die Sidebar-Navigation mit geführtem Formular pro Kalendertag. Der Button **Tagebucheintrag erstellen / Create journal entry** lädt bestehende Entwürfe oder öffnet ein leeres Formular für heute.
- Formularfelder mit Platzhaltern und Autosuggest: Stimmungstags (bearbeitbar) plus Freitext, dazu eine vierteilige Zeile mit **Auslöser & Reaktionen**, **Gedanken-Challenge** (automatischer Gedanke + Reframe), **Selbstfürsorge** (heute/morgen) sowie progressiven **Dankbarkeit**-Feldern, die nacheinander erscheinen, sobald das vorherige gefüllt ist; Vorschläge kommen aus bisherigen Einträgen. Kategorien lassen sich per Multi-Select (Suchleiste) an vorhandene Lebensbereiche koppeln / Mood tags with notes plus a four-part row covering **triggers & reactions**, **thought challenge** (automatic thought + reframe), **self-care** (today/tomorrow), and progressive **gratitude** inputs that show up one after another when the previous field is filled; suggestions reuse past entries. Categories connect via multi-select to the existing life domains.
- Speichern erfolgt explizit über **Eintrag speichern / Save entry** (kein Auto-Save pro Tastendruck). Bestehende Entwürfe werden geladen und können überschrieben werden; die Export-/Backup-Sektion entfällt zugunsten eines fokussierten Editors / Saving stays explicit via **Save entry** (no per-keystroke auto-save). Existing drafts reload and can be overwritten; the export/backup section was removed to keep the editor focused.
- Beim Speichern gleicht ein optionaler KI-Check den Text gegen Ziele/Aufgaben ab und schlägt Punkt-Updates plus Folgeaktionen vor; alle Treffer müssen manuell bestätigt werden, bevor Punkte gutgeschrieben werden / On save, an optional AI check compares the entry with goals/tasks and proposes point updates plus follow-up actions; every match requires explicit user approval before points are awarded.

## Kalenderansicht / Calendar view

- Monatlicher Überblick über ToDos mit Fälligkeitsdatum in einem 7-Spalten-Raster.
- Monatsauswahl über Date-Picker (nur Monat/Jahr relevant) und optionaler Filter **Nur offene Aufgaben / Only open tasks**.
- Aufgaben erscheinen an ihrem jeweiligen Kalendertag mit Status-Emoji (⏳ offen, ✅ erledigt).
- Der heutige Kalendertag ist im Date-Picker und in der Rasteransicht durch Rahmen + leicht aufgehellten Hintergrund klar
  hervorgehoben / Today's date is visibly highlighted in the date picker and month grid with a border and subtle brightening.

## KPI-Dashboard

- Sofort sichtbare KPIs: **Erledigt gesamt / Done total**, **Heute erledigt / Done today**, **Kontinuität / Streak**, sowie **Zielerreichung / Goal progress** mit Tagesziel (Standard: 3 Abschlüsse pro Tag).
- KPI-Dashboard liegt direkt unter dem Seitentitel und ist ohne Tabs sichtbar, um Fortschritt sofort zu erkennen / KPI dashboard sits right below the page title (outside tabs) for instant visibility.
- Neues Top-Dashboard direkt unter dem Titel mit fünf Karten (eine pro Kategorie) inklusive Tagesfortschritt, Streak und offen vs. erledigt / New top-of-page dashboard with five category cards showing daily progress, streak, open vs. done.
- Tageslogik: `done_today` wird automatisch auf den aktuellen Kalendertag bezogen; bei Datumswechsel werden die Tageswerte zurückgesetzt.
- Kontinuität (Streak): zählt zusammenhängende Tage mit mindestens einem Abschluss.
- Wochenansicht: Interaktives Plotly-Balkendiagramm der letzten 7 Tage mit Hover-Details und Zoom für die Abschlüsse, abgestimmt auf das dunkle Dashboard-Farbschema.
- Zusätzlich ein gestapeltes Plotly-Balkendiagramm für die letzten 7 Tage, aufgeteilt nach Kategorien, um Fortschritt je Lebensbereich sichtbar zu machen / Added a stacked 7-day Plotly bar by category for a quiet, dark-friendly overview that matches the dark-green theme.

## Gamification

- Punkte pro Abschluss abhängig vom Eisenhower-Quadranten (z. B. Quadrant I 20 Punkte, Quadrant IV 5 Punkte).
- Level-Berechnung: `level = 1 + points // 100` inklusive Fortschrittsbalken zum nächsten Level.
- Badges (werden nur einmal vergeben):
  - **First Step / Erster Schritt** – erster erledigter Task.
  - **Consistency 3 / 3-Tage-Streak** – 3-Tage-Streak erreicht.
  - **Double Digits / Zweistellig** – 10 erledigte Tasks insgesamt.
- Anti-Doppelzählung: Abschlüsse werden als Events protokolliert, sodass Punkte und Badges auch nach einem Reload nicht mehrfach vergeben werden.
- Abschluss-Events werden zusätzlich als Verlaufseinträge mit Token gespeichert, um Wiederholungen durch doppelte Toggles oder Neustarts zu verhindern / Completion events are stored with tokens in the history to avoid repeated rewards after reloads.
- Drop-down für Gamification-Modus (Punkte, Abzeichen oder ein neuer Avatar-Modus mit motivierenden Sprüchen) auf der Seite **Ziele / Goals**; Fortschritt, Level und Motivation erscheinen im Gamification-Panel der Sidebar.

### Meilensteine & Priority-Board

- Unterteile Aufgaben in Meilensteine mit Aufwand (klein/mittel/groß), Punktevorschlag und optionaler Notiz. Ein Roadmap-Board mit Spalten Backlog → Ready → In Progress → Review → Done ermöglicht die visuelle Planung und Statuswechsel per Button.
- Punkte- und Komplexitätswerte lassen sich inline anpassen; im Gamification-Modus **Punkte & Level** wird die Punkteausbeute je Schritt sichtbar gehalten.
- AI-Unterstützung: Button **AI: Meilensteine vorschlagen / Suggest milestones** liefert passende Unterziele, die per Klick übernommen werden können; alternativ kannst du sie manuell erfassen oder entfernen.

## KI-Features / AI features

- Toggle **AI aktiv / AI enabled** steuert, ob KI-Vorschläge verwendet werden; ohne Key greifen automatisch Fallback-Texte.
- **AI: Quadrant vorschlagen** schlägt einen Eisenhower-Quadranten vor (übersteuerbar).
- **AI: Ziel vorschlagen** erzeugt ein strukturiertes Tagesziel mit Fokus und Tipps, das in die Zahleneingabe übernommen werden kann.
- **AI: Motivation** liefert eine kurze, zweisprachige Motivationsnachricht basierend auf den KPIs.

## Session-State-Management

Die zentrale Session-State-Initialisierung liegt in `gerris_erfolgs_tracker/state.py`. Dort werden alle Schlüssel aus `gerris_erfolgs_tracker/constants.py` verwendet, um Konsistenz zu gewährleisten und Tippfehler zu vermeiden. Modelle für Todos, KPI-Statistiken, Gamification und das Tagebuch befinden sich in `gerris_erfolgs_tracker/models.py`.

Persistenter JSON-Schema-Ausschnitt (`gerris_state.json`):

```json
{
  "journal_entries": {
    "2024-08-01": {
      "date": "2024-08-01",
      "moods": ["ruhig / calm", "dankbar / grateful"],
      "mood_notes": "kurz notiert",
      "triggers_and_reactions": "stressiges Gespräch, dann geatmet",
      "negative_thought": "Ich schaffe das nicht",
      "rational_response": "Ein Schritt nach dem anderen",
      "self_care_today": "Spaziergang",
      "self_care_tomorrow": "früher schlafen",
      "gratitude_1": "Kaffee",
      "gratitude_2": "Freunde",
      "gratitude_3": "Sonne",
      "categories": ["daily_structure", "friends_family"]
    }
  }
}
```

## Architektur-Hinweis

Die App nutzt den aktuellen OpenAI Python-Flow mit strukturierten Outputs: `from openai import OpenAI`, gefolgt von `client.responses.parse(..., text_format=YourPydanticModel)`. Der Zugriff auf die API ist optional; ohne gültigen Schlüssel bleiben Fallbacks aktiv und die App lauffähig.
