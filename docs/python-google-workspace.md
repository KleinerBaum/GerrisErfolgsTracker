# Google Workspace in Streamlit

Diese Anleitung beschreibt ausschließlich die Python-/Streamlit-Integration. Für die private Sites-Webapp gilt [`google-workspace-sites.md`](google-workspace-sites.md).

## Konfiguration

Werte kommen aus `st.secrets` oder Environment-Variablen:

- OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Kalender: `GOOGLE_CALENDARS_JSON` oder die `CAL_*`-Variablen
- Token-Backend: `GOOGLE_TOKEN_STORE_BACKEND`, `GOOGLE_TOKEN_DB_PATH`, optional `GOOGLE_TOKENS_JSON` und `GOOGLE_TOKENS_JSON_PATH`
- Optional: `BREVO_*` für Reminder-Versand

Tokens und persönliche State-Daten gehören nicht in Git oder in `gerris_state.json`. Der lokale SQLite-Tokenstore muss auf einem privaten, restriktiv berechtigten Verzeichnis liegen.

Die Python-Scopes sind featurebezogen, aber aktuell breiter als der Sites-Flow. Änderungen an `gerris_erfolgs_tracker/integrations/google/scopes.py` benötigen deshalb eine gesonderte Scope-/OAuth-Abnahme.

Ohne OAuth degradieren Kalenderfunktionen auf den dokumentierten iCal-/Beispielpfad. Diese Fallbacks sind keine gemeinsame Quelle mit dem Sites-Kalender.
