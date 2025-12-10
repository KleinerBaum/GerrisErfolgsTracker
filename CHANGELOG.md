# Changelog

## Unreleased
- Added centralized session-state initialization and constants for todo, KPI, and gamification data.
- Documented the new state management modules and defaults.
- Implemented ToDo CRUD workflow with Streamlit UI (Form, Filter, Edit/Delete/Complete toggle).
- Added Eisenhower-Matrix board with quadrant enum, sorting helpers, and per-task quadrant changes.
- Introduced KPI-Dashboard with done_total/done_today, streak, daily goal tracking, and a 7-day completion chart.
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
- Added automated linting (`ruff check .`) and testing (`pytest -q`) via GitHub Actions CI plus unit tests for KPIs,
  gamification, and Eisenhower logic.
