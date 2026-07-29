# Google Workspace Setup

## Sites-Webapp (`web/`)

Die Sites-Version nutzt für den ersten sicheren Ausbau keine in der Anwendung
gespeicherten Google-OAuth-Tokens:

- Drive-Dateien werden über ihre Google-Drive-Links verknüpft, in der
  Google-Vorschau angezeigt und direkt von Google heruntergeladen.
- Kalendertermine werden lesend über den konfigurierten iCal-Link angezeigt.
- Zahlungserinnerungen bleiben im privaten D1-Speicher und öffnen bei Bedarf
  einen Google-Kalender-Entwurf. Vor dem Speichern ist die Sichtbarkeit
  **Privat** zu prüfen.
- Gmail-Aktionen öffnen einen vorausgefüllten Entwurf; die App liest oder
  versendet keine Nachrichten ohne weitere OAuth-Anbindung.

Die dafür verwendeten Variablen stehen in `web/.env.example`. Der angegebene
öffentliche iCal-Link darf keine vertraulichen Ereignisse enthalten. Für einen
späteren bidirektionalen Sync ist ein eigener, minimal berechtigter OAuth-Flow
mit serverseitigem Token-Speicher erforderlich.

## Überblick / Overview
Dieser Leitfaden beschreibt die nötigen Schritte in der Google Cloud Console und zeigt, wo die Werte in der App hinterlegt werden. / This guide lists the required Google Cloud Console steps and where to paste the values in the app.

## 1) Google Cloud Projekt anlegen / Create a Google Cloud project
1. Öffne die [Google Cloud Console](https://console.cloud.google.com/).
2. Erstelle ein neues Projekt oder wähle ein bestehendes aus.

## 2) APIs aktivieren / Enable APIs
Aktiviere mindestens die APIs, die du nutzen möchtest (Read-only):
- Google Calendar API
- Gmail API
- Google Tasks API
- Google Drive API
- Google Sheets API

## 3) OAuth Consent Screen konfigurieren / Configure OAuth consent screen
1. Setze den Anwendungstyp auf „Extern“.
2. Füge eine App-Name und Support-E-Mail hinzu.
3. Ergänze die benötigten Scopes (Read-only für die oben aktivierten APIs).
4. Füge Testnutzer hinzu (falls notwendig).

## 4) OAuth Client erstellen / Create OAuth client
1. Navigiere zu **APIs & Services → Credentials**.
2. Erstelle **OAuth client ID** (Typ: Web application).
3. Hinterlege Redirect-URIs (z. B. lokal `http://localhost:8501` oder Streamlit Cloud URL).

## 5) Werte in die App übernehmen / Paste values into the app
Lege lokale Secrets an (nicht committen):

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
```

Trage anschließend in `.streamlit/secrets.toml` ein:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- Optional: `TOKEN_STORE_*` und `TOKEN_ENCRYPTION_KEY`

Alternativ kannst du die gleichen Werte als Umgebungsvariablen setzen.
