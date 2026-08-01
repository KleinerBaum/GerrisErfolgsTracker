# Google Workspace in Gerris Kompass einrichten

Diese Anleitung gilt für die private Sites-Webapp unter `web/`. Die gemeinsame
Google-Anmeldung verbindet Google Tasks, Calendar, Drive und Gmail mit einem
serverseitigen OAuth-Webclient. API-Schlüssel und ein Dienstkonto werden dafür
nicht verwendet.

## Zielbild und Datenhoheit

- **Google Tasks** ist die führende Quelle für alle Aufgaben. Die App verwendet
  die Aufgabenliste `Gerris Kompass` und legt sie bei Bedarf einmalig an.
- **Google Calendar** liest die ausdrücklich ausgewählten Kalender, pflegt
  Termine in eigenen Kalendern und kann nach Bestätigung neue sekundäre
  Kalender anlegen. Ohne erweiterte Freigabe bleibt `primary` der sichere
  Fallback.
- **Google Drive** bleibt auf den konfigurierten Stammordner begrenzt und wird
  ausschließlich gelesen.
- **Gmail** legt bearbeitbare Entwürfe an. Die App versendet keine Nachricht
  automatisch; der Versand bleibt eine ausdrückliche Handlung in Gmail.
- D1 speichert die Google-Verbindung und app-eigene Metadaten. Refresh-Tokens
  werden mit AES-GCM verschlüsselt und niemals an den Browser ausgeliefert.
- R2 bleibt die Ablage für ausdrücklich in Sites hochgeladene Dateien.

## 1. Google-Cloud-Projekt vorbereiten

Verwende das vorhandene Google-Cloud-Projekt und aktiviere nur die tatsächlich
benötigten APIs:

1. Google Tasks API
2. Google Calendar API
3. Google Drive API
4. Gmail API

Google Docs API, Google Sheets API und Gmail Postmaster Tools werden von diesem
Flow nicht benötigt. Lasse sie nur aktiviert, wenn eine andere, konkret
implementierte Funktion sie verwendet.

### Google Auth Platform

Öffne **Google Auth Platform** und richte die folgenden Bereiche ein:

1. **Branding**
   - App-Name: `Gerris Kompass`
   - Support-E-Mail und Entwicklerkontakt: eine erreichbare eigene Adresse
2. **Zielgruppe**
   - Bei einem privaten Google-Konto: `Extern`
   - Füge ausschließlich das eigene Google-Konto als Testnutzer hinzu.
   - Bei `Testing` laufen Autorisierungen mit Workspace-Datenscopes nach sieben
     Tagen ab, einschließlich des Refresh-Tokens. Für dauerhaften Betrieb muss
     der Veröffentlichungsstatus bewusst passend gewählt werden.
3. **Datenzugriff**
   - Trage nur die unten genannten Scopes ein.
   - Die App fordert sie schrittweise beim ersten Aufruf der jeweiligen
     Funktion an. Bereits gewährte Berechtigungen werden einbezogen.
4. **Clients**
   - Erstelle einen Client vom Typ **Webanwendung**.
   - Name: `Gerris Kompass Sites`
   - Autorisierte Weiterleitungs-URI:
     `https://gerris-kompass.gerri-f-aus-e.chatgpt.site/api/google/callback`
   - Für den serverseitigen Flow ist keine autorisierte JavaScript-Quelle
     erforderlich.

Der vorhandene Service Account ist für private Tasks, Calendar, Drive und Gmail
des angemeldeten Nutzers kein Ersatz. Erteile ihm dafür keine Schlüssel, keine
Domain-weite Delegierung und keine zusätzlichen Rollen.

## 2. Minimale, schrittweise OAuth-Scopes

Die gemeinsame Anmeldung verwendet zunächst `openid` und
`https://www.googleapis.com/auth/userinfo.email`. Fachliche Berechtigungen
werden erst angefordert, wenn die jeweilige Funktion gebraucht wird:

| Funktion | Scope | Zweck |
| --- | --- | --- |
| Aufgaben | `https://www.googleapis.com/auth/tasks` | Aufgaben erstellen, ändern, abschließen und löschen |
| Eigene Kalendertermine | `https://www.googleapis.com/auth/calendar.events.owned` | Termine in eigenen Kalendern lesen und pflegen |
| Geteilte Kalendertermine | `https://www.googleapis.com/auth/calendar.events.readonly` | Termine aus ausdrücklich ausgewählten, sichtbaren Kalendern nur lesen |
| Kalenderauswahl | `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Namen, Farben und Zugriffsrollen der sichtbaren Kalender lesen |
| Kalender anlegen | `https://www.googleapis.com/auth/calendar.calendars` | Nach ausdrücklicher Bestätigung einen sekundären Kalender erstellen |
| Privatkalender prüfen | `https://www.googleapis.com/auth/calendar.acls.readonly` | Freigaben des verwalteten Privatkalenders lesen, bevor sensible Automatik schreibt |
| Drive | `https://www.googleapis.com/auth/drive.readonly` | Inhalte im begrenzten Stammordner lesen und anzeigen |
| Gmail | `https://www.googleapis.com/auth/gmail.compose` | Bearbeitbare Gmail-Entwürfe anlegen |

Google kann einzelne Berechtigungen getrennt zur Auswahl stellen. Wenn ein
Scope nicht erteilt wird, bleibt nur die zugehörige Funktion deaktiviert; die
übrige App und bereits erlaubte Google-Funktionen bleiben benutzbar.

`drive.readonly` und `gmail.compose` sind eingeschränkte Scopes. Für eine
öffentliche oder breiter freigegebene Anwendung können Google-Verifikation und
eine Sicherheitsprüfung erforderlich werden. Die Sites-App bleibt deshalb
privat und nur für den Eigentümer freigegeben.

## 3. Werte in Sites hinterlegen

Öffne in Sites **Gerris Kompass → Einstellungen**. Lege die folgenden Werte
unter **Umgebungsvariablen** an:

| Name | Wert |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Client-ID der OAuth-Webanwendung |
| `GOOGLE_REDIRECT_URI` | `https://gerris-kompass.gerri-f-aus-e.chatgpt.site/api/google/callback` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | `1_XCyuIovFJQSQ80zVy3gVkBuM8Tutgwe` |
| `GOOGLE_TASKS_LIST_NAME` | `Gerris Kompass` |
| `GOOGLE_CALENDAR_ID` | `primary` |
| `OPENAI_MODEL` | `gpt-5.6-sol` |

Lege diese Werte ausschließlich unter **Geheimnisse** an:

| Name | Inhalt |
| --- | --- |
| `GOOGLE_CLIENT_SECRET` | Client-Secret der OAuth-Webanwendung |
| `GOOGLE_TOKEN_KEY` | eigener zufälliger Schlüssel mit mindestens 32 Byte |
| `OPENAI_API_KEY` | aktiver OpenAI-Projektschlüssel |

Ein sicherer Token-Schlüssel kann lokal beispielsweise mit
`openssl rand -base64 32` erzeugt werden. Zeige oder protokolliere den Wert
nicht. Eine Änderung von `GOOGLE_TOKEN_KEY` macht vorhandene verschlüsselte
Google-Verbindungen unlesbar; danach muss Google neu verbunden werden.

Lokale Werte können anhand von `web/.env.example` in einer ignorierten
`web/.env.local` gepflegt werden. Die Root-Datei `.env` und die Sites-Werte
sind getrennte Speicherorte: Eine lokale Änderung aktualisiert Sites nicht.

Nach jeder Änderung an Sites-Umgebungsvariablen oder -Geheimnissen muss eine
gespeicherte, validierte Version erneut **privat** bereitgestellt werden, damit
die neue Umgebungsrevision aktiv wird.

## 4. Öffentlichen iCal-Zugriff abschalten

Die frühere Integration hat einen öffentlichen iCal-Link verwendet. Nach
erfolgreicher Calendar-OAuth-Abnahme:

1. Entferne `GOOGLE_CALENDAR_ICAL_URL` aus den Sites-Geheimnissen.
2. Widerrufe beziehungsweise setze die öffentliche iCal-Adresse in den
   Google-Kalendereinstellungen zurück.
3. Prüfe, dass der Kalender nicht öffentlich freigegeben ist.

Eine iCal-Adresse gehört weder in Git noch in `.env.example`, Screenshots,
Protokolle oder Antworten.

## 5. Abnahme und privates Deployment

Vor der Veröffentlichung:

1. Prüfe in Sites unter **Freigabe**, dass nur der Eigentümer zugelassen ist.
2. Verbinde Google und kontrolliere, dass nur der erwartete Google-Nutzer
   angezeigt wird.
3. Lege eine Aufgabe an, ändere sie, schließe sie ab und lösche sie wieder.
   Alle Aufgabenansichten müssen denselben Google-Tasks-Stand zeigen.
4. Lege einen Testtermin an und entferne ihn wieder.
5. Prüfe die Kalenderauswahl, lege einen eindeutig benannten Testkalender an
   und entferne ihn anschließend in Google Kalender wieder.
6. Öffne den Drive-Stammordner und versuche keinen Zugriff außerhalb dieses
   Ordners.
7. Erzeuge einen Gmail-Entwurf, bearbeite ihn in Gmail und versende ihn nur
   manuell.
8. Trenne Google und prüfe, dass der Refresh-Token bei Google widerrufen und
   anschließend zusammen mit den privaten Kompass-Zusatzangaben zu Tasks aus
   D1 entfernt wird. Die eigentlichen Aufgaben bleiben in Google Tasks.
9. Führe die vollständigen Repository-Checks aus, speichere eine neue
   Sites-Version, deploye sie privat und prüfe anschließend die echten
   Produktionsendpunkte.

Wenn der OAuth-Client noch den Status `Testing` hat, gehört eine erneute
Verbindung nach sieben Tagen zum erwarteten Verhalten und ist kein
Anwendungsfehler.
