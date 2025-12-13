# Changelog

## Unreleased
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
- Added sidebar drop-down to choose gamification style (points, badges, or the new Dipl.-Psych. Roß avatar with bilingual motivational quotes).
- Logged gamification completion events with tokens to prevent duplicate rewards and covered the history with regression tests.
- Added automated linting (`ruff check .`) and testing (`pytest -q`) via GitHub Actions CI plus unit tests for KPIs,
  gamification, and Eisenhower logic.
- Hardened the ToDo form by decoupling AI quadrant prefills from widget keys and resetting inputs via reruns to avoid
  StreamlitAPIExceptions, backed by regression tests.
- Added a category-level dashboard with per-domain goals, streaks, and a stacked 7-day Plotly view plus sidebar goal inputs.
