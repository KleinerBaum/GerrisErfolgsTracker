> **Veraltet:** Diese Anleitung beschreibt den früheren iCal-/Drive-Aufbau. Für die aktuelle private Sites-Webapp gilt [google-workspace-sites.md](google-workspace-sites.md); für die Python-Laufzeit gilt [python-google-workspace.md](python-google-workspace.md).
>
> Die folgenden historischen Schritte werden nicht mehr als aktueller Setup-Vertrag verwendet.

# Google Workspace Setup

## Sites-Webapp (`web/`)

Die Sites-Version nutzt einen eigenen, minimal berechtigten OAuth-Flow:

- Drive-Ordner und -Dateien werden live mit dem Scope
  `https://www.googleapis.com/auth/drive.readonly` geladen.
- Refresh-Tokens werden mit AES-GCM verschlüsselt und pro angemeldetem
  Sites-Benutzer in D1 gespeichert. Tokens werden nie an den Browser
  ausgeliefert.
- Der Server beschränkt alle Datei- und Ordnerzugriffe auf den konfigurierten
  Stammordner „Unterlagen und Dokumente“.
- Kalendertermine werden lesend über den konfigurierten iCal-Link angezeigt.
- Zahlungserinnerungen bleiben im privaten D1-Speicher und öffnen bei Bedarf
  einen Google-Kalender-Entwurf. Vor dem Speichern ist die Sichtbarkeit
  **Privat** zu prüfen.
- Gmail-Aktionen öffnen einen vorausgefüllten Entwurf; die App liest oder
  versendet keine Nachrichten ohne weitere OAuth-Anbindung.

Die dafür verwendeten Variablen stehen in `web/.env.example`. Der angegebene
öffentliche iCal-Link darf keine vertraulichen Ereignisse enthalten.

Für den Sites-Drive-Explorer müssen folgende Laufzeitwerte gesetzt werden:

- `GOOGLE_DRIVE_ROOT_FOLDER_ID`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REDIRECT_URI`
- `GOOGLE_DRIVE_TOKEN_KEY` (ein langer, zufälliger geheimer Wert)

Als autorisierte Redirect-URI muss exakt die veröffentlichte Sites-Adresse mit
dem Pfad `/api/drive/callback` im Google-OAuth-Client eingetragen werden.

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
3. Hinterlege für die Sites-App exakt
   `https://<sites-adresse>/api/drive/callback` als Redirect-URI. Lokale
   Entwicklung kann zusätzlich eine eigene lokale Callback-Adresse erhalten.

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
