# Changelog

## Unreleased
- Wiederholbare Aufgaben mit Auswahl für einmalig, werktags, wöchentlich, monatlich oder jährlich sowie optionale E-Mail-Erinnerungen 1 Stunde oder 1 Tag vor Fälligkeit im Erfassungs- und Quick-Edit-Formular / Repeatable tasks with one-time, weekday, weekly, monthly, or yearly cadence plus optional email reminders 1 hour or 1 day before due dates in the create and quick-edit forms.
- Standard-Startseite auf **Aufgaben / Tasks** gesetzt, damit die App direkt in der ToDo-Ansicht öffnet / Default start page set to **Aufgaben / Tasks** so the app opens straight into the task view.
- Überarbeitete Tagebuch-Seite ohne Kopfzeile und Export-Block: Auslöser & Reaktionen, Gedanken-Challenge, Selbstfürsorge und Dankbarkeit liegen nun in einer vierteiligen Zeile; Dankbarkeitsfelder erscheinen progressiv beim Ausfüllen und werden migriert/gespeichert als Liste / Journal page cleanup removes the header and export block: triggers & reactions, thought challenge, self-care, and gratitude sit in a single four-column row; gratitude inputs reveal progressively as you fill them and persist via a migrated list.
- Lösch-Aktionen bei Aufgaben verlangen eine explizite Bestätigung, um gespeicherte Daten nicht versehentlich zu entfernen / Task delete actions now require explicit confirmation to avoid accidentally removing stored data.
- Kompakte Aufgabenlisten-Zeilen mit schmaleren Rändern, farbigen Quadranten-Tags und eingeklappten Details-Expandern für sichtbar mehr Aufgaben pro Bildschirm.
- Markiert den aktuellen Tag im Date-Picker und in der Kalenderansicht durch klaren Rahmen und sanft helleren Hintergrund, der im Dark Theme gut lesbar bleibt.
- Begrenzte die Titel- und Beschreibungsfelder im Formular **ToDo hinzufügen / Add task** auf ca. 50 % Breite für eine kompaktere Desktop-Ansicht, während Mobilgeräte weiter sauber stapeln / Limited the **Add task** title and description inputs to ~50% width on desktop for a tidier layout while keeping mobile stacking intact.
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
