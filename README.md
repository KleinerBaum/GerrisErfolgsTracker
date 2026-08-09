# README.md
# Gerris ErfolgsTracker

Streamlit-App mit Eisenhower-ToDo-Board, Gamification und optionaler OpenAI-Integration für KI-gestützte Vorschläge (Auto-Kategorisierung, Motivation). Ohne API-Key greifen Fallback-Texte und die App bleibt voll funktionsfähig.

## Gerris Kompass – neue Sites-Webapp

Das Konzept und die technischen Verträge der selbstpflegenden Kalender-, Gap-
und Entscheidungszentrale sind in
[`docs/planning-center.md`](docs/planning-center.md) dokumentiert.

Unter `web/` entsteht die eigenständige, responsive Sites-Version des
ErfolgsTrackers. Sie führt Aufgaben, Kalender, Kosten, Unterlagen und Tagebuch in
einer ruhigen deutschen Oberfläche zusammen.

- Rekursiv einklappbare Live-Navigation für den Drive-Ordner „Unterlagen und
  Dokumente“; die Hauptansicht zeigt den direkten Ordnerinhalt.
- Geschützte Inline-Vorschau für PDFs, Bilder, Texte sowie exportierte
  Google-Dokumente, -Tabellen und -Präsentationen; Dateiinhalte bleiben in
  Google Drive.
- Google Tasks ist die verbindliche Aufgabenquelle; Anlage, Abschluss,
  Wiederöffnung und Löschung werden über die Tasks API synchronisiert.
- Google Calendar dient als private Agenda mit bestätigungspflichtigen
  Zahlungserinnerungen; Gmail-Entwürfe werden ausschließlich nach einer
  bewussten Nutzeraktion über die Gmail API angelegt und niemals automatisch
  versendet.
- Kostenbuch für vergangene, laufende und geplante Kosten einschließlich
  Fixkosten, Budget, Kategorien und Fälligkeiten.
- Das **Tagebuch** bündelt den abendlichen Tagesabschluss in drei kurzen
  Schritten: Rückblick, Abgleich von Aufgaben, Terminen, Bewerbungen, Finanzen
  und Unterlagen sowie Planung für morgen und die nächsten sieben Tage.
  Fachliche Änderungen werden dabei direkt im jeweiligen App-Bereich
  gespeichert; bestehende Journal-Daten aus älteren Backups bleiben lesbar.
- Private, geräteübergreifende Sites-Persistenz über D1; lokaler Browser-Speicher
  dient nur als Offline-Rückfall.

Lokaler Start:

```bash
cd web
npm install
npm run dev
```

Vor jedem lokalen Start wendet `predev` die noch offenen D1-Migrationen auf den
ignorierten lokalen Speicher unter `web/.wrangler/` an. Dadurch sind Zustand
und Planungs-APIs beim ersten Aufruf sofort verfügbar. Die produktive Sites-D1
und vorhandene Laufzeitwerte werden dabei nicht verändert.

Qualitätsprüfung:

```bash
cd web
npm run lint
npm run typecheck
npm test
```

Die Werte in `web/.env.example` sind ausschließlich Integrationskonfiguration.
Google OAuth-Client-Secrets oder API-Schlüssel gehören niemals in das
Repository. Die vollständige Google-Cloud- und Sites-Konfiguration einschließlich
OAuth-Weiterleitungs-URL, minimaler Berechtigungen und Migration bestehender
Aufgaben steht in
[`docs/google-workspace-sites.md`](docs/google-workspace-sites.md).

Die UI folgt einem klaren, fokussierten Dark-Theme mit dunkelgrünem Primärton (#1C9C82) auf einem dezenten, bildfreien Gradient-Hintergrund, um einen ruhigen, professionellen Eindruck zu vermitteln. Statusinformationen werden textlich und über Typografie/Abstände vermittelt, um Icon-Lärm zu vermeiden. Alle sichtbaren Texte sind ausschließlich auf Deutsch gehalten, damit keine englischen Begriffe mehr auftauchen.
Die Sidebar konzentriert sich auf die Navigation; Schalter, Build-Infos sowie Sicherheits- und Gamification-Optionen liegen nun in einem kompakten Header-Dropdown rechts neben „E-Mails“ / The sidebar now focuses on navigation, while toggles, build info, and safety/gamification options live in a compact header dropdown placed to the right of “Emails”.

  - Sidebar-Coach mit 30 pointierten DE-Templates (Talking Head + Sprechblase) für Stellensuche, Administratives, Tagesstruktur, Familie & Freunde und Drogen; abgelegt in `gerris_erfolgs_tracker/coach/templates_de.py` für den späteren Selector-Import / Sidebar coach with 30 focused German templates (talking head + speech bubble) covering job search, admin work, daily structure, family & friends, and substance use; stored in `gerris_erfolgs_tracker/coach/templates_de.py` for selector-based loading.
  - Die Aufgaben-UI liegt nun in `gerris_erfolgs_tracker/ui/tasks.py`; `app.py` bindet sie nur noch ein / The task UI now lives in `gerris_erfolgs_tracker/ui/tasks.py`, with `app.py` delegating to it.
  - `gerris_erfolgs_tracker/ui/__init__.py` exportiert das `tasks`-Modul direkt, sodass `from gerris_erfolgs_tracker.ui import tasks` in Skripten und Tests funktioniert / `gerris_erfolgs_tracker/ui/__init__.py` now exports the `tasks` module so `from gerris_erfolgs_tracker.ui import tasks` works in scripts and tests.
  - Neues Dashboard bündelt KPI- und Trend-Widgets (Tachometer, Kalender, Coach/Gamification) und löst die früheren Blöcke auf der Ziele-Seite ab, sodass dort mehr Raum für Ziel-Setup und Vorlagen bleibt / The new dashboard centralizes KPI and trend widgets (gauges, calendar, coach/gamification), replacing the former blocks on the Goals page so it can focus on goal setup and templates.
  - Der Tab **Ziele** fokussiert jetzt auf Ziel-Empty-State, Übersicht/Details sowie Kategorie- und Sicherheitsoptionen; AI- und Storage-Schalter sitzen in einem klar benannten Bereich, während Dashboard-Elemente ausschließlich auf der Dashboard-Seite leben / The **Goals** tab now focuses on the empty state, overview/details, plus category and safety options; AI and storage toggles sit in a clearly labeled section, while dashboard widgets live solely on the Dashboard page.
  - Der Bereich **Ziele & Einstellungen** wird ohne Überschrift eingebettet, damit die Seite schlanker wirkt / The **Goals & settings** section renders without a header to keep the page lean.
  - Die Auswahl von Aufgabenvorlagen funktioniert ohne Streamlit-Fehler im Formular **ToDo hinzufügen** / Task template selection works without Streamlit errors in the **Add task** form.
  - Neuer Bereich **E-Mails / Emails** bietet ein Formular mit Vorschau zum schnellen Erstellen von E-Mail-Entwürfen / New **E-Mails / Emails** area provides a form with preview for quick email drafts.
  - Neuer Bereich **Google Workspace** bündelt Kalender, Gmail, Tasks, Drive und Sheets; Google Tasks lädt Tasklisten und Aufgaben live inkl. Anlage, die übrigen Bereiche zeigen noch Beispieldaten / New **Google Workspace** area bundles Calendar, Gmail, Tasks, Drive, and Sheets; Google Tasks now loads task lists and tasks live with creation, while the other sections still show sample data.
  - Google-Workspace-Verbindung: OAuth-Flow mit **Google verbinden / Connect Google**-Button, Statusanzeige und einmaligem Smoke-Test (z. B. Kalenderliste) zur Verifizierung / Google Workspace connection: OAuth flow with a **Connect Google** button, status indicator, and a one-time smoke test (e.g., calendar listing) for verification.
  - Neuer Bereich **Kalender / Calendar**: Kalender-Auswahl, Button **Nächste 20 Termine anzeigen / List next 20 events** sowie optionales Formular zum Erstellen von Terminen via Calendar API (mit iCal-Fallback bei fehlender OAuth-Verbindung) / New **Calendar** area: calendar selection, **List next 20 events** button, and an optional event creation form via the Calendar API (with iCal fallback when OAuth is not connected).
  - Der Quick-Action-Button **E-Mails / Emails** nutzt jetzt ebenfalls ein Dropdown, damit das Design mit den benachbarten Schnellaktionen konsistent bleibt / The **E-Mails / Emails** quick action now uses a dropdown as well to stay consistent with the neighboring quick actions.
  - Quick-Action-Dropdowns für Aufgaben, Ziele und Journal leeren ihre Felder nach dem Speichern und klappen automatisch zu / Quick-action dropdowns for tasks, goals, and journal now clear their fields after saving and auto-collapse.
  - Quick-Action-Ziele setzen nach dem Speichern ein Reset-Flag und initialisieren ihre Felder vor dem nächsten Render, um Streamlit-Session-State-Fehler zu vermeiden / Quick-action goals set a reset flag after saving and initialize their fields before the next render to avoid Streamlit session-state errors.
  - Quick-Action-ToDos setzen nach dem Speichern ein Reset-Flag und initialisieren ihre Felder vor dem nächsten Render, damit Streamlit-Session-State-Fehler vermieden werden / Quick-action ToDos set a reset flag after saving and reinitialize their fields before the next render to avoid Streamlit session-state errors.
  - Neue Analytics-Funktionen für Cycle Time, Backlog-Gesundheit und Abschluss-Heatmap ergänzen das KPI-Tab um zusätzliche Kennzahlen / New analytics for cycle time, backlog health, and a completion heatmap extend the KPI tab with additional indicators.
  - Kompaktere Oberfläche: Gamification in der Sidebar nur noch als Kurzzeile plus Expander, Wochenstatistiken/Kategorie-Trends als einklappbare Grafiken und Aufgaben mit Top-3-Vorschau pro Kategorie sowie eingeklappten Filtern / Compact UI: sidebar gamification reduced to a short summary plus expander, weekly stats and category trends tucked into expanders, and the task list shows a top-3 preview per category with collapsible filters.
  - Dashboard-Kopf ist kompakter gestaltet: reduzierte Abstände, breitere Quick-Action-Spalten und ikonische Labels (📝/🎯/📓/✉️) halten Titel und Schnellaktionen in einer Zeile; auf schmalen Viewports brechen die Spalten sauber um / The dashboard header is now more compact with tighter spacing, wider quick-action columns, and icon-first labels (📝/🎯/📓/✉️) to keep the title and quick actions on one line while gracefully wrapping on narrow viewports.
  - Einzelne Aufgaben in der Ziele-Übersicht, Kalenderansicht und den Fokus-Quadranten lassen sich direkt vor Ort bearbeiten, erledigen oder löschen (Titel, Datum, Priorität, Quadrant, Kategorie, Beschreibung) / Single tasks in the goals overview, calendar view, and focus quadrants can now be edited inline, marked done, or deleted (title, date, priority, quadrant, category, description).
  - Fokus-Editor-Popover zeigt die Task-ID im Label, damit mehrere Einträge eindeutig bleiben / Focus editor popovers show the task ID in the label so multiple entries stay unique.
  - Kalender-Editor-Popover zeigt die Task-ID im Label, damit mehrere Einträge eindeutig bleiben / Calendar editor popovers show the task ID in the label so multiple entries stay unique.
  - Buttons und Popover-Trigger behalten die Standard-Zeilenhöhe und erlauben Zeilenumbrüche, sodass Quick-Actions auf breiten und schmaleren Viewports vollständig lesbar bleiben / Buttons and popover triggers keep the default line height and allow wrapping so quick actions stay fully readable on wide and narrower viewports.
  - **Misc KPIs** im Workload-Bereich sind nun direkt unter der Liste „Überfällig & Nächste 3 Tage“ platziert, damit Aufgaben und Kennzahlen zusammenbleiben / **Misc KPIs** in the workload section now sit directly under the “Overdue & next 3 days” list to keep tasks and metrics together.

Die einzige externe Integration ist derzeit die OpenAI API. Wenn die Option **AI aktiv / AI enabled** gesetzt ist, nutzt die App standardmäßig Luna (`gpt-5.6-luna`, per Betreiber-Einstellung überschreibbar), um z. B. automatisch den Eisenhower-Quadranten zu empfehlen oder kurze Motivationsnachrichten basierend auf den jüngsten KPIs zu erstellen. Ist kein API-Key hinterlegt oder die AI-Option deaktiviert, werden statische, vorgefertigte Texte verwendet, sodass die Anwendung weiterhin vollständig nutzbar bleibt.

**Neu (optional, AI):**

- Tagesplaner in der Aufgaben-Seite: KI prüft morgens Quadrant, Priorität, Fälligkeit, Streak und die letzte Stimmung und schlägt 2–3 Fokusaufgaben plus Pufferhinweis vor (Fallback aktiv ohne API-Key).
- Wochenrückblick blendet erkannte Stimmungs-Tags aus dem Tagebuch ein, damit Muster und Energie-Dips sichtbar werden.
- Wochenrückblicke können per OpenAI ScriptComposer mit strukturierten Outputs generiert werden (inkl. Sicherheits-Prompts, automatisches Fallback auf Templates).
- E-Mail-Entwürfe nutzen strukturierte KI-Vorschläge (Betreff, Typ, Text) und fallen bei Fehlern auf eine Standardvorlage zurück / Email drafts use structured AI suggestions (subject, type, body) with deterministic fallback templates.
- Im Formular **ToDo hinzufügen** liefert der Button **AI: Plan & Komplexität vorschlagen** einen editierbaren Vorschlag (Aufwand, Priorität, Milestone-Plan) mit expliziter Checkbox zur Übernahme.
- Tagebuch-Einträge werden semantisch gegen Ziele abgeglichen; erkannte Teilfortschritte (Meilensteine, Fortschritt in %) erscheinen als zweisprachige Vorschläge zur Bestätigung.
- Tagebuch und Aufgaben verlinken sich gegenseitig: Tages-Einträge listen die verknüpften Ziele/Tasks und die Aufgaben-Detailansicht zeigt, wann sie im Journal erwähnt wurden; beim Abschließen einer Aufgabe kannst du direkt eine kurze Reflexion für das heutige Journal notieren / Journal and tasks are now linked both ways: daily entries show their connected goals/tasks and task details highlight the journal dates mentioning them; completing a task optionally opens a short reflection box for today's journal entry.

### Modellrouting

Luna (`gpt-5.6-luna`) ist der Standard für Streamlit sowie allgemeine Sites-Funktionen. Kurze Einstufungen laufen ohne zusätzlichen Denkaufwand, Planung und Mailentwürfe mit niedrigem, Journal- und Aufgabenanalysen mit mittlerem Aufwand. Alle strukturierten Streamlit-Aufrufe setzen zweckbezogene Ausgabelimits und `store=False`; `OPENAI_MODEL` bleibt ein bewusster Betreiber-Override.

Im Bewerbungsstudio wird die Konfiguration je ausgewähltem Ergebnis gespeichert. CV und Anschreiben starten mit Terra (`gpt-5.6-terra`) und mittlerem Aufwand. Bewerbungs-Mail und Unternehmensbriefing starten mit Luna und niedrigem, die Interviewvorbereitung mit Luna und mittlerem Aufwand. Sol (`gpt-5.6-sol`) sowie die Stufen Hoch und Sehr hoch sind bewusst wählbar, werden aber nie automatisch vorbelegt. Neue Browseraufträge akzeptieren ausschließlich Luna, Terra oder Sol und die Aufwandstufen Ohne, Niedrig, Mittel, Hoch oder Sehr hoch.

## Voraussetzungen

- Python >= 3.11
- Ein OpenAI API Key, falls du Modellantworten erzeugen möchtest (`OPENAI_API_KEY`).
- Optional: Modell-Override via `OPENAI_MODEL` (Standard: `gpt-5.6-luna`) und benutzerdefinierte Basis-URL z. B. EU-Endpunkt.
- Optionale Persistenz & Sync: Die App schreibt standardmäßig in einen OneDrive-Sync-Ordner (z. B. `~/OneDrive/GerrisErfolgsTracker/gerris_state.json` oder `C:\\Users\\gerri\\OneDrive\\GerrisErfolgsTracker`). Über `GERRIS_ONEDRIVE_DIR` kannst du den Pfad explizit setzen; das Verzeichnis wird bei Bedarf angelegt. Anhänge (PNG/JPG) landen in `attachments/<todo_id>/` unterhalb des gleichen Stammordners, der JSON-State speichert nur Dateireferenzen.
- Alle Zeitstempel werden intern als timezone-aware UTC-Datetimes gespeichert, um Sortierungen konsistent zu halten / All timestamps are stored as timezone-aware UTC datetimes to keep sorting consistent.
- Optionale E-Mail-Erinnerungen über Brevo: `BREVO_API_KEY` + `BREVO_SENDER` (und optional `BREVO_SENDER_NAME`) in der Umgebung setzen.

## Datenhaltung & Backup/Recovery

- Standardpfad: `gerris_state.json` im OneDrive-Sync-Ordner `~/OneDrive/GerrisErfolgsTracker/` bzw. `C:\\Users\\<name>\\OneDrive\\GerrisErfolgsTracker`. Anhänge werden parallel im Unterordner `attachments/<todo_id>/` abgelegt.
- Fallback: Wenn kein OneDrive-Hinweis gefunden wird, legt die App `.data/GerrisErfolgsTracker/gerris_state.json` im Projektverzeichnis an.
- Override: Über `GERRIS_ONEDRIVE_DIR` kannst du den Pfad explizit setzen; der Ordner wird bei Bedarf erstellt.
- Backup: Kopiere `gerris_state.json` regelmäßig in einen sicheren Ordner (z. B. OneDrive-Versionierung oder ein manuelles Backup).
- Backup-Upload: Im Header-Dropdown **⚙️ Einstellungen** → **Sicherheit & Daten** kannst du eine `gerris_state.json` hochladen und den aktuellen Stand ersetzen; der Import-Button nutzt den Formular-Submit, damit Upload und Bestätigung zuverlässig funktionieren / Backup upload: use **⚙️ Settings** → **Safety & data** in the header dropdown to upload a `gerris_state.json` and replace the current state; the import button uses the form submit so uploads and confirmations work reliably.
- Recovery bei defekter Datei: Benenne `gerris_state.json` in `gerris_state.bak` um, starte die App neu (sie legt eine frische Datei an) und kopiere anschließend gültige Teile aus dem Backup zurück.
- Reset: Löschen oder Umbenennen der Datei setzt den Zustand komplett zurück; hilfreich, wenn die UI nicht mehr lädt oder JSON-Strukturen geändert wurden.

## Lokale Einrichtung

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install --upgrade pip
pip install -r requirements.txt -r requirements-dev.txt  # Dev-Setup / development setup
streamlit run app.py

# Runtime-only / nur Laufzeit (z. B. Deployment):
# pip install -r requirements.txt
# streamlit run app.py
```

## Code-Struktur / Code structure

- `app.py` bleibt der Streamlit-Einstiegspunkt, während UI-Helfer (Badges, Dark-Theme-Styling) in `gerris_erfolgs_tracker/ui/common.py` gebündelt sind / `app.py` stays the Streamlit entry point and UI helpers (badges, dark theme styling) live in `gerris_erfolgs_tracker/ui/common.py`.

Hinweise:
- Der Start funktioniert auch ohne API Key; die App zeigt dann einen Hinweis an.
- Falls du den EU-Endpunkt nutzen möchtest, setze `OPENAI_BASE_URL=https://eu.api.openai.com/v1`.

## Bereitstellung & Datenhaltung / Deployment & data handling

- **Lokal / Local:** `streamlit run app.py` öffnet die App im Browser unter `localhost:8501`. ToDos, KPIs und Einstellungen
  landen automatisch als `gerris_state.json` im OneDrive-Sync-Ordner `~/OneDrive/GerrisErfolgsTracker/` (oder dem Pfad aus
  `GERRIS_ONEDRIVE_DIR`). Falls weder OneDrive noch ein Hinweis vorhanden ist, nutzt die App `.data/GerrisErfolgsTracker/gerris_state.json`.
  Ein Löschen der Datei setzt den Zustand zurück; für Backups genügt das Kopieren der JSON-Datei.
- **Streamlit Cloud:** Repository mit dem Streamlit Cloud Dashboard verbinden und die Secrets wie unten beschrieben hinterlegen;
  danach kann die App unter der bereitgestellten URL genutzt werden (z. B. https://gerriserfolgstracker.streamlit.app/). Die
  App schreibt ebenfalls in den OneDrive-Pfad (über `GERRIS_ONEDRIVE_DIR` konfigurierbar); auf der Community Cloud kann die
  Datei dennoch flüchtig sein und nach einem Neustart verschwinden. Sichere Daten durch OneDrive-Versionierung oder manuelle
  Backups.
- **Build-Info im Header-Dropdown:** Die App zeigt den aktuellen Commit (Kurz-Hash + Datum) im Einstellungen-Popover rechts
  neben „E-Mails“ an, damit Deployments sofort mit dem erwarteten `main`-Stand abgeglichen werden können / The app surfaces the
  current commit (short hash + commit date) inside the settings popover next to “Emails” so deployments can be compared against
  the expected `main` revision at a glance.

## Secrets, AI & Datenschutz

Die App sucht nach dem OpenAI Key in `st.secrets` oder der Umgebung:

- `OPENAI_API_KEY` (erforderlich für Modellaufrufe)
- `OPENAI_BASE_URL` (optional, z. B. EU-Endpunkt)
- `OPENAI_MODEL` (optional, Standard `gpt-5.6-luna`)
- `GERRIS_ONEDRIVE_DIR` (optional: expliziter OneDrive-Sync-Ordner für die JSON-Datei)
- `GOOGLE_CALENDARS_JSON` (optional: JSON-Liste mit Google-Kalendern, um mehrere Kalender ohne viele ENV-Variablen zu konfigurieren)
- `CAL_GERRI_ID`, `CAL_GERRI_ICAL_URL`, `CAL_GERRI_NAME` (optional: Kalender-ID, iCal-Link und Anzeigename für Gerri)
- `CAL_2025_ID`, `CAL_2025_ICAL_URL`, `CAL_2025_NAME` (optional: Kalender-ID, iCal-Link und Anzeigename für den 2025-Kalender)
- Legacy (optional): `id_gerri`, `ical_Gerri`, `KalenderGerri` sowie `2025 von Carla, Miri & Gerrit`, `CALENDAR_SHARED_2025` (ältere Kalender-Keys für bestehende Setups)
- `GOOGLE_CLIENT_ID` (optional: OAuth Client-ID für die Google Workspace Integration)
- `GOOGLE_CLIENT_SECRET` (optional: OAuth Client Secret für die Google Workspace Integration)
- `GOOGLE_REDIRECT_URI` (optional: OAuth Redirect-URI für die Google Workspace Integration)
- `GOOGLE_TOKEN_STORE_BACKEND` (optional: Token-Backend, z. B. `sqlite` oder `env`)
- `GOOGLE_TOKEN_DB_PATH` (optional: Pfad für die lokale SQLite-Tokenablage, Standard: `.local/gerris_google_tokens.sqlite`)
- `GOOGLE_TOKENS_JSON` (optional: JSON-Objekt mit Tokens pro Nutzer, z. B. aus Secrets/ENV)
- `GOOGLE_TOKENS_JSON_PATH` (optional: Schreibbarer Pfad für das JSON-Token-Backend)

Google-Workspace-Services nutzen ein maximales 7-Scopes-Set (OpenID + E-Mail sowie Calendar, Tasks, Gmail, Drive, Sheets), damit der Zugriff gebündelt und nachvollziehbar bleibt / Google Workspace services use a capped 7-scope set (OpenID + email plus Calendar, Tasks, Gmail, Drive, Sheets) so access stays bundled and traceable.

Beispiel für `GOOGLE_CALENDARS_JSON`:

```env
GOOGLE_CALENDARS_JSON='[
  {"key":"gerri","name":"Gerri","calendar_id":"...","ical_url":"..."},
  {"key":"cal_2025","name":"2025 von Carla, Miri & Gerrit","calendar_id":"...","ical_url":"..."}
]'
```

## E-Mail-Erinnerungen / Email reminders

- Versand per Brevo: `BREVO_API_KEY` und `BREVO_SENDER` (optional `BREVO_SENDER_NAME`).
- Scheduler/Worker-Parameter über Umgebung: `REMINDER_RECIPIENT_EMAIL` (Default: Sender), `REMINDER_LOOKAHEAD_MINUTES` (Default: 60) und `REMINDER_POLL_INTERVAL_SECONDS` (Default: 300).
- Beispiel `.env`:

```env
BREVO_API_KEY=your-brevo-key
BREVO_SENDER=reminder@example.com
# BREVO_SENDER_NAME=Gerris ErfolgsTracker
REMINDER_RECIPIENT_EMAIL=user@example.com
REMINDER_LOOKAHEAD_MINUTES=90
REMINDER_POLL_INTERVAL_SECONDS=300
```

- Worker starten (z. B. in einem separaten Prozess oder Thread):

```python
from gerris_erfolgs_tracker.notifications.email_brevo import BrevoEmailNotificationService
from gerris_erfolgs_tracker.notifications.scheduler import ReminderScheduler

scheduler = ReminderScheduler(BrevoEmailNotificationService())
scheduler.run()
```

### Lokale Secrets

Erstelle `.streamlit/secrets.toml` (siehe `.streamlit/secrets.toml.example`):

```toml
OPENAI_API_KEY = "sk-..."
# OPENAI_BASE_URL = "https://eu.api.openai.com/v1"
# OPENAI_MODEL = "gpt-5.6-luna"
```

### Streamlit Cloud

1. Repository in Streamlit Cloud verbinden.
2. Unter **App settings → Secrets** folgende Einträge hinzufügen:
   - `OPENAI_API_KEY = sk-...`
   - Optional `OPENAI_BASE_URL = https://eu.api.openai.com/v1`
   - Optional `OPENAI_MODEL = gpt-5.6-luna`
3. Deploy starten; die Abhängigkeiten werden über `requirements.txt` installiert.

> **Wichtig:** API-Keys niemals in das Repository einchecken. Nutze lokal `.streamlit/secrets.toml` und auf der Streamlit
> Community Cloud die Secrets UI. API-Keys werden nicht in der Persistenzdatei gespeichert; entferne sensible Inhalte aus
> Notizen oder Beschreibungen, wenn du keine personenbezogenen Daten ablegen möchtest.

## Entwicklung

- Runtime-Abhängigkeiten: `pip install -r requirements.txt` (für Deployment oder minimale lokale Nutzung).
- Entwicklungs-Setup: `pip install -r requirements.txt -r requirements-dev.txt` installiert zusätzlich `ruff`, `mypy` und `pytest`.
- Format/Lint: `ruff format` und `ruff check .`
- Typprüfung: `mypy`
- Tests: `pytest -q`
- CI: GitHub Actions Workflow (`.github/workflows/ci.yml`) führt `ruff check .` und `pytest -q` bei Push/PR aus.
- Streamlit-Widgets: Verwende `width="stretch"` statt `use_container_width=True` (deprecated nach 2025-12-31).
- Setup-Templates: `.env.example` und `.streamlit/secrets.toml.example` enthalten sichere Vorlagen ohne Secrets.
- Google Workspace Setup: siehe [`docs/google-workspace-sites.md`](docs/google-workspace-sites.md). Die Python-OAuth-Integration ist separat in `docs/python-google-workspace.md` beschrieben.

## Troubleshooting

- **OneDrive-Pfad wird nicht gefunden:** `GERRIS_ONEDRIVE_DIR` explizit setzen und prüfen, ob der Ordner existiert; ansonsten
  legt die App `.data/GerrisErfolgsTracker/gerris_state.json` an. Bei einer beschädigten Datei blockiert die App automatische Defaults; siehe `docs/storage-recovery.md`.
- **Streamlit Cloud verliert Daten:** Community-Instanzen speichern Dateien nur temporär. Lege die JSON-Datei in OneDrive ab
  oder halte lokale Backups bereit.
- **JSON defekt:** Datei in `gerris_state.bak` umbenennen, App starten (frische Datei), alte Datei mit einem JSON-Validator
  prüfen und nur gültige Abschnitte zurückkopieren.
- Ausführliche Hinweise: siehe [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).
- Ereignislisten (z. B. Gamification-Historie, processed IDs) werden nach jedem Append als Ringpuffer auf 1 000 Einträge begrenzt, um Speicherverbrauch und Dedup-Logik stabil zu halten / Event lists (e.g., gamification history, processed IDs) use 1,000-entry ring buffers after each append to contain memory use while keeping dedup working.
- Streamlit-Forms: Alle Submit-Buttons müssen innerhalb ihres `st.form` stehen; die Quick-Edit-Speicheraktion im Aufgabenlisten-Formular ist entsprechend eingebettet, sodass keine `st.form_submit_button`-API-Fehler auftreten.
- ToDo-Meilenstein-Aktionen nutzen `st.form_submit_button`, damit Entwürfe und Vorschläge ohne `StreamlitAPIException` funktionieren / ToDo milestone actions rely on `st.form_submit_button` so drafts and suggestions work without `StreamlitAPIException`.
- Widget-Keys: Der frühere Button "AI: Motivation" entfällt, sodass keine kontextspezifischen Sidebar-Keys mehr nötig sind / Widget keys: The former "AI: Motivation" button has been removed, so sidebar-specific keys are no longer required.
- Strukturierte LLM-Schemas decken nun auch Milestone-Vorschläge (small/medium/large) ab, sodass Imports für die AI-Vorschläge ohne Fehler funktionieren / Structured LLM schemas now include milestone suggestions (small/medium/large) to keep AI suggestion imports error-free.

> **Formulare / Forms:** Platzieren Sie `st.form_submit_button` immer innerhalb eines `st.form`-Blocks und bei Bedarf innerhalb von Spalten mittels `with col:`. So vermeiden Sie `StreamlitAPIException`-Meldungen zur Formularplatzierung.

## Einstellungen & Sicherheit

- Die Seitenleiste bündelt die Navigation zwischen **Dashboard**, **Ziele / Goals**, **Aufgaben / Tasks**, **Tagebuch / Journal** und **E-Mails / Emails**, während Gamification-Variante, AI-Schalter, Sicherheitsoptionen und Build-Info in das Header-Dropdown rechts neben **E-Mails** gewandert sind. Die App startet mit geöffneter Sidebar und lädt standardmäßig das **Dashboard** / The sidebar hosts navigation across **Dashboard**, **Goals**, **Tasks**, **Journal**, and **Emails**, while the gamification mode, AI toggle, safety controls, and build info live in the header dropdown next to **Emails**. The app still opens with the sidebar expanded and defaults to the **Dashboard**.
- Die Navigation verwendet stabile interne Keys für die Seitenauswahl, sodass übersetzte Labels keine leeren Seiten mehr erzeugen / Navigation relies on stable internal keys for page selection so translated labels no longer lead to blank pages.
- Die Sidebar merkt sich die zuletzt gewählte Seite über den Session State, sodass Reruns nicht ungeplant auf **Ziele / Goals** zurückspringen / The sidebar remembers the last selected page via session state so reruns do not unexpectedly jump back to **Ziele / Goals**.
- Header-Aktionen wie **E-Mails / Emails** setzen die Zielseite vorab über einen Pending-Status, damit die Navigation vor der Sidebar-Radio-Instanziierung stabil bleibt / Header actions such as **Emails** set the target page via a pending state so navigation remains stable before the sidebar radio is instantiated.
- Die Oberfläche ist vollständig auf Deutsch festgelegt; der frühere Sprachumschalter in der Sidebar entfällt, damit keine englischen Begriffe erscheinen.
- Der Schalter **AI aktiv / AI enabled** sitzt im Header-Dropdown neben **E-Mails** und steuert alle KI-Funktionen zentral.
- Der Block **Ziele im Überblick / Goals at a glance** befindet sich im Dashboard; der Tab **Ziele / Goals** verweist auf Vorlagen und Einstellungen für Ziele, bleibt aber frei von KPI-Widgets / The **Goals at a glance** block sits on the dashboard; the **Goals** tab links you to goal templates and settings without duplicating KPI widgets.
- Der Kopfbereich der Seite **Ziele** ist dreizeilig aufgebaut: links steht der Titel **Gerris ErfolgsTracker**, rechts daneben befinden sich die Quick-Actions **ToDo hinzufügen / Add task** (Popover), **Ziel hinzufügen / Add goal** (Popover mit Zielvorlage) sowie in der dritten Zeile **Tagebucheintrag / Journal entry** als Popover.
- In frischen Sessions ohne Daten zeigt die Seite **Ziele / Goals** einen geführten Empty-State mit CTA, um das erste Ziel anzulegen oder ein ToDo hinzuzufügen; optional ist ein AI-Impuls verfügbar / In fresh sessions without data, the **Ziele / Goals** page now shows a guided empty state with a CTA to create the first goal or add a task; an AI nudge is available when enabled.
- Der Bereich **Ziel-Canvas / Goal canvas** fragt jetzt Titel, Fokus-Kategorien, Zeitfenster (1 Woche/30/90 Tage oder Custom), Start- und Zieltermin, Check-in-Rhythmus, messbaren Zielwert + Einheit, Erfolgskriterien, Motivation, Risiken/Absicherung, nächsten Schritt sowie Feier/Belohnung zweisprachig ab – alles direkt im Ziel-Setup speicherbar.
- Auf der Seite **Dashboard** startet jetzt ein Tachometer-Überblick zu Stellensuche, Administratives, Familie & Freunde, Drogen sowie Tagesstruktur, der pro Zeile maximal drei Kategorien anzeigt und bei Bedarf automatisch umbricht; rechts daneben steuerst du per Checkbox, ob das KPI-Dashboard bzw. die Kategoriendiagramme eingeblendet werden. / On the **Dashboard**, the gauge overview for job search, administrative, family & friends, substance use, and daily structure now shows at most three categories per row and wraps automatically when more are selected; to the right you still use checkboxes to toggle the KPI dashboard and category charts.
- Im Dashboard-Block **Ziele im Überblick** steuerst du über einen kompakten Expander **Kategorien / Categories**, welche Kategorien als Tachometer erscheinen, und passt die Kennzahlen an (Anzahl angezeigter KPIs, Auswahl/Setup einzelner Kennzahlen, Farbe oder Darstellungsart). Jeder Tacho ist anklickbar und öffnet darunter eine Detailansicht mit den zugeordneten Aufgaben. / On the dashboard, the **Ziele im Überblick / Goals overview** block uses a compact **Kategorien / Categories** expander to pick which categories are shown as gauges and to adjust the metrics (number of KPIs shown, metric selection/configuration, color or visualization style). Each gauge is clickable and opens a detailed task view below.
- Klickst du auf eine Kategorie, verschwinden die übrigen Tachometer; stattdessen zeigt ein Fokus-Panel den meilensteinbasierten Fortschritt jeder Aufgabe der gewählten Kategorie. Die Kategorien-Checkboxen liegen nur im Dropdown, links davon stehen die Tachos und rechts daneben **Misc KPIs**; die Tacho-Größe passt sich an die Anzahl der gewählten Kategorien an. / Clicking a category hides the other gauges; a focus panel then surfaces milestone-based progress for every task in that category. The category checkboxes only appear in the dropdown, with the gauges to the left and **Misc KPIs** on the right; gauge sizing now adapts to the number of selected categories.
- Die Spalte **Überfällig & Nächste 3 Tage / Overdue & next 3 days** im Dashboard lässt dich Aufgaben direkt bearbeiten (Titel, Fälligkeit, Priorität, Quadrant, Kategorie, Beschreibung) und zeigt eine Markdown-Vorschau an / The **Overdue & next 3 days** dashboard column now supports inline edits for tasks (title, due date, priority, quadrant, category, description) with a Markdown preview.
- Unterhalb der Tachos folgt eine Dreispalten-Übersicht: links überfällige bzw. innerhalb der nächsten drei Tage fällige Aufgaben, mittig die Wochenkalender-Ansicht mit fälligen Tasks und rechts sechs kompakte Kennzahlen (Cycle Time, Überfällig-Quote, offene Aufgaben, in Arbeit, Fälligkeiten in drei Tagen, Gesamt-Streak). Darunter stehen ein Coach-Panel sowie die Inhalte der gewählten Gamification-Variante. / Beneath the gauges you’ll find a three-column overview: left shows overdue and next-three-days tasks, middle shows the current week’s calendar view with due tasks, and right lists six compact metrics (cycle time, overdue ratio, open tasks, in progress, due in three days, overall streak). Below that, the coach panel and the selected gamification mode’s content appear.
- Direkt unter Coach- und Gamification-Bereich erscheinen die Google-Kalender **2025 von Carla, Miri & Gerrit** sowie **Gerri** nebeneinander; KPI-Dashboard, Kategorie-Trends und Einstellungen folgen darunter. / Right below the coach and gamification area, the **2025 by Carla, Miri & Gerrit** and **Gerri** Google Calendars sit side by side; the KPI dashboard, category trends, and settings follow afterwards.
- Die Zielbearbeitung wird erst nach Klick auf **Ziel erstellen / Create goal** sichtbar; dort findest du das zweispaltige **Ziel-Canvas / Goal canvas** sowie Wochenziele pro Kategorie (0–70 pro Woche) kompakt angeordnet.
- Der Button **Session zurücksetzen / Reset session** sitzt jetzt im Header-Dropdown unter **Sicherheit & Daten / Safety & data** und löscht ToDos, KPIs, Gamification und Einstellungen und stellt die Defaults wieder her / The **Session zurücksetzen / Reset session** button now lives inside the header dropdown’s **Sicherheit & Daten / Safety & data** section and resets todos, KPIs, gamification, and settings.
- Hinweisboxen sind im Header-Dropdown unter **Sicherheit & Daten / Safety & data** per Toggle **Hinweise anzeigen / Show safety notes** standardmäßig ausgeblendet, lassen sich bei Bedarf aber einblenden; der Speicherhinweis oberhalb des Titels wird separat über **Speicherhinweis anzeigen / Show storage notice** gesteuert (Standard: aus) / The **Sicherheit & Daten / Safety & data** section in the header dropdown hides safety and storage notices by default behind the **Hinweise anzeigen / Show safety notes** toggle, while the storage notice above the title remains separately controlled via **Speicherhinweis anzeigen / Show storage notice** (default: off).
- Beide Toggles initialisieren ihren Session-State nur beim ersten Render und überlassen die Werte anschließend Streamlit, damit manuelle Änderungen stabil bleiben und keine StreamlitAPIException ausgelöst wird / Both toggles initialize their session state only on first render and leave subsequent updates to Streamlit so manual changes remain stable and no StreamlitAPIException is triggered.

## ToDo-Verwaltung

- Neuer Aufgaben-Tab **Liste / List** (Default) gruppiert nach Kategorie in fester Reihenfolge, sortiert nach Priorität → Fälligkeit → Erstellungsdatum und bietet Kategorie-Multiselect sowie Sortier-Override (Priorität/Fälligkeit/Erstellt). Jede Aufgabe nutzt ein kompaktes Row-Layout mit Done-Toggle, Titel, Prioritäts-Badge (P1–P5), Fälligkeitsdatum (falls vorhanden) und Quadranten-Tag samt Farbcode; Details, Quick-Edit (Kategorie, Priorität, Fälligkeit, Quadrant) und Aktionen **Löschen / Delete** bzw. **Duplizieren / Duplicate** sind über einen platzsparenden Expander erreichbar. Erledigte Aufgaben werden aus den Ansichten ausgeblendet und am Seitenende gesammelt im Expander **Erledigte Aufgaben / Completed tasks** angezeigt.
- Aktionen zum Löschen erfordern nun eine explizite Bestätigung, um versehentliches Entfernen gespeicherter Aufgaben zu verhindern / Delete actions now ask for explicit confirmation to prevent accidentally removing stored tasks.
- Legacy-Persistenzdateien mit Datums-Strings oder naiven Zeiten werden beim Laden auf UTC-Datetimes normalisiert; unlesbare Werte landen sicher auf `None` statt Fehler zu werfen / Legacy persistence files with date strings or naive times are normalized to UTC datetimes on load; unreadable values safely fall back to `None` instead of raising errors.
- Erfassung über das Formular **ToDo hinzufügen / Add task** (Titel, optionales Fälligkeitsdatum, Quadrant) inklusive Button **AI: Quadrant vorschlagen**. Neu sind Kategorie-Auswahl (z. B. Stellensuche, Tagesstruktur), Priorität (1–5) sowie eine optionale Markdown-Beschreibung mit Vorschau. Zusätzlich lassen sich Wiederholungen (einmalig, täglich, werktags, wöchentlich, monatlich, jährlich) und eine E-Mail-Erinnerung (keine, 1 Stunde oder 1 Tag vor Fälligkeit; als Präferenz gespeichert) hinterlegen. Der abschließende Button **ToDo hinzufügen / Add task** ist als primärer Aktionsbutton hervorgehoben, damit das Absenden sofort ins Auge fällt / The final **ToDo hinzufügen / Add task** button is now styled as a primary action so submission stands out.
- Beim Abschluss wiederkehrender Aufgaben (nicht "einmalig") wird automatisch eine neue Instanz erzeugt: gleiche Inhalte, identische Wiederholung, Fälligkeitsdatum gemäß Rhythmus fortgeschrieben, Fortschritt zurückgesetzt und Meilensteine als Backlog kopiert / Completing a recurring task (anything but "once") automatically spawns the next instance with the same content and cadence, an advanced due date, reset progress, and milestones copied back to the backlog.
- Das Formular ist in drei Spalten gegliedert: links Titel mit integriertem Vorschlags-Dropdown (inkl. freier Eingabe), mittig Unterziele/Meilensteine, rechts Kategorie, Eisenhower-Quadrant, Priorität und Fortschritt / The form is split into three columns: left for the title with suggestion dropdown (including free input), middle for milestones, and right for category, Eisenhower quadrant, priority, and progress.
- Dropdown **Aufgabenvorschlag / Task suggestion** im Erfassungsformular mit inspirierten Vorlagen aus dem Screenshot: z. B. "Heute abschließen" (Fälligkeit heute, Priorität 2, 30-min-Zielzeit + Erinnerung 1 Stunde vorher), "Wöchentliche Routine" (Fälligkeit nächste Woche, Wiederholung wöchentlich, Erinnerung 1 Tag vorher) oder "Deep Dive" (2h-Ziel, Fälligkeit in 2 Tagen). Alle Vorlagen befüllen die Felder automatisch und lassen sich danach manuell anpassen / Task suggestion dropdown in the creation form with screenshot-inspired templates such as "Finish today" (due today, priority 2, 30-minute goal + 1h reminder), "Weekly routine" (due next week, weekly recurrence, reminder 1 day before), or "Deep Dive" (2h target, due in 2 days). Templates auto-fill the fields and stay editable.
- Das Dropdown merkt sich pro Session die zuletzt übernommene Vorlage (Standard: "Freie Eingabe"), damit bestehende Speicherstände ohne neuen Key keinen Fehler auslösen / The dropdown remembers the last applied template per session (default: "Free input") so existing persisted state without the new key stays error-free.
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
- Zusätzlich erkennt die KI spontane, bereits erledigte Aktivitäten aus dem Tagebuch (z. B. „Garage aufgeräumt“) und bietet an, daraus direkt eine erledigte Aufgabe mit Punkten anzulegen; du bestätigst den Vorschlag manuell / The AI also spots spontaneous completed activities from the journal (e.g., “cleaned the garage”) and offers to create a completed task with points that you can confirm.

## Kalenderansicht / Calendar view

- Monatlicher Überblick über ToDos mit Fälligkeitsdatum in einem 7-Spalten-Raster.
- Monatsauswahl über Date-Picker (nur Monat/Jahr relevant); die Ansicht zeigt ausschließlich offene Aufgaben pro Tag.
- Aufgaben erscheinen an ihrem jeweiligen Kalendertag mit Status-Emoji (⏳ offen, ✅ erledigt).
- Der heutige Kalendertag ist im Date-Picker und in der Rasteransicht durch Rahmen + leicht aufgehellten Hintergrund klar
  hervorgehoben / Today's date is visibly highlighted in the date picker and month grid with a border and subtle brightening.

## KPI-Dashboard

- Sofort sichtbare KPIs im Dashboard: **Erledigt gesamt / Done total**, **Heute erledigt / Done today**, **Kontinuität / Streak**, sowie **Zielerreichung / Goal progress** mit Tagesziel (Standard: 3 Abschlüsse pro Tag).
- Tagesziel-Eingabe im Einstellungs-Panel belässt den Widget-State bei Streamlit, sodass manuell gesetzte Werte auch nach einem Rerun unverändert bleiben / The daily goal input in the settings panel leaves widget state to Streamlit so manually set values stay unchanged after a rerun.
- KPI-Karten (Erledigt gesamt, Heute erledigt, Kontinuität, Zielerreichung) liegen direkt unter dem Seitentitel, damit der Fortschritt sofort sichtbar ist / KPI cards (done total, done today, streak, goal progress) sit right below the page title for instant visibility.
- Neues Top-Dashboard direkt unter dem Titel mit fünf Karten (eine pro Kategorie) inklusive Tagesfortschritt, Streak und offen vs. erledigt / New top-of-page dashboard with five category cards showing daily progress, streak, open vs. done.
- Tachometer für neu erfasste Aufgaben mit Wochenziel 7 (je 10 Punkte pro Aufgabe) direkt im KPI-Block / Tachometer inside the KPI block tracks newly added tasks with a weekly target of 7 and awards 10 points per task.
- Tageslogik: `done_today` wird automatisch auf den aktuellen Kalendertag bezogen; bei Datumswechsel werden die Tageswerte zurückgesetzt.
- Kontinuität (Streak): zählt zusammenhängende Tage mit mindestens einem Abschluss.
- Wochenansicht: Interaktives Plotly-Balkendiagramm der letzten 7 Tage mit Hover-Details und Zoom für die Abschlüsse, abgestimmt auf das dunkle Dashboard-Farbschema.
- Zwischen KPI-Karten und Wochenchart erscheinen die wichtigsten offenen Aufgaben der Quadranten **U+I** und **I+nU** inklusive Unterziele / Between the KPI cards and the weekly chart the most relevant open tasks from the **U+I** and **I+nU** quadrants are shown, including their milestones.
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
- Abschluss-Logik liegt zentral im Domain-Layer (`todos.toggle_complete`, Auto-Progress), sodass KPI- und Gamification-Updates genau einmal pro Abschluss ausgeführt werden, egal aus welchem UI-Pfad / Completion handling lives in the domain layer (`todos.toggle_complete`, auto progress), ensuring KPI and gamification updates run exactly once per completion across all UI paths.
- Drop-down für Gamification-Modus (Punkte, Abzeichen oder ein Modus mit motivierenden Sprüchen) über das Dashboard bzw. den Header; Fortschritt, Level und Motivation erscheinen im Gamification-Panel der Sidebar.
- Teilbelohnungen für Fortschritte: erledigte Meilensteine sowie 25/50/75 %-Fortschrittsmarker vergeben einmalige Bonuspunkte, inklusive Deduplizierung und History-Logging / Partial rewards for progress: completed milestones and 25/50/75% progress markers grant one-time bonus points with deduplication and history logging.

### Meilensteine & Priority-Board

- Unterteile Aufgaben in Meilensteine mit Aufwand (klein/mittel/groß), Punktevorschlag und optionaler Notiz. Ein Roadmap-Board mit Spalten Backlog → Ready → In Progress → Review → Done ermöglicht die visuelle Planung und Statuswechsel per Button.
- Punkte- und Komplexitätswerte lassen sich inline anpassen; im Gamification-Modus **Punkte & Level** wird die Punkteausbeute je Schritt sichtbar gehalten.
- AI-Unterstützung: Button **AI: Meilensteine vorschlagen / Suggest milestones** liefert passende Unterziele, die per Klick übernommen werden können; alternativ kannst du sie manuell erfassen oder entfernen.

## Coach

- Mikro-Coach liefert dreimal täglich kurze Hinweise mit 2h-Abkühlphase (Weekly-Review ausgenommen), inklusive Deduplikation pro Event-ID und begrenztem Verlauf.
- Abschluss-Events nutzen den Completion-Token, sodass wiederholtes Laden keine doppelten Nachrichten erzeugt.
- Täglicher Scan meldet bis zu drei überfällige bzw. bald fällige Aufgaben (≤48h) einmal pro Tag/Task; wöchentliche Reviews erscheinen je ISO-Woche einmal im Sidebar-Expander.

## KI-Features / AI features

- Toggle **AI aktiv / AI enabled** steuert, ob KI-Vorschläge verwendet werden; ohne Key greifen automatisch Fallback-Texte.
- **AI: Quadrant vorschlagen** schlägt einen Eisenhower-Quadranten vor (übersteuerbar).
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
