# Changelog

## Unreleased
- UI-Redesign mit kompakteren Expandern: Wochenstatistiken im KPI- und Kategorie-Dashboard sowie die Sidebar-Gamification öffnen sich nur bei Bedarf, während eine Kurzzeile Level und Punkte direkt in der Navigation zeigt.
- Aufgaben-Tab mit zweispaltigem Hero-Bereich, eingeklappten Filtern und Top-3-Vorschau pro Kategorie; weitere ToDos lassen sich per „Mehr anzeigen / Show more“-Expander aufklappen, um lange Listen zu entschlacken.
- Neues KI-Planungs-Panel auf der Aufgaben-Seite: analysiert Quadrant, Priorität, Fälligkeit, Streak und jüngste Stimmung, um tägliche Fokusaufgaben samt Puffertipp vorzuschlagen (Fallback aktiv ohne API-Key).
- Wochenrückblick berücksichtigt jetzt Journal-Stimmungen und hebt dominante Mood-Tags bzw. letzte Notizen in den KI-Zusammenfassungen hervor.
- Bidirektionale Verknüpfung von Aufgaben und Tagebuch: gespeicherte Alignment-Vorschläge hinterlegen jetzt die referenzierten Ziele/Aufgaben direkt im Tagebucheintrag, und die Aufgabenansicht zeigt die Tage mit Journal-Mentions als Hinweis.
- KI erkennt jetzt spontane, nicht geplante Aktivitäten im Tagebuch (z. B. „Garage aufgeräumt“), schlägt dafür erledigte Aufgaben inklusive Punktevergütung vor und legt sie nach Bestätigung samt Verknüpfung zum Eintrag an.
- Optionales Reflexions-Prompt nach dem Abschluss einer Aufgabe: ein kurzer Notiz-Dialog legt auf Wunsch einen Eintrag für den aktuellen Tag an und verknüpft ihn automatisch mit der erledigten Aufgabe.
- Optionaler OpenAI-ScriptComposer erzeugt Wochenrückblicke über strukturierte Outputs; ohne API-Key oder bei Fehlern greifen automatisch die erweiterten Fallback-Templates.
- Neues TaskAnalyzer-Modell `TaskAIProposal` mit Validierungen (Datenbereich, Milestone-Reihenfolge) und UI-Button **AI: Plan & Komplexität vorschlagen** inklusive Bearbeitung und expliziter Übernahme-Checkbox im ToDo-Formular.
- Coach-Templates massiv erweitert (~80+ Einträge) mit Kategorie- und Ton-Tags für Task-Completion, Nudges (überfällig/bald fällig), Streak/Daily-Goal-Meilensteine und Weekly-Reviews.
- Neuer DE-Sidebar-Coach-Template-Pack (30 Einträge) mit Talking-Head-Tonality und CTA-Metadaten in `gerris_erfolgs_tracker/coach/templates_de.py`.
- Gamification: Teilbelohnungen für Meilensteine und 25/50/75%-Fortschritt mit Deduplikation, neue Streak-/Task-Badges sowie Toast-Hinweise für Zwischenerfolge.
- E-Mail-Erinnerungen über Brevo mit dediziertem Scheduler/Worker, ENV-gestützter Konfiguration (Sender, Empfänger, Poll-Intervall, Vorlaufzeit) sowie Tests und Dokumentation.
- Zusätzliche Tests für den Composer-Fallback und die TaskAnalyzer-Validierungen sichern die neuen Flows ab.
- Neues Coach-Modul: Ereignisse werden per Event-ID dedupliziert, mit 2-Stunden-Cooldown und Tageslimit von drei Nachrichten pro Tag.
- Task-Completion triggert jetzt einen Coach-Hinweis aus statischen Templates (ohne OpenAI) inklusive Completion-Token-Idempotenz.
- Täglicher Scan liefert maximal drei Hinweise zu überfälligen bzw. kurzfristigen Fälligkeiten (≤48h) pro Tag/Task; wöchentlicher Review erscheint einmal pro ISO-Woche im Sidebar-Expander.
- Dokumentation erweitert (Persistenzpfade, Backup/Recovery, Troubleshooting, Dev-Setup) inklusive neuem `docs/TROUBLESHOOTING.md`-Leitfaden.
- Stellt `gerris_erfolgs_tracker.ui.tasks` als Export im Paket her, sodass `from gerris_erfolgs_tracker.ui import tasks` fehlerfrei funktioniert / Exposes `gerris_erfolgs_tracker.ui.tasks` from the package so `from gerris_erfolgs_tracker.ui import tasks` works without errors.
- Wiederkehrende Aufgaben erzeugen beim Abschluss automatisch eine nachfolgende Instanz mit fortgeschriebenem Fälligkeitsdatum, zurückgesetztem Fortschritt und aus dem Backlog kopierten Meilensteinen; eine Deduplizierung pro Abschlusszeitstempel verhindert doppelte Erstellungen / Completing recurring tasks now auto-creates the next instance with an advanced due date, reset progress, and milestones copied into the backlog, while per-completion deduplication avoids duplicate spawns.
- Aufgaben-UI aus `app.py` in `gerris_erfolgs_tracker/ui/tasks.py` ausgelagert; `app.py` ruft nur noch den Wrapper auf / Moved the tasks UI from `app.py` into `gerris_erfolgs_tracker/ui/tasks.py`, with `app.py` delegating to the wrapper.
- UI-Helfer wie Quadranten-Badge und Dark-Theme-Stile aus `app.py` in `gerris_erfolgs_tracker/ui/common.py` verschoben; `app.py` importiert sie als Einstiegspunkt weiter / Moved UI helpers such as the quadrant badge and dark theme styles from `app.py` into `gerris_erfolgs_tracker/ui/common.py` while keeping `app.py` as the entry point.
- Trennt Runtime- und Dev-Abhängigkeiten in `requirements.txt` und `requirements-dev.txt`, passt die README-Dev-Anleitung sowie den CI-Workflow an / Split runtime vs. dev dependencies into `requirements.txt` and `requirements-dev.txt`, updating the README dev setup and CI workflow.
- Begrenzte Gamification-Historie und verarbeitete Eventlisten per Ringpuffer (je 1 000 Einträge) für stabile Deduplikation ohne unbeschränktes Wachstum / Capped gamification history and processed event lists with 1,000-entry ring buffers to keep deduplication stable without unbounded growth.
- Korrigiert die Abschlusslogik, sodass KPI- und Gamification-Updates nur einmal pro Abschluss ausgelöst werden und `auto_done_when_target_reached` auch bei einem Zielwert von 0 korrekt migriert wird / Fixed completion handling to trigger KPI and gamification updates exactly once per completion and to migrate `auto_done_when_target_reached` even when the progress target is 0.
- Neues Analytics-Modul liefert Cycle-Time-Kennzahlen (Ø/Median), Backlog-Gesundheit sowie Abschluss-Heatmaps; KPI-Tab zeigt Overdue-Quote, Cycle-Time-Bar-Chart und Backlog-Donut an / New analytics module provides cycle time (avg/median), backlog health, and completion heatmaps; KPI tab now surfaces overdue ratio plus cycle-time bar and backlog donut charts.
- Entfernt die Überschriften **Gemeinsamer Kalender / Shared calendar** und **Kategorie-Überblick** sowie die Wochen-Grafik **Abschlüsse der letzten 7 Tage**, um das Ziele-Layout zu entschlacken / Removed the **Shared calendar** and **Category overview** headers plus the **Completions from the last 7 days** weekly chart to streamline the Goals layout.
- Überschrift **Ziele & Einstellungen / Goals & settings** von der Ziele-Seite entfernt, damit der Abschnitt ohne Titel eingebettet ist / Removed the **Goals & settings** header from the Goals page so the section sits inline without a title.
- Ziel-Aktionsleiste: Der Button **Ziel erstellen / Create goal** sitzt jetzt neben den Quick-Actions, die Hinweise im Einstellungs-Panel entfallen, und alle Buttons teilen sich dieselbe Primärfarbe für ein konsistentes Erscheinungsbild / Goal action row now places **Create goal** beside the quick actions, removes the intro helper text in the settings panel, and applies one primary color across all buttons for consistency.
- Sidebar-Gamification: Entfernt den Button **AI: Motivation**, damit die Seitenleiste schlanker bleibt / Sidebar gamification: removed the **AI: Motivation** button to keep the sidebar streamlined.
- Neues Abschluss-Widget **Gelöst / Completed** auf der Seite **Ziele**: offene Aufgaben auswählen, abschließen und sofort KPIs,
  Tachometer sowie Gamification-Popups (Level-Ups, Abzeichen) aktualisieren / New **Gelöst / Completed** widget on the **Goals**
  page lets you pick open tasks, mark them done, and immediately refresh KPIs, gauges, and cheerful gamification popups (level-ups,
  badges).
- Ziele-Seite zeigt jetzt den Google-Kalender **2025 von Carla, Miri & Gerrit** zwischen KPI-Dashboard und Einstellungen / Goals page now embeds the Google Calendar **2025 by Carla, Miri & Gerrit** between the KPI dashboard and settings.
- Standard-Startseite auf **Ziele / Goals** gesetzt, sodass die App direkt die Zielübersicht lädt / Default landing page switched to **Ziele / Goals** so the app opens on the goals overview.
- Tagesziel-Sektion aus der Seite **Ziele** entfernt und das Ziel-Canvas konsequent zweispaltig angeordnet / Removed the daily target section from the **Ziele** page and organized the goal canvas in a consistent two-column layout.
- Alle verbleibenden englischen UI-Texte entfernt; Labels, Hinweise und Gamification-Meldungen sind jetzt ausschließlich auf Deutsch.
- Oberfläche durchgehend auf Deutsch: Sprachumschalter entfernt und sichtbare Titel/Labels ohne englische Zusätze.
- Hinweisblock zur Sprache aus der Sidebar gestrichen, um die Navigation kompakter zu halten / Removed the language notice block from the sidebar to keep navigation compact.
- Neues Einstellungs-Panel im Abschnitt **Ziele im Überblick / Goals at a glance**, um gezielt Aufgaben auszuwählen, die in KPI-Dashboard und Kategorien einfließen (z. B. Fokus-Tasks) / New **Settings** expander inside **Goals at a glance** lets you pick which tasks feed the KPI dashboard and category charts (e.g., focus tasks).
- Formular **ToDo hinzufügen / Add task** in drei Spalten umgebaut: Titel mit integriertem Aufgabenvorschlag/Dropdown (inkl. "Freie Eingabe"), Unterziele separat und Meta-/Quadranten-/Prioritätsfelder plus Fortschritt rechts / **Add task** form now uses three columns with the title plus suggestion dropdown (including "Free input"), milestones in the middle, and category/quadrant/priority plus progress on the right.

- KPI-Tachometer für neu angelegte Aufgaben mit Wochenziel 7 und 10 Punkten pro Aufgabe zur schnellen Erfassung im Dashboard / KPI tachometer for newly added tasks with a weekly target of 7 and 10 points per task to keep the dashboard aligned.

- Erweitertes **Ziel-Canvas** mit Titel, Fokus-Kategorien, Zeitfenster, Start-/Zieldatum, Check-ins, messbarem Zielwert + Einheit, Erfolgskriterien, Motivation, Risiken/Absicherung, nächstem Schritt und Feier/Belohnung – alles zweisprachig im Ziel-Setup pflegbar.
- Behebt Streamlit-Fehler im ToDo-Formular, indem alle Meilenstein-Buttons innerhalb des Formulars als Submit-Buttons laufen / Fixes Streamlit errors in the ToDo form by using submit buttons for all milestone actions inside the form.
- Neue Aufgabenvorlagen im Erfassungsformular mit inspirierten Feldern aus dem Screenshot (Fälligkeit, Priorität, Reminder, Zeitziel), die per Dropdown übernehmbar sind / New task templates in the create form inspired by the screenshot (due date, priority, reminder, time goal) and selectable via dropdown.
- KI-gestützter Abgleich neuer Tagebucheinträge mit vorhandenen Zielen/Aufgaben inklusive manueller Freigabe der vorgeschlagenen Punkte-Updates / AI-assisted matching of new journal entries against existing goals/tasks with manual approval for the proposed point updates.
- KI erkennt jetzt auch Teilfortschritte aus Tagebucheinträgen (Meilensteine abhaken, Fortschritt in % anheben) und bietet die Updates zur Bestätigung an.
- Behebt einen fehlenden Import für Milestone-Vorschlags-Schemas, sodass die Streamlit-App ohne `ImportError` startet / Fixed missing milestone suggestion schema export so the Streamlit app starts without `ImportError`.
- Wiederholbare Aufgaben mit Auswahl für einmalig, werktags, wöchentlich, monatlich oder jährlich sowie optionale E-Mail-Erinnerungen 1 Stunde oder 1 Tag vor Fälligkeit im Erfassungs- und Quick-Edit-Formular / Repeatable tasks with one-time, weekday, weekly, monthly, or yearly cadence plus optional email reminders 1 hour or 1 day before due dates in the create and quick-edit forms.
- Überarbeitete Tagebuch-Seite ohne Kopfzeile und Export-Block: Auslöser & Reaktionen, Gedanken-Challenge, Selbstfürsorge und Dankbarkeit liegen nun in einer vierteiligen Zeile; Dankbarkeitsfelder erscheinen progressiv beim Ausfüllen und werden migriert/gespeichert als Liste / Journal page cleanup removes the header and export block: triggers & reactions, thought challenge, self-care, and gratitude sit in a single four-column row; gratitude inputs reveal progressively as you fill them and persist via a migrated list.
- Lösch-Aktionen bei Aufgaben verlangen eine explizite Bestätigung, um gespeicherte Daten nicht versehentlich zu entfernen / Task delete actions now require explicit confirmation to avoid accidentally removing stored data.
- Kompakte Aufgabenlisten-Zeilen mit schmaleren Rändern, farbigen Quadranten-Tags und eingeklappten Details-Expandern für sichtbar mehr Aufgaben pro Bildschirm.
- Markiert den aktuellen Tag im Date-Picker und in der Kalenderansicht durch klaren Rahmen und sanft helleren Hintergrund, der im Dark Theme gut lesbar bleibt.
- Begrenzte die Titel- und Beschreibungsfelder im Formular **ToDo hinzufügen / Add task** auf ca. 50 % Breite für eine kompaktere Desktop-Ansicht, während Mobilgeräte weiter sauber stapeln / Limited the **Add task** title and description inputs to ~50% width on desktop for a tidier layout while keeping mobile stacking intact.
- Ergänzt einen Session-State-Schlüssel für zuletzt angewendete Aufgabenvorlagen, sodass Importfehler vermieden und bestehende JSON-Speicherstände kompatibel bleiben / Added a session-state key to remember the last applied task template, preventing import errors and keeping existing JSON storage compatible.
- Das Gamification-Panel in der Sidebar verzichtet auf zusätzliche Zwischenüberschriften und zeigt nur den Modus-Drop-down plus Inhalte pro Variante (Punkte, Abzeichen, Avatar) für ein kompakteres Layout / The sidebar gamification panel now skips extra subheaders and keeps only the mode drop-down plus per-mode content (points, badges, avatar) for a cleaner layout.
- Gamification-Variante und Sicherheitshinweise sind jetzt zentral in der Sidebar gebündelt (Gamification-Select, Storage-Warnung, Session-Reset) und werden nicht mehr pro Seite dupliziert / Gamification mode selection and the safety notice/reset controls now live once in the sidebar instead of on each page.
- Ziele-Seite mit aufgeräumtem Layout: Schnellzugriff entfernt, Tagesziel-Controls in einer kompakten Spaltenreihe mit ausgerichteten Buttons belassen die Funktionalität zum Speichern und KI-Vorschlag / Goals page layout streamlined by removing the quick-access header and aligning the daily target controls in a compact multi-column row while keeping save and AI suggestion actions.
- Fixed a `StreamlitDuplicateElementKey` crash by assigning a context-specific key to the "AI: Motivation" button in the gamification panel (e.g., sidebar usage).
- Added a sidebar language toggle (Deutsch/English) that renders the UI in a single language instead of mixed bilingual labels.
- Harmonized Eisenhower-Quadranten mit neuen Labels (U+I, I+nU, nI+U, nI+nU) und eindeutigen Farben für Board-Spalten, Listen-Badges und Detail-Ansichten / Harmonized Eisenhower quadrants with new labels (U+I, I+nU, nI+U, nI+nU) and distinct colors across board columns, list badges, and detail views.
- Gamification-Übersicht in die Sidebar verschoben (Level, Punkte, Badges, Motivation) und das Panel **Ziele & Einstellungen / Goals & settings** stärker in Spalten organisiert für AI-Toggle und Tagesziel-Buttons / Moved the gamification overview into the sidebar and expanded the Goals & settings panel with more multi-column controls for AI and daily goal actions.
- Added daily journal tab with guided form per day (mood tags, triggers, thought challenge, self-care, gratitude suggestions) linked to categories, explicit save plus JSON/Markdown export, and schema migration tests.
- Fixed the journal JSON export to serialize date fields as `YYYY-MM-DD` strings, preventing `Object of type date is not JSON serializable` crashes during download.
- Restructured navigation into three sidebar pages (Ziele/Goals, Aufgaben/Tasks, Tagebuch/Journal) with the goal, AI, and gamification settings consolidated on the Goals page and clearer task/journal workspaces.
- Modernisierte UI: weite Seitenbreite mit eingeklappter Sidebar, sofort sichtbares KPI-Dashboard, neu gruppierte Sidebar-Quick-Controls sowie ein dezenter Gradient statt Hintergrundbild.
- Highlighted the **ToDo hinzufügen / Add task** submit button as a primary action to guide form submissions.
- Added OneDrive-aware persistence: state files default to the synced `GerrisErfolgsTracker` folder (configurable via `GERRIS_ONEDRIVE_DIR`) to keep mobile and app data aligned, including bilingual UI notice and documentation updates.
- Fixed ToDo creation form buttons to stay inside their Streamlit form columns and avoid `st.form_submit_button` API errors.
- Fixed dark theme CSS injection by treating the background image style as literal markup to avoid runtime NameErrors in Streamlit.
- Fixed quick-edit task saves by keeping the bilingual "Speichern / Save" action inside its Streamlit form to prevent `st.form_submit_button` errors when editing tasks from the list view.
- Added a branded background image (`images/background.png`) with a subtle overlay to keep the dark-green theme cohesive.
- Polished the Streamlit UI with a cohesive dark-green dashboard theme (cards, list rows, expanders), simplified text-based
  status labels, and dark-aligned Plotly charts for categories and weekly completions.
- Added optional local JSON persistence for todos, KPIs, and settings including a Community Cloud notice about potential
  ephemeral storage, plus documentation reminders to keep API keys in secrets only.
- Added optionale Fortschrittsregeln / progress rules je Aufgabe (Zielwert + Einheit, aktueller Stand, Auto-Abschluss, Markdown-Kriterien) samt UI im Formular und Expander sowie Ereignis-basiertem Fortschrittsupdate mit Duplikat-Schutz.
- Added per-task Kanban boards (Backlog/Doing/Done) with subtask cards, left/right move buttons, progress indicator inside each task expander, and default data-model columns.
- Refactored the main task workflow into a default list tab with category grouping, priority→due→created sorting, filters (done toggle, category multi-select, sort override), detail expanders with quick edits, and tabs for Eisenhower board plus calendar to keep both views available.
- Added task categories (Stellensuche, Administratives, Familie & Freunde, Drogen, Tagesstruktur), priority (1–5) and markdown descriptions across the ToDo model, state migration, and UI.
- Dokumentation zu Deployment-Optionen ergänzt (lokal und Streamlit Cloud) sowie klargestellt, dass alle Daten im Session-State
  bleiben.
- Added centralized session-state initialization and constants for todo, KPI, and gamification data.
- Documented the new state management modules and defaults.
- Behebt einen Streamlit-Session-State-Fehler beim Übernehmen von Aufgabenvorlagen im ToDo-Formular / Fixes a Streamlit session state error when applying task templates in the ToDo form.
- Implemented ToDo CRUD workflow with Streamlit UI (Form, Filter, Edit/Delete/Complete toggle).
- Added Eisenhower-Matrix board with quadrant enum, sorting helpers, and per-task quadrant changes.
- Neu: Meilenstein-Board pro Aufgabe mit Spalten Backlog → Ready → In Progress → Review → Done, inklusive Punkte/Komplexitäts-
  Feldern, inline-Edit sowie AI-gestützten Vorschlägen und Gamification-Punkteanzeige im Modus „Punkte & Level“ / New per-task
  milestone board with Backlog → Ready → In Progress → Review → Done columns, point/complexity fields, inline edits, AI-assisted
  suggestions, and gamification point display when using the “Points & Levels” mode.
- Introduced KPI-Dashboard with done_total/done_today, streak, daily goal tracking, and a 7-day completion chart.
- Rebuilt the weekly completion chart as an interactive Plotly bar chart with hover details, zooming, and the dark-green theme color.
- Introduced Gamification loop with quadrant-based points, badge awards (First Step, Consistency 3, Double Digits), and level
  progress visualization including anti-duplicate safeguards.
- Added calendar month view with date picker, open-task filter, and daily task placement.
- Added OpenAI integration with structured Outputs (`responses.parse`) and Pydantic schemas for todo categorization, goal
  suggestions, and motivational prompts; includes retries and timeouts.
- Added AI toggle plus UI buttons for quadrant suggestions, daily goal recommendations, and motivational messages with
  fallback behavior when no `OPENAI_API_KEY` is present.
- Improved AI goal suggestion flow to repopulate the daily target field via session-friendly reruns and added regression tests.
- Added settings sidebar for AI toggle and daily goal updates, reset workflow for session data, and safety/info notices
  highlighting session-only storage and non-crisis scope.
- Added sidebar drop-down to choose gamification style (points, badges, or a new avatar option with bilingual motivational quotes).
- Logged gamification completion events with tokens to prevent duplicate rewards and covered the history with regression tests.
- Added automated linting (`ruff check .`) and testing (`pytest -q`) via GitHub Actions CI plus unit tests for KPIs,
  gamification, and Eisenhower logic.
- Hardened the ToDo form by decoupling AI quadrant prefills from widget keys and resetting inputs via reruns to avoid
  StreamlitAPIExceptions, backed by regression tests.
- Added a category-level dashboard with per-domain goals, streaks, and a stacked 7-day Plotly view plus sidebar goal inputs.
